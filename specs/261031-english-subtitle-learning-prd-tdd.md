# 英语字幕学习增强系统

> 产品需求（PRD）与技术设计（TDD） · V1.0 · 2026-10-31  
> 适用场景：现有 Chrome Extension 英语字幕学习能力增强

## 0. 结论与约束

**技术选型：Chrome Extension（TypeScript）+ 可选本地 Python NLP 服务（FastAPI + spaCy `en_core_web_sm`）。**

- 目标设备：普通 Windows/macOS 笔记本；验收基线为 4 核 CPU、8 GB RAM、无独显。
- 默认离线：插件不依赖 Python 即可使用词典匹配、基础词形处理、短语识别和学习模式渲染。
- 增强解析：用户配置本地 API 后，提交整份字幕做句法分析，结果写入缓存。
- 不引入 LLM、ONNX、GPU、云服务、Redis 或数据库服务器。
- 运行时不按视频帧执行 NLP；所有字幕渲染基于标注结果。
- 本阶段英语优先，协议保留未来扩展日语等语言的能力。

上述设备与性能均属于**目标要求，尚需实测**。

# 一、产品需求 PRD

## 1. 背景与目标

在视频字幕上标注词汇、短语和英语语法结构，让用户按学习目标选择不同呈现方式，减少查词与拆句成本。首期产品回答三类问题：

1. **词汇**：这个词属于 IELTS、TOEFL、BEC、考研的哪些词库？它的词形、词性是什么？
2. **表达**：哪些连续或非连续单词构成短语动词、固定搭配和习语？
3. **句法**：主语、谓语、宾语、表语、定语、状语、补语在哪里？有哪些从句？

产品不以“为每个句子生成自然语言讲解”为目标，而是先提供准确、可扩展的语言结构标注和可配置渲染。

## 2. 需求范围

| 模块 | 能力 | 优先级 | 执行位置 |
|---|---|---|---|
| 考试词汇 | IELTS / TOEFL / BEC / 考研多标签识别 | P0 | Local |
| 基础词汇 | Token、Lemma、POS | P0 | Local 基础版；Remote 精确版 |
| 短语表达 | Phrasal Verb、词典型 Collocation、Idiom | P0 | Local 优先 |
| 语块分组 | NP、VP、PP | P0 | Remote 优选 |
| 句法结构 | 主谓宾、表语、定状补 | P0 | Remote |
| 高级语法 | 从句、非谓语、时态、语态 | P1 | Remote |
| 学习模式 | 考试词汇、语块、语法、沉浸阅读 | P0 | Local UI |
| 样式配置 | 字体、字号、字色、背景、下划线 | P0 | Local UI |
| 缓存与降级 | 本地缓存、Remote 失败降级 | P0 | Local |
| 个性化 | 熟词过滤、CEFR、复习记录 | P1 | Local |
| AI 解释 | 自动语法讲解、例句生成 | P2（首期不做） | 待定 |

### 2.1 词库策略

- 考试词库是**多标签集合**，并非互斥等级；同一 lemma 可匹配多种考试。
- 存储词库来源、版本和许可证信息；正式发布前验证素材是否允许随插件分发。
- Lemma 匹配需要配合词性及必要时的词义信息，避免例如同形异义词被过度标注。
- CEFR 是独立的通用难度维度，不应与考试词库直接互相换算。

## 3. 用户故事及交互

1. 用户导入/选择英语字幕，插件读取原文，检查分析缓存。
2. 未命中缓存时，Local NLP 即刻生成词汇和基础短语标注，字幕仍可显示。
3. 用户开启 Remote 且配置了 API 地址后，插件异步提交**整份字幕**解析；结果成功后写缓存，自动增强当前可见字幕。
4. 用户选择学习模式，直接使用同一组分析数据重渲染，无需再次解析。
5. 用户可按标签类型自定义字体、字号、颜色、背景和下划线。
6. Remote 超时、未启动或异常时，自动维持 Local 渲染，不阻断播放。

### 3.1 四种默认学习模式

| 模式 | 默认显示 | 目标 |
|---|---|---|
| 考试词汇 | 用户选中的考试词库词汇、典型短语 | 备考 |
| 语块学习 | 短语动词、固定搭配、名词/介词语块 | 听力、自然表达 |
| 语法结构 | 句子一级主谓宾、表语/修饰成分；点击展开从句 | 拆句理解 |
| 沉浸阅读 | 最小化着色，只突出设定的难词/短语 | 连续观看 |

设计约束：**不要默认叠加所有标注**；同一文本允许多重语义标签，由学习模式决定视觉优先级。

## 4. 非功能需求

- 隐私优先：默认不传字幕到互联网；Remote 默认指向本机服务，须由用户主动开启。
- 可维护性：词典、分析器、学习模式和渲染器解耦。
- 可扩展性：统一 Schema 支持语言扩展、标注层新增、嵌套/重叠/不连续 Span。
- 稳定性：缓存失效、分析失败不影响原字幕播放。
- 资源限制：为普通笔记本设置任务并发、文件大小和内存使用上限。

# 二、技术设计 TDD

## 5. 总体架构

```text
Chrome Extension (MV3)
  ├─ Subtitle Adapter / Cue Parser
  ├─ Local NLP (tokenizer, lemma rules, lexicon/phrase matching)
  ├─ Annotation Repository (IndexedDB)
  ├─ Learning Mode & Style Rules
  ├─ Subtitle Renderer
  └─ Remote NLP Client ─ HTTP (optional, 127.0.0.1) ─┐
                                                      │
Local Python NLP Service                              │
  ├─ FastAPI / Health / Capabilities / Job API ◀───────┘
  ├─ spaCy en_core_web_sm
  ├─ Grammar Rule Mapper
  ├─ Span/Cue Alignment
  └─ Annotation Serializer
```

**职责边界：**

| 模块 | 负责 | 不负责 |
|---|---|---|
| Local NLP | 基础词形、考试词典、固定短语 | 完整句法分析 |
| Remote NLP | POS、Lemma、依存句法、语块及教学语法映射 | 字幕显示样式 |
| Annotation Repository | 版本、合并、持久化和失效 | 语法算法 |
| Learning Mode Engine | 可见标注选择、视觉优先级 | NLP 解析 |
| Renderer | 字符分段、DOM 和视觉显示 | 判断语言标签 |

## 6. 技术选型

| 部件 | 选型 | 说明 |
|---|---|---|
| 扩展程序 | TypeScript、Chrome MV3 | 现有 Chrome Extension 增量改造 |
| Local 词库 | 压缩 JSON / 静态字典 | 不依赖网络 |
| Local 匹配 | Trie 或 Aho–Corasick + 规则 | 固定短语、词组和词汇匹配 |
| 本地缓存 | IndexedDB | 保存字幕及结构化标注 |
| 配置 | `chrome.storage.local` | 学习模式、样式和 API 地址 |
| 本地 HTTP | FastAPI + Uvicorn | 轻量 Python 服务 |
| 英语模型 | spaCy `en_core_web_sm` | CPU 优化；具备 POS / dependency / lemma 组件 |
| 推理策略 | 模型启动后常驻 + `nlp.pipe()` 批处理 | 避免重复加载 |
| 持久化服务 | 不使用 | 解析完成后由插件保存缓存 |
| 任务排队 | 单进程内存队列、默认串行 | 首期不使用 Celery/Redis |

`en_core_web_sm` 模型包大约 12 MB；这**不等于**完整 Python 环境或常驻内存只需 12 MB。

## 7. 统一标注文件：`.sanno.json`

### 7.1 设计要求

1. Local / Remote 使用**相同的数据结构**；允许能力缺失时字段为空或不返回相应标注层。
2. Subtitle Cue（时间显示单位）与 Sentence（语言分析单位）分离。
3. Token 保留原文字符范围、词形与语法关系；Span 表示词汇、短语及句法结构。
4. Span 支持多个 `segments`，以表达非连续和重叠结构。
5. Relation 表示 Token 或 Span 之间的依存、修饰等关系。
6. 记录 schemaVersion、引擎及模型版本、词典版本、来源哈希、capabilities。
7. Span 的视觉样式**不存储在语言分析数据中**。

### 7.2 JSON 示例（骨架）

```json
{
  "schemaVersion": "1.0.0",
  "language": "en",
  "source": {
    "hash": "sha256-of-normalized-subtitle",
    "format": "srt"
  },
  "analysis": {
    "engine": "spacy",
    "model": "en_core_web_sm",
    "version": "3.8.0",
    "capabilities": ["token", "lemma", "pos", "dependency", "phrase", "syntax"]
  },
  "cues": [
    {
      "id": "cue-001",
      "startMs": 1200,
      "endMs": 4200,
      "text": "She looks forward to meeting you."
    }
  ],
  "sentences": [
    {
      "id": "sent-001",
      "cueIds": ["cue-001"],
      "text": "She looks forward to meeting you.",
      "tokens": [
        {
          "id": "t1",
          "start": 0,
          "end": 3,
          "text": "She",
          "lemma": "she",
          "pos": "PRON",
          "dep": "nsubj",
          "head": "t2"
        }
      ],
      "spans": [
        {
          "id": "p1",
          "type": "phrase",
          "segments": [{"start": 4, "end": 20}],
          "attributes": {
            "phraseType": "phrasal_expression",
            "canonicalForm": "look forward to"
          },
          "source": "dictionary"
        },
        {
          "id": "s1",
          "type": "syntax",
          "segments": [{"start": 0, "end": 3}],
          "attributes": {"role": "subject"},
          "source": "remote"
        }
      ],
      "relations": [
        {"from": "t1", "to": "t2", "type": "nsubj"}
      ]
    }
  ]
}
```

> 这是结构示意，未列全句所有 Token/Span，也不代表真实模型输出；`version` 是示例元数据，应在运行时填入真实版本。`start/end` 使用 Sentence 文本的 Unicode 码点偏移、结束位置独占；渲染端需要正确映射 JS UTF-16 下标。跨 Cue 时保存更细的文本映射信息，以可靠还原原始字幕定位。

### 7.3 进一步的协议规范

- `lexical` 层须能保存 `{lemma, pos, senseId?, examTags[], lexiconVersion, source}`；考试归属与句法分析分别管理。
- `segments` 统一使用 Sentence 坐标；不连续短语可用多个字符区间。
- `head` 可为 Token ID；对于不存在或无法确定的值使用 `null`，不能指向不存在的 Token。
- 缓存区分源字幕哈希、Schema 版本、词典版本、分析器版本和分析选项。
- `confidence` 可选；只有真实模型提供有意义的校准置信度才输出，不推测百分比。
- 正式开发前补充 JSON Schema 文件、字段枚举及错误用例验证。

## 8. 语法映射器（Grammar Rule Mapper）

spaCy 返回的是依存句法标签，不能直接将任意标签一对一翻译成“主谓宾定状补”。必须结合动词、助动词、依存树子树、被动结构和补语类型制定映射规则。

| 教学结构 | 候选 spaCy 标签 | 注意事项 |
|---|---|---|
| 主语 | `nsubj`, `nsubjpass`, `csubj` | 结合谓语与句子根 |
| 谓语 | `ROOT`, `aux`, `auxpass` | 组合助动词、否定及主要动词；ROOT 不保证是动词 |
| 宾语 | `dobj`, `obj`, `iobj` | 考虑模型标签体系差异 |
| 表语 | `acomp`, `attr`, `oprd` | 结合系动词句型 |
| 定语 | `amod`, `relcl`, `acl` | 需要找到修饰对象 |
| 状语 | `advmod`, `advcl`, `npadvmod` | 不是全部状语类型 |
| 补语 | `xcomp`, `ccomp`, `oprd` | 与中文教学定义不总是对应 |

映射逻辑输出 Span 和 Relation，并为无法确定的结构输出 `unknown`，不应“强制全部着色”。首期优先支持主谓宾、系表和常见修饰成分；复杂口语省略与跨句结构进入后续迭代。

## 9. Remote NLP API

### 9.1 接口表

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/v1/capabilities` | 服务语言、模型与能力 |
| POST | `/api/v1/analysis/jobs` | 提交整份字幕文件内容 |
| GET | `/api/v1/analysis/jobs/{id}` | 查询进度和状态 |
| GET | `/api/v1/analysis/jobs/{id}/result` | 获取 `.sanno.json` |
| DELETE | `/api/v1/analysis/jobs/{id}` | 请求取消 |

**状态机：** `queued → running → completed / failed / cancelled`。

### 9.2 提交示例

```http
POST /api/v1/analysis/jobs
Content-Type: application/json
```

```json
{
  "language": "en",
  "format": "srt",
  "content": "1\n00:00:01,200 --> 00:00:04,200\nShe looks forward to meeting you.",
  "options": {
    "syntax": true,
    "phrases": true,
    "dependencies": true
  }
}
```

```json
{"jobId": "job-123", "status": "queued"}
```

### 9.3 API 工程要求

- 默认绑定 `127.0.0.1`，禁止默认监听公网网卡。
- 请求文件大小默认上限 5 MB；同时限制字幕行数、输入长度和运行时任务数量。
- 限制 Chrome Extension Origin，校验请求 Origin；CORS 本身不是完整鉴权，可根据威胁模型增加本机令牌。
- 不接受任意服务器本地文件路径、URL 下载指令，避免本地文件读取或 SSRF。
- 解析任务默认并发 1；进程重启允许丢失未完成任务。
- 服务不长期保存原始字幕，结果由插件持久化。
- 相同 `sourceHash + analysisOptions + modelVersion` 可复用已完成结果；禁止缓存键与输入不一致。

## 10. Local / Remote 调度与缓存

### 10.1 调度规则

| 状态 | 行为 |
|---|---|
| 未配置 Remote | Local 分析 |
| 已配置但连接失败 | Local 分析；设置页显示连接问题 |
| Remote 正在运行 | Local 先展示；结束后增量增强 |
| 已有有效 Remote 缓存 | 直接使用缓存 |
| Remote 超时/失败 | 保留 Local 结果 |
| 模型升级 | 仅相关 Remote 层失效 |
| 词库更新 | 只重建词汇标签，不重复句法推理 |
| 学习模式/颜色改变 | 仅重渲染，不重新运行 NLP |

### 10.2 IndexedDB 分层

- `subtitle-source`：字幕 Cue、时间轴及源内容哈希。
- `local-annotations`：词典和规则识别结果。
- `remote-annotations`：POS、依存和句法标注。
- `render-preferences`：推荐单独放在 `chrome.storage.local`，不与 NLP 缓存混用。

导出时可组合成统一 `.sanno.json`。任务状态必须持久化，不能依赖可能休眠的 MV3 Service Worker 内存。

## 11. 字幕渲染器

- 学习模式是对完整 Annotation Model 的**投影**，而非另一份 NLP 数据。
- 同一字符可以拥有多个标注；DOM 最终渲染片段不可相互重复，但可携带多个标签。
- 对重叠 Span 做边界切分，再应用样式规则。
- 建议：前景色代表当前模式主标签，背景代表考试词汇，下划线代表短语边界；语法层级默认折叠。
- 用户配置优先级：`单条自定义 > 当前模式 > 全局设置 > 原字幕样式`。
- 五个样式维度：`fontFamily`、`fontSize`、`color`、`backgroundColor`、`textDecoration`。
- 为用户选择文本、复制、点击查看详情保留原始文本映射和交互索引。

## 12. 性能目标（待实测）

| 指标 | 目标 |
|---|---|
| 验收设备 | 4 核 CPU / 8 GB RAM / 无 GPU |
| Local 单条处理 | P95 ≤ 20 ms |
| Local 缓存读取 | P95 ≤ 10 ms（不含布局） |
| Remote 批量分析 | 1000 条短字幕 ≤ 30 秒（参考目标） |
| Python 常驻 RSS | 期望 ≤ 500 MB |
| 并发 NLP 任务 | 默认 1 |
| 字幕输入大小 | 默认 ≤ 5 MB |
| 缓存规模 | 默认 200 MB，按 LRU 清理 |

性能测试必须记录：字幕数量、总 Token 数、句子长度分布、冷启动/热启动、CPU 使用率、峰值 RSS 和 P50/P95 时延。上述数字不是当前实测结果。

## 13. 验收标准

### 13.1 功能

- [ ] 四套词库支持多标签匹配、词库版本和来源记录。
- [ ] Local 能识别常见词形变化和基础固定搭配。
- [ ] Remote 能解析常见主谓宾、系表和基础修饰成分。
- [ ] 同一句字幕能切换四种学习模式，不重新运行分析。
- [ ] 字体、字号、颜色、背景、下划线均可自定义。

### 13.2 协议与兼容

- [ ] 不启动 Python，插件仍能正常显示和学习。
- [ ] Remote 失败、超时和重启不影响播放。
- [ ] Sentence 跨 Cue 时可正确映射回时间轴。
- [ ] Schema 支持嵌套、重叠和非连续 Span。
- [ ] 缓存按源文本、词典及模型版本正确失效。

### 13.3 性能与安全

- [ ] 4 核 CPU / 8 GB RAM 笔记本完成性能基准测试。
- [ ] 播放过程中 NLP 不导致可感知卡顿。
- [ ] 服务默认只监听本机，具备请求大小和访问控制。
- [ ] 缓存命中不会重复运行 NLP。

## 14. 里程碑

| 阶段 | 交付物 | 完成判定 |
|---|---|---|
| M1 基础协议 | Schema、Local 词典/规则、缓存雏形 | 词汇和固定搭配可正确着色 |
| M2 Remote NLP | FastAPI、spaCy、Grammar Mapper、任务 API | 普通笔记本能完成句法分析 |
| M3 学习模式 | 四种模式、样式配置、Span 渲染器 | 结果复用、不重复 NLP |
| M4 工程完善 | 降级、测试、性能、安全检查 | 全部 P0 验收通过 |

**第一项技术验证：**准备 20 条典型字幕，涵盖简单句、系表、宾语从句、定语从句、非连续短语、口语省略、跨 Cue 句子；先验证句法 Span 识别与 Cue 对齐，再扩充 UI 和词库。

## 15. 建议项目结构

```text
project/
├── extension/
│   └── src/
│       ├── nlp/
│       │   ├── local/
│       │   │   ├── tokenizer.ts
│       │   │   ├── lemmatizer.ts
│       │   │   ├── lexicon-matcher.ts
│       │   │   └── phrase-matcher.ts
│       │   ├── remote/nlp-client.ts
│       │   ├── schema/annotation.ts
│       │   └── cache/annotation-repository.ts
│       ├── learning/
│       │   ├── modes.ts
│       │   └── style-rules.ts
│       └── subtitle/
│           ├── cue-mapper.ts
│           └── annotation-renderer.ts
├── nlp-service/
│   ├── app/
│   │   ├── main.py
│   │   ├── parser.py
│   │   ├── grammar_mapper.py
│   │   ├── phrase_matcher.py
│   │   └── schemas.py
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
├── data/
│   ├── lexicons/
│   └── phrases/
└── docs/
    ├── english-learning-prd.md
    ├── english-nlp-design.md
    └── annotation-schema.md
```

## 16. 技术决策记录（ADR）

| 问题 | 决策 |
|---|---|
| 需要大语言模型吗？ | 不需要 |
| 需要 ONNX 吗？ | 不需要 |
| 需要独显/GPU 吗？ | 不需要 |
| 用户必须安装 Python 吗？ | 不需要；只影响增强解析 |
| 需要云服务器吗？ | 不需要 |
| 需要数据库服务器吗？ | 不需要 |
| Local / Remote 可独立定义 Schema 吗？ | 不可以，统一结构 |
| 是否逐帧/逐字幕重复调用 NLP？ | 不允许；优先整份预处理与缓存 |
| 能否保证每句都完整分类？ | 不保证；允许 unknown 和降级 |
| 能否扩展日语？ | 协议可扩展，语言实现需单独开发 |

## 17. 正式开发前待决项

1. **词库数据**：各考试词库的准确版本、许可证、lemma/词义颗粒度及更新机制。
2. **Schema 冻结**：输出 JSON Schema，定义跨 Cue 字符映射、多语言偏移和枚举。
3. **句法质量**：建立 20 条典型字幕基准集并扩展成回归测试，记录无法正确解析的案例。
4. **Remote 安全**：明确插件 ID、CORS/Origin 校验方式和是否要求本机访问令牌。
5. **实际性能**：以 4 核 CPU / 8 GB RAM 测量首启、热启、1000 条字幕吞吐和峰值内存。

## 18. 参考资料

- [spaCy 英语模型](https://spacy.io/models/en)
- [spaCy 语言学特征与依存句法](https://spacy.io/usage/linguistic-features)
- [Chrome Extension Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Extension 存储与 Cookie](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)

---

**交付判断：**该文档可用于实施规划和技术评审；尚不能视为已完成的 API/OpenAPI 与 JSON Schema 详细规范，相关待决项见第 17 节。
