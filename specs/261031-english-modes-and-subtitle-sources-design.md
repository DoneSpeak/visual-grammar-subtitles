# 英语学习模式与字幕源（精简版）

> 设计稿 · 2026-10-31 · 承接 `261031-english-subtitle-learning-prd-tdd.md`
> 范围收窄：只做**词性 / 短语 / 词块 / 主谓宾定状补从句**四类基础拆分。不做 NGSL、连读缩略、时态语态、词族等进阶层——高阶学习者不用看视频学这些。

## 0. 结论

1. 英文内置模式收敛为 5 个：**原文 / 词性 / 短语 / 词块 / 句子成分**。
2. 删除 `exam-words` 内置模式；考试词表保留为可选 feature，不再默认暴露。
3. 句子成分是本轮主要增量：现有 `EnAnalyzer` 只标 subject/object/predicate/adverbial/modifier（`python/server/providers.py:143`），缺**定语、补语、从句**，且按 token 逐词标注，没有成句结构。
4. 英语字幕源接 **SubDL 为主、OpenSubtitles 为补充**，API key 由用户自填，存 `chrome.storage.local`。
5. 字幕包加 `language` 字段并按语言分 UI；这是当前数据模型缺口（`src/shared/library.ts:22`）。

## 1. 模式与 feature

内置模式（`src/languages/en/features.ts` 的 `BUILT_INS`）：

| 模式 | features | 标注内容 |
|---|---|---|
| 原文 | `[]` | 字幕文本 |
| 词性 | `['pos']` | 按 UPOS 着色 |
| 短语 | `['expression']` | 短语动词、习语、固定搭配 |
| 词块 | `['chunk']` | NP / VP / PP 连续块 |
| 句子成分 | `['syntax']` | 主/谓/宾/定/状/补 + 从句 |

Feature 列表：

| id | 来源 | 元素 |
|---|---|---|
| `pos` | local | 8 个 POS 组 |
| `expression` | local | `expression.phrase:all` |
| `chunk` | local | `chunk.phrase:{first,middle,last,only}` |
| `syntax` | remote | `syntax.role:{subject,predicate,object,attributive,adverbial,complement,clause}` |
| `exam` | local | `exam.tags:all`，保留但**不进内置模式** |

`ROLE_ELEMENTS` 需从 6 个扩到 7 个（加 `attributive`、`complement`、`clause`），并修正 `src/languages/th/features.ts:12` 按数组下标取色的写法，改为按 id 取色，避免新增元素改变泰语配色。

## 2. 句子成分映射（本轮核心）

`python/server/providers.py` 的 `EnAnalyzer` 改为一个显式的 `GrammarRuleMapper`，按依存树产出 span，而不是逐 token 上色。原则：**能从依存标签确定的才标，不能确定的输出 `unknown`，不强行着色**。

| 教学成分 | spaCy dep | 处理 |
|---|---|---|
| 主语 | `nsubj`, `nsubjpass`, `csubj` | 取子树 span；`csubj` 同时标从句 |
| 谓语 | `ROOT`, `aux`, `auxpass` | 合并助动词/否定/主要动词为一个 span |
| 宾语 | `obj`, `dobj`, `iobj` | 取 head 子树；介词宾语归 `pobj`，可选并入宾语 |
| 定语 | `amod`, `acl`, `relcl` | 修饰名词的 span；`relcl` 同时标定语从句 |
| 状语 | `advmod`, `advcl`, `npadvmod`, `obl` | `advcl` 同时标状语从句 |
| 补语 | `acomp`, `attr`, `oprd`, `xcomp`, `ccomp` | 系表结构标表语/补语；`ccomp` 同时标名词性从句 |
| 从句 | `relcl → attributiveClause`、`advcl → adverbialClause`、`ccomp/csubj → nominalClause` | 作为独立 label 叠加，不覆盖主成分 |

实现要点：

- 输出 `syntax.role` span；同一字符可同时有 `object` 与 `clause`，由模式决定视觉优先级。
- 谓语 span 由 ROOT 向下收集 `aux/auxpass/neg` 子节点；`ROOT` 不是动词时降级为 `predicate` 仅当存在 `nsubj`，否则不标。
- 被动结构：`nsubjpass + auxpass` → 主语 + 谓语（`voice=passive` 可选属性，本期可不做可视化）。
- 无法判断（口语省略、碎片句、模型标签缺失）→ 不输出该成分。
- 保留现有 API 契约与 `trackHash`，不新增 schema 字段。

验收基准：20 条典型美剧字幕，覆盖简单 SVO、系表、宾语从句、定语从句、状语从句、被动、口语省略；逐条记录标错案例。

## 3. 英语分词（只做标注正确性所需）

保留 `Intl.Segmenter('en')` 与现有"surface 拼回原文"约束。只加四条：

1. **跨 cue 句子组装**：相邻 cue 若前一条不以 `.?!` 结尾且间隔 < 2s，拼成一句再分词/解析；token 保留 cue 映射。短语匹配与句法解析都依赖这个。
2. **SDH 标签剔除**：`[door slams]`、`(laughs)`、`♪ music ♪` 识别为 `sdh`，不参与学习标注。
3. **撇号归一化**：`’` → `'` 仅用于匹配，不回写 surface。
4. **连字符复合词**：`well-known` 保持一个 token；`lookupKeys` 额外产出拆分形式。

不做：缩略词拆分、连读表、词族、时态语态、CEFR/NGSL。现有 `tokenizer.ts` 的缩略词与词形处理够用。

## 4. 字幕来源（英语）

| 来源 | 接口 | 建议 |
|---|---|---|
| **SubDL** | 官方 REST API，按剧/季/集/IMDb | **主选**；用户自填 key |
| **OpenSubtitles.com** | REST API，需账号 + key | 可选补充 |
| Addic7ed / TVsubtitles | 无官方 API，抓取 | 不接（ToS + 反爬） |
| Subscene | 2024-05 关站 | 排除 |

**Key 策略**：用户在 options 里为每个 provider 填 API key，存 `chrome.storage.local`；不打包进扩展。缺 key 时来源卡显示"配置 key"，不抛错。

**未验证**：SubDL 官方文档本次抓取被拦截（域名不可达）。接入前必须人工核对：是否强制 key、限流、下载鉴权、CORS 是否允许扩展直连。OpenSubtitles 免费额度（报道 20 req/day）亦未实测。

Provider 契约（`src/features/scraper/providers.ts`）：

```ts
export type ProviderId = 'kitsunekko' | 'subdl' | 'opensubtitles';
export type SubtitleProvider = {
  id: ProviderId;
  language: LanguageId;          // 每个 provider 只服务一种语言
  requiresKey: boolean;
  search(query: string): Promise<SeriesHit[]>;
  listEpisodes(hit: SeriesHit): Promise<EpisodeFile[]>;
  fetch(episode: EpisodeFile): Promise<FetchedSubtitle[]>;
};
```

## 5. 字幕包按语言分 UI

### 5.1 数据模型

```ts
export type LibraryPack = {
  id: string;
  title: string;
  language: LanguageId;   // 新增
  origin: SubtitleOrigin;
  addedAt: number;
  updatedAt: number;
};

export type SubtitleOrigin =
  | { kind: 'kitsunekko'; /* 现有字段 */ }
  | { kind: 'provider'; provider: ProviderId; seriesId?: string; season?: number; episode?: number; release?: string; url?: string; importedAt: number }
  | { kind: 'local'; /* 现有字段 */ };
```

### 5.2 迁移

- 读旧 `lib:packs`：`language = origin.kind === 'kitsunekko' ? 'ja' : detectLanguageId(包内第一条字幕前 4000 字)`，检测失败回退 `DEFAULT_LANGUAGE`。
- 写回时补 `language`；用 `lib:version = 2` 保证只迁移一次。

### 5.3 UI

- **PacksPage**：按 `ui:learningLanguages` 出语言 tab（日语 / 英语）。每个 tab 只显示该语言的 provider 与本地导入；本地导入自动检测语言，可手改。
- **Popup**：包列表按语言分组，包名旁 `JA/EN` 徽标；绑定与自动套用按当前字幕层语言过滤。
- **content script**：`matchPackByTitle`（`src/entrypoints/content/index.ts:1101`）加语言过滤，避免日语包绑到英语层。

## 6. 实施顺序

| 阶段 | 交付 | 验收 |
|---|---|---|
| M1 | `LibraryPack.language` + 迁移 + PacksPage tab + popup 分组 + 绑定语言过滤 | 旧包不丢；`pnpm typecheck && pnpm test` |
| M2 | 英文模式收敛为 5 个；`ROLE_ELEMENTS` 扩到 7；泰语配色改按 id | ModesPage 英文 tab 正确；`pnpm test` |
| M3 | `EnAnalyzer` 语法映射器 + 20 条基准 | 主谓宾定状补从句可标；无法判断不标 |
| M4 | SubDL provider + key 配置 + 导入 | 填 key 后按剧/季/集导入；缺 key 有提示 |

## 7. 待决 / 未验证

1. SubDL 端点已由官方文档检索确认：`GET https://api.subdl.com/api/v1/subtitles`，`api_key` 必填，
   支持 `film_name`/`sd_id`/`type=tv`/`season_number`/`episode_number`/`languages=EN`/`subs_per_page`。
   下载链接按 `https://dl.subdl.com` + 响应中的 `url` 拼接。**仍未实测**：真实响应字段名、限流、
   下载是否需要额外鉴权、扩展直连是否被 CORS 拦截（options 页属扩展页，按 MV3 应豁免，但未验证）。
2. 句子成分的视觉优先级已定：role 先、clause 后，clause 只设下划线，因此角色保留颜色
   （`src/features/overlay/tokenize/style.ts`）。同一 span 同时是宾语与从句时两者叠加。
3. 跨 cue 句子组装、SDH 标签剔除、撇号归一化、连字符复合词（§3）本轮未实现，spec 保留待做。
