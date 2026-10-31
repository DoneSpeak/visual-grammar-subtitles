# 视觉词汇构建器（python/vocabulary）

离线构建「日语词汇 → 语义概念 → OpenMoji 图片」索引，输出词汇卡片可直接消费的 YAML。
Python 只用于开发和发布阶段；产物是静态文件，运行时不需要 Python。

## 产物

```text
dist/
├── vocabulary.ja.yaml            # 词汇卡片输入数据源（含每个义项的图片、评分、审核状态）
├── build-report.ja.yaml          # 统计报告：候选/已发布/未匹配数量、体积、频率语料
├── assets/openmoji/*.svg         # 按 hexcode 去重的彩色 SVG，字节级未修改
└── licenses/
    ├── OPENMOJI_LICENSE.txt
    ├── OPENJLPT_LICENSE.txt
    ├── OPENJLPT_NOTICE.md
    ├── ATTRIBUTION.md
    └── THIRD_PARTY_NOTICES.md
```

`vocabulary.ja.yaml` 顶层为 `sources / scoring / assets / entries`。每个 `entry` 对应
OpenJLPT 的一条词汇（`id` 是上游稳定 ID），`senses` 按总分降序，一个词多义就有多个
sense，各自带 `conceptId`、`gloss`、`image`、`scores`。卡片渲染取 `senses[0]` 即可；
多义词在无法确定义项时应由调用方跳过，不要任选一张图。

## 命令

```sh
# 安装（uv，Python 3.12）
make vocab-install

# 下载并校验固定版本源（OpenMoji 17.0.0 npm 包、OpenJLPT 固定 commit）
make vocab-fetch

# 生成人工审核候选清单 → reports/candidates.ja.yaml（仅辅助，不会自动通过）
make vocab-match

# 构建 + 校验
make vocab-build
make vocab-validate

# 一次跑完 fetch + build + validate
make vocab-check

# 单元测试
make vocab-test
```

直接调用：`cd python/vocabulary && .venv/bin/python -m vocabulary build --levels N5 N4`。
常用参数：`--subtitles DIR`（默认仓库根 `subtitles/`）、`--no-frequency`、`--out`、
`--report-dir`。`python -m vocabulary match --max-candidates 5` 可扩大候选。

## 数据与审核模型

- `data/concepts/ja.yaml` 是唯一的发布白名单：只有这里列出的 mapping 才可能进入 YAML。
  构建器从不自动生成或自动通过映射。
- 每个 concept 记录 `visualScore`（0–100 人工可辨识度判断）与
  `reviewStatus`（pending / approved / rejected）。硬过滤：`approved` 且
  `visualScore >= 60` 且 SVG 真实存在。
- `reviewedBy: claude-assisted` 表示映射由 AI 起草并通过图片存在性/语义初筛；
  **公开发布前必须由人工抽查**。把审核人改成实际责任人。
- 新增语言只需新增 `data/concepts/<lang>.yaml` 和对应 OpenJLPT CSV；同一 concept
  可被多语言复用，图片共享不重复打包。
- 未进入 YAML 的候选词汇写入 `reports/unmatched.ja.txt`（按等级/读音排序），
  低分或未审核 concept 写入构建报告的 `excludedConcepts`。

## 评分

```text
total = F*0.40 + V*0.35 + L*0.15 + R*0.10      （各项 0–100）
```

| 维度 | 来源 | 说明 |
|---|---|---|
| F 字幕频率 | 实际字幕语料（`subtitles/`） | janome `base_form` 统计，`100*log1p(n)/log1p(max)`；无语料时为 `null` |
| V 图片可辨识度 | 审核值 | `visualScore`，缺失不补 0 |
| L 学习相关性 | `data/relevance.yaml` | 按类别的配置目标，不是实测值 |
| R 复用价值 | 构建时计算 | 同一 concept 关联的独立词条数，仅 1 个词时为 `null` |

任一维度为 `null` 时不参与加权，权重在剩余维度上重新归一化，`scoreBasis` 记录实际
参与的维度。语料缺失不会伪造成频率分。

## 可复现与校验

- 上游固定为 OpenMoji `17.0.0`（npm 包，4495 个彩色 SVG + `data/openmoji.json`）和
  OpenJLPT commit `0d1d3410…`，两者都校验 SHA-256；哈希不匹配立即失败。
  版本与哈希在 `data/sources.lock.yaml`。
- 输出 YAML 使用稳定键序与排序（等级 → 读音 → 词形 → ID），无时间戳；重复构建字节一致。
- 同一 hexcode 只复制一次；重新构建不会删除 `dist/` 中其他语言的索引。
- `python -m vocabulary validate` 检查：schema、条目/图片唯一性、`visualScore >= 60`、
  `approved`、SVG 路径与 SHA-256/字节数、SVG 安全（无 script/foreignObject/image/
  事件属性/外链/远程样式）、许可证文件与署名标记、YAML 规范化与排序。
- 体积目标：100 图 ≤ 1 MB、300 图 ≤ 2 MB、500 图 ≤ 3 MB；报告给出 `withinTarget`。

## 许可

OpenMoji 图形为 CC BY-SA 4.0（`graphics`），上游代码另有 LGPL 许可，不能混为一谈。
OpenJLPT 数据为 CC BY-SA 4.0，其上游包含 JMdict/KANJIDIC2、Jonathan Waller JLPT 列表
和 Tatoeba。构建产物保留许可证原文与上游 NOTICE；SVG 不做修改（`modified: false`）。
插件源码不会因此整体变成 CC BY-SA。

## 已知限制

- 当前 `subtitles/` 是 75 个《Monster》日文字幕文件，频率只代表该语料，不是通用频率。
- janome 词形还原不等于完整句法分析；同一读音的多义词（如 はし）按词形区分，
  纯假名词条（つき）只映射到已审核的单一义项。
- MVP 为 100 个唯一图片；未凑数，未审核映射不会进入包。
