# 英语学习词典来源

英语词典只替换**数据来源**，查询链路与日语完全相同：`loadEnLexicon()` 读取 `chrome.runtime.getURL('dict/en/lexicon.json')`，background 对每个 token 调 `lexicon.find`，命中的词条写入 `token.dictIdx`，卡片、bands、选项页无需感知语言差异。实现见 `src/languages/en/lexicon.ts` 与 `src/languages/en/bands.ts`。

## 数据源

| 项 | 值 |
|---|---|
| 数据集 | ECDICT — Free English to Chinese Dictionary Database |
| 仓库 | [`skywind3000/ECDICT`](https://github.com/skywind3000/ECDICT) |
| 文件 | `ecdict.csv`（`word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio`） |
| 锁定 | `data/dictionary/sources.lock.yaml` 的 `en.url` / `en.file` / `en.sha256` |
| 构建 | `pnpm lexicon:build en` |
| 产物 | `public/dict/en/lexicon.json`（已提交，`pnpm build` 不联网） |
| 缓存 | `.cache/dict/ecdict.csv`（未提交） |

`sha256` 已按 2026-10-31 下载的 `ecdict.csv` 固定；上游更新后构建会因哈希不符而失败，需重新核对后再改 lock。

## 许可

ECDICT 仓库声明 MIT。其数据聚合自多部来源词典，**发布前的许可证核对尚未完成**（未验证：仓库 `LICENSE` 原文、逐字段来源声明）。核对完成前不要以新的许可条款分发派生数据；署名同步维护在 `NOTICE.md`。

## 字段映射

| ECDICT | `DictEntry` | 规则 |
|---|---|---|
| `word` | `w` | 仅单 ASCII 词 `/^[A-Za-z][A-Za-z'-]*$/`，词组直接丢弃 |
| `phonetic` | `ipa` | 空值或 `[]` 丢弃 |
| `definition` | `g` | 按行拆分，取前 3 行 |
| `translation` | `z` | 按行拆分，取前 3 行；zh-CN 界面优先显示 |
| `pos` | `p` | 首个词性映射到 UPOS；见下方词性回退规则 |
| `tag` | `tags` | `cet4/cet6/zk/gk/gre/ielts/toefl` 原样，`ky→kaoyan` |
| `exchange` | `forms` | 只取 `p/d/i/3/r/t/s` 键的屈折形，最多 8 个；`0:`（屈折行的 lemma）与 `1:` 忽略 |
| — | `id` | `en:<小写 word>` |
| — | `lang` | `'en'` |

收录条件：至少命中一个 ECDICT 考试 tag，或 `oxford == 1`，或语料排名 `bnc`/`frq` 的最小值 ≤ 20000（`FREQUENCY_LIMIT`）；且 `definition` / `translation` 至少有一个非空。

词性回退顺序（`pos` 列在考试词上也可能为空）：
1. `pos` 列首个词性映射到 UPOS；
2. `exchange` 含非空的 `p`/`d`/`i`/`3` 键 → `VERB`（过去式/分词/三单只出现在动词上，动词对浅层解析最关键）；
3. `definition` 首行的 WordNet 标记：`n`→NOUN、`v`→VERB、`a`/`s`→ADJ、`r`→ADV。

三条都落空时，考试/牛津词条仍保留（`p: []`，可查词但不参与解析），仅频率词条丢弃。`exchange` 的 `0:` 指向与自身不同的词时视为屈折行并跳过（词形由 lemma 的 `forms` 覆盖）；`0:` 指向自身（如 `run` 的 `0:run`）不算。同一 `id` 只保留首条。释义同时按真实换行与字面 `\n` 拆分。

## 查询与筛选

- `EnLexicon` 先查小写 headword（真实词条优先），再查 `forms`，因此 `went → go` 这类无规则屈折也能命中。
- bands 只认 `cet4`、`cet6`、`kaoyan`、`ielts`、`toefl` 五个考试标签；`zk/gk/gre` 保留在词条上但不可筛选（未声明 band），因此这些词照样可点。ECDICT 没有 `bec`，旧存储里的该选项已失效且不再显示，样例产物里的 `bec` 标签也已清除。
- 查询键统一小写并折叠弯引号（`don’t → don't`），与 tokenizer 的 `normalizeWord` 一致。
- 无 tags 的牛津词条默认全部可点（`entryAllowed` 对空 band 集合放行）。

## 已知限制

- 当前提交的 `public/dict/en/lexicon.json` 由 ECDICT 按考试 tag / 牛津标记 / 语料排名重建：22,120 条、约 6.4MB。产物已提交，`pnpm build` 不联网。
- 只收单词，不收词组/习语；`definition`/`translation` 截断为 3 行，长释义会丢失。
- 词形还原只依赖 ECDICT 的 `exchange` 列，覆盖不完整（如部分派生词）。
- `pos` 只存一个词性，兼类词不区分上下文（`offer` 按动词收录，`an offer` 里的名词用法因此少标一个角色；`quick` 按 WordNet 首个释义收为 NOUN）；本地解析对这类词可能少标角色。
