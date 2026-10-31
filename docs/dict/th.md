# 泰语学习词典来源

泰语复用的仍是日语那条链路：`loadThLexicon()` 读取 `chrome.runtime.getURL('dict/th/lexicon.json')`，background 对 `Intl.Segmenter('th')` 切出的每个 token 调 `lexicon.find`，命中即写入 `dictIdx`，卡片与选项页不做语言特判。实现见 `src/languages/th/lexicon.ts`、`src/languages/th/tokenizer.ts`。

泰语没有 JLPT 那样的分级，因此不声明 bands：所有收录词条默认可点，选项页「学习词典」的级别复选框对泰语显示空状态。

## 两个来源

| 来源 | 作用 | 位置 |
|---|---|---|
| 人工/AI 草拟的中文释义表 | **决定词表**：只有这里的词会被发布 | `data/dictionary/th.curated.yaml` |
| kaikki.org 泰语 JSONL（Wiktionary 派生） | 补全英文释义、POS、IPA；`--breadth` 时可扩展词表 | `data/dictionary/sources.lock.yaml` 的 `th.kaikki.url` |

合并规则：curated 是权威词表；`zh`、`pos`、`ipa` 以 curated 为准；`en` 缺失时用 Kaikki 的英文释义。同一个词的多条 curated 记录合并为一个词条（如 `ผม` = 我/头发，`คืน` = 归还/夜）。

## 审核规则

- 每条形如 `{word, pos?, ipa?, zh, en?, reviewStatus, reviewedBy}`；只有 `reviewStatus: approved` 会进入产物。
- 当前全部为 AI 草拟，标注 `reviewedBy: claude-assisted`（与 `python/vocabulary/data/concepts/ja.yaml` 同一约定）。
- **公开分发前需要人工抽查**，并把通过者的 `reviewedBy` 改为实际审核人；未抽查的条目应视为草稿。

## 许可

- curated 词表：本仓库自有内容。
- Kaikki：源自 Wiktionary，CC BY-SA 3.0 + GFDL；extract 标注于 2026-03-25。下载页已标注 deprecated，因此锁 URL + 哈希并保留 `.cache/dict/kaikki-th.jsonl`。署名见 `NOTICE.md`。

## 构建

```sh
pnpm lexicon:build th --offline   # 只用 curated，本环境可跑
pnpm lexicon:build th             # 联网下载 Kaikki 并补 IPA/英文释义
pnpm lexicon:build th --breadth   # 额外收录 curated 之外的全部 Kaikki 词头（体积显著增大）
```

产物 `public/dict/th/lexicon.json` 已提交；第一次联网构建后把 Kaikki 的 SHA-256 填回 lock 文件。

## 字段映射

| 输出 | 来源 |
|---|---|
| `w` | curated `word`（NFC 归一化，且必须整词为泰文字符 `\p{Script=Thai}+`） |
| `z` | curated `zh` |
| `g` | curated `en`；缺失时取 Kaikki `senses[].glosses`（≤3，去重） |
| `p` | curated `pos` 映射 UPOS（直接写 `CCONJ`/`SCONJ`/`AUX` 等也接受）；缺失时取 Kaikki `pos` |
| `ipa` | curated `ipa`；缺失时取 Kaikki `sounds[].ipa` |
| `id` | `th:<word>`；`lang: 'th'`；`lv` 恒为 0，无 `tags` |

## 已知限制

- 当前词表 468 条（471 条 curated 中 3 条重复词头被合并）；未覆盖的泰语词不会弹出卡片。
- 本轮无网络，产物没有 IPA：curated 未写 `ipa`，Kaikki 未下载。联网重建后 IPA 才有值。
- `Intl.Segmenter` 的泰语切分可能把复合词拆成多个片段；未收录的片段不可点。
- `--breadth` 会引入大量未经审核的 Wiktionary 词条，只建议在确认体积与授权后可接受时使用。
