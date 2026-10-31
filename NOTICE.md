# 第三方数据与许可

`src/data/jlpt-dict.json` 是构建产物（`npm run dict:build`），合并了以下数据源。派生数据同样按 CC BY-SA 4.0 提供。

## JMdict / Tanaka Corpus

- 用途：释义、词性、例句。
- 来源：[scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) `jmdict-examples-eng-3.6.2+20261026175559`。
- 版权：Electronic Dictionary Research and Development Group (EDRDG)，[CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html)。
- 例句来自 Tanaka Corpus，经 JMdict 收录。

## open-anki-jlpt-decks

- 用途：JLPT N1–N5 词表与级别。
- 来源：[jamsinclair/open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)，commit `1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0`。
- 许可：MIT License。

## ECDICT（英语词典）

- 用途：`public/dict/en/lexicon.json` 的英文词条、中文释义、音标、考试标签与屈折形。
- 来源：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，`ecdict.csv`；构建时锁定 URL 与 SHA-256，见 `data/dictionary/sources.lock.yaml`。
- 许可：仓库声明 MIT；派生数据的分发条款以上游 LICENSE 原文为准（尚待核对）。
- 说明：[docs/dict/en.md](docs/dict/en.md)。

## kaikki.org 泰语提取（Wiktionary）

- 用途：`public/dict/th/lexicon.json` 的英文释义、词性与 IPA 补全。
- 来源：[kaikki.org/dictionary/Thai](https://kaikki.org/dictionary/Thai/)，extract 标注 2026-03-25；构建时锁定 URL 与 SHA-256。
- 许可：Wiktionary 内容按 CC BY-SA 3.0 与 GFDL 提供；派生数据按相同条款分发。
- 说明：[docs/dict/th.md](docs/dict/th.md)。
