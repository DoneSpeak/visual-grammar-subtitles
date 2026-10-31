# 多语言视觉词汇库技术设计方案

**项目名称：** Multilingual Visual Vocabulary

**文档版本：** V1.0  
**优先实现语言：** 日语（JLPT N5/N4）  
**运行环境：** Chrome Extension（Manifest V3）  
**唯一图片资源：** OpenMoji（彩色 SVG）  
**构建技术：** Python 3.11+  
**运行时依赖：** 无额外服务、无需 Python  
**项目状态：** 待实现

---

## 1. 背景与目标

在现有 Chrome Extension 字幕语言学习功能上增加视觉词汇能力。

用户观看带字幕的视频时，插件可以根据字幕中识别出的词汇，展示与其词义对应的简洁插图，帮助用户建立视觉联想。

### 1.1 核心目标

1. 优先覆盖 JLPT N5/N4 的常见可视化词汇。
2. 第一阶段选择 100 张图片，最终目标为 500 张。
3. 图片全部采用 OpenMoji 彩色 SVG。
4. 构建产物可以直接打包到 Chrome Extension。
5. 设计支持多语言复用，不与 JLPT 等级体系绑定。
6. 图片加载完全离线，不引入运行时网络请求。
7. 保证词汇、语义、图片之间映射准确。
8. 满足 OpenMoji 的 CC BY-SA 4.0 许可证要求。

### 1.2 非目标

V1 不实现以下功能：

- 在线图片搜索。
- 运行时 AI 生成图片。
- 运行时通过 LLM 匹配图片。
- 完整 JLPT N5–N1 图像覆盖。
- 自行绘制 SVG。
- 将整个 OpenMoji 图片库打包进插件。
- 修改现有字幕 NLP 引擎。

本功能仅消费现有字幕解析结果，不替代字幕解析、词性识别或语法分析。

---

## 2. 核心架构

采用三层模型：

**Language Vocabulary → Semantic Concept → OpenMoji Asset**

示例：

```text
日语：自転車
英语：bicycle
中文：自行车
韩语：자전거
       │
       ▼
Concept: transport.bicycle
       │
       ▼
OpenMoji: 1F6B2.svg
```

相同语义概念共享同一张图片。

### 2.1 设计约束

- 词汇与图片不得直接建立不可扩展的一对一关系。
- 使用稳定的 `conceptId` 连接不同语言。
- 单词可能存在多个义项，必须支持一词多义。
- 多个词汇可以引用同一个语义概念。
- JLPT 等级只能保存在日语词汇元数据中。
- 不能将无明确视觉表达的词汇强行配图。
- `conceptId` 必须由人工审核确认，不能完全依赖字符串相似性。

### 2.2 目录设计

```text
visual-vocabulary/
├── data/
│   ├── concepts.json
│   ├── vocab/
│   │   ├── ja.json
│   │   ├── en.json
│   │   └── ko.json
│   ├── mappings/
│   │   └── openmoji.json
│   └── scoring/
│       └── ja-n5-n4.json
│
├── sources/
│   ├── openmoji/
│   └── openjlpt/
│
├── scripts/
│   ├── import_vocabulary.py
│   ├── import_openmoji.py
│   ├── match_concepts.py
│   ├── rank_concepts.py
│   ├── build_assets.py
│   └── validate_assets.py
│
├── licenses/
│   ├── OPENMOJI_LICENSE.txt
│   ├── OPENMOJI_ATTRIBUTION.md
│   └── THIRD_PARTY_NOTICES.md
│
├── dist/
│   ├── manifest.json
│   ├── concepts.json
│   ├── vocab/
│   │   └── ja.json
│   ├── assets/
│   │   └── *.svg
│   └── licenses/
│
└── README.md
```

---

## 3. 数据模型

### 3.1 Concept：语义概念

`data/concepts.json`

```json
{
  "schemaVersion": 1,
  "concepts": [
    {
      "id": "transport.bicycle",
      "category": "transport",
      "labels": {
        "en": "bicycle",
        "ja": "自転車",
        "zh-Hans": "自行车"
      },
      "imageId": "openmoji:1F6B2",
      "visualScore": null,
      "reuseScore": null,
      "reviewStatus": "pending"
    }
  ]
}
```

字段约定：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 稳定的语义概念 ID |
| category | string | 视觉分类 |
| labels | object | 多语言概念名称 |
| imageId | string/null | 对应 OpenMoji 图片 |
| visualScore | number/null | 图片可辨识度，0–100 |
| reuseScore | number/null | 跨词汇复用价值，0–100 |
| reviewStatus | enum | pending / approved / rejected |

**约束：**

- Concept ID 不应随翻译文本改变。
- 图片可替换，但 Concept ID 必须稳定。
- `imageId` 只能引用已核实存在的 OpenMoji 图片。
- 未审核通过的 Concept 不得进入正式图片包。

### 3.2 Vocabulary：语言词汇

`data/vocab/ja.json`

```json
{
  "schemaVersion": 1,
  "language": "ja",
  "entries": [
    {
      "id": "ja-jitensha-1",
      "lemma": "自転車",
      "reading": "じてんしゃ",
      "partOfSpeech": "noun",
      "level": "N5",
      "senses": [
        {
          "id": "ja-jitensha-1-s1",
          "conceptId": "transport.bicycle",
          "gloss": {
            "en": "bicycle",
            "zh-Hans": "自行车"
          }
        }
      ]
    }
  ]
}
```

注意：示例 ID 和等级用于演示数据格式，正式实现时需要核对词条来源及实际分级。

**必须支持一词多义：**

例如：

```text
はし
├── bridge → infrastructure.bridge
└── chopsticks → food.chopsticks
```

没有足够上下文时，不应随意选取其中一张图片。

### 3.3 OpenMoji 图片映射

`data/mappings/openmoji.json`

```json
{
  "schemaVersion": 1,
  "provider": "openmoji",
  "sourceVersion": "PINNED_RELEASE",
  "license": "CC-BY-SA-4.0",
  "assets": [
    {
      "id": "openmoji:1F6B2",
      "hexcode": "1F6B2",
      "file": "1F6B2.svg",
      "sourcePath": "color/svg/1F6B2.svg",
      "modified": false
    }
  ]
}
```

构建脚本必须通过固定版本 OpenMoji 仓库中的实际文件和元数据校验文件路径，不允许仅依据 Unicode 名称推断文件一定存在。

---

## 4. 图片资源来源

唯一来源：

https://github.com/hfg-gmuend/openmoji

图片使用：

```text
color/svg/
```

元数据：

```text
data/openmoji.json
```

OpenMoji 图片文件命名通常基于 Unicode Hexcode。

### 4.1 资源获取策略

1. 使用稳定的 GitHub Release。
2. 固定版本号和 Commit SHA。
3. 保留上游许可证和来源信息。
4. 读取 `data/openmoji.json` 建立本地图标索引。
5. 优先选择彩色 SVG。
6. 只复制正式映射中引用的 SVG。

不得直接依赖持续变化的 `master` 分支进行生产构建。

### 4.2 图片匹配

采用三步流程：

**第一步：自动候选生成**

基于 OpenMoji 元数据中的名称、关键词、分组信息，匹配 Concept 的英文标签。

**第二步：人工审核**

重点检查：

- 图像是否准确表达词义。
- 是否存在明显歧义。
- 是否具有语言或文化上的特殊含义。
- 是否和其他概念重复。
- 是否能在小尺寸下清晰识别。

**第三步：确认映射**

审核通过后，将 `reviewStatus` 修改为 `approved`。

不允许在生产构建时使用未经审核的模糊自动匹配结果。

---

## 5. N5/N4 图片筛选算法

### 5.1 候选词库

优先使用：

https://github.com/evanclan/OpenJLPT

N5：674 个词汇。  
N4：630 个词汇。  
合计：1,304 个候选词汇。

以上数量来自项目公开资料，具体构建时需要根据固定数据版本重新核验。

JLPT 词表不是官方完整考试词表，分级仅作为学习资源标签。

### 5.2 评分模型

采用四维评分：

| 指标 | 权重 |
|---|---:|
| F：字幕出现频率 | 40% |
| V：图片可辨识度 | 35% |
| L：学习内容相关性 | 15% |
| R：图标复用价值 | 10% |

计算方式：

```python
score = (
    frequency * 0.40
    + visual * 0.35
    + relevance * 0.15
    + reuse * 0.10
)
```

各项评分取值 0–100。

### 5.3 数据获取原则

**F：字幕出现频率**

优先使用实际字幕样本进行统计。

要求：

- 通过日语分词和词形还原将字幕表层词归并到词条。
- 按词条出现频次计算标准化得分。
- 记录语料版本和统计方法。
- 后续可引入公开字幕语料作为补充。
- 不得将词表排序直接当作真实频率。

**V：图片可辨识度**

使用人工审核结果或者用户视觉识别实验。

可以先由规则或 AI 生成建议分数，但不能把模型预测分数标记为实测。

**L：学习内容相关性**

根据字幕学习目标进行配置。

默认面向日常对话、生活场景、常见动画及影视内容。

**R：复用价值**

衡量同一语义概念在不同单词、表达形式和语言之间的复用能力。

不能为了提高复用得分而建立不准确的映射。

### 5.4 硬性过滤规则

必须同时满足：

```text
visualScore >= 60
reviewStatus == approved
imageId exists
asset exists
license verified
```

缺少评分的候选项目进入待审核队列，不自动填充为 0，也不能用假设分数冒充真实评估结果。

### 5.5 去重策略

评分单位是词汇义项，但最终资源预算以**唯一图片**为单位。

建议先为每个已审核 Concept 计算其关联义项的最高得分，再按得分排序；多个 Concept 引用同一个 OpenMoji Hexcode 时，最终只复制一份 SVG。

必须注意：

- 一个图片可以关联多个 Concept。
- 一个 Concept 可以关联多个语言的词汇。
- 500 张图片是资源预算上限，不是强制凑满的数量。
- 相同图片路径只复制一次。
- 不同语义即使使用同一图片，也保留独立 Concept。

### 5.6 分阶段资源规模

| 阶段 | 图片数量上限 | 目标 |
|---|---:|---|
| MVP | 100 | 验证视觉联想效果 |
| V1 | 300 | 覆盖主要生活场景 |
| V2 | 500 | 扩展动作、物品与场景 |

候选资源可以按以下类别规划：

- 人物与身体
- 日常物品
- 食物与饮品
- 交通与出行
- 场所与建筑
- 自然与动物
- 时间与天气
- 动作与行为
- 状态与情绪

类别预算仅用于控制多样性，不能覆盖实际评分结果。

---

## 6. Python 构建流水线

Python 仅用于开发和发布阶段。

### 6.1 构建流程

```text
Import OpenJLPT Vocabulary
             │
             ▼
Normalize Vocabulary & Senses
             │
             ▼
Import OpenMoji Metadata
             │
             ▼
Generate Concept Candidates
             │
             ▼
Review Semantic/Image Mapping
             │
             ▼
Calculate Scores
             │
             ▼
Filter & Rank
             │
             ▼
Deduplicate SVG Assets
             │
             ▼
Validate Licenses & Files
             │
             ▼
Export JSON + SVG + Notices
```

### 6.2 构建命令

建议提供统一 CLI：

```bash
python -m scripts.import_vocabulary \
  --language ja \
  --levels N5 N4

python -m scripts.import_openmoji

python -m scripts.match_concepts \
  --language ja

python -m scripts.rank_concepts \
  --language ja \
  --limit 500

python -m scripts.build_assets \
  --language ja \
  --limit 500

python -m scripts.validate_assets \
  --output dist/
```

可以进一步封装：

```bash
python build.py --language ja --levels N5 N4 --limit 500
```

### 6.3 构建要求

- 支持重复执行，结果可复现。
- 提供错误日志。
- 输出未匹配词汇清单。
- 输出审核待办清单。
- 缺失图片不得静默忽略。
- License 元数据不符合要求时构建失败。
- 不得生成包含未审核资产的正式包。
- 输出 JSON 使用 UTF-8。
- 输出稳定排序，避免无意义 Git Diff。
- 生成资源清单及 SHA-256 校验值。
- 支持 `--dry-run`。
- 支持 `--report` 输出构建统计报告。
- 构建时不得删除其他语言已经生成的资源包。

### 6.4 SVG 安全

必须检查 SVG：

- 不允许 `<script>`。
- 不允许外部资源引用。
- 不允许事件处理属性。
- 不允许 `foreignObject`。
- 不允许远程字体、图片或样式依赖。

优先直接复制经过核实的 OpenMoji 原始 SVG。

如果进行 SVG 压缩优化，需要记录工具、版本和修改方式，保留许可信息，并评估优化是否属于需要按 CC BY-SA 4.0 共享的改编。

---

## 7. Chrome Extension 集成

插件不应直接引用构建阶段的完整词库。

只使用 `dist/` 中的静态资源。

### 7.1 运行时接口

建议提供：

```typescript
interface VocabularyImage {
  conceptId: string;
  imageUrl: string;
  source: "openmoji";
  license: "CC-BY-SA-4.0";
}

interface LookupContext {
  language: string;
  lemma: string;
  senseId?: string;
}

interface VisualVocabularyService {
  lookup(
    context: LookupContext
  ): VocabularyImage | null;
}
```

### 7.2 查找流程

```text
字幕 NLP 分析
      │
      ▼
语言 + 词条 + 义项
      │
      ▼
Vocabulary Index
      │
      ▼
Concept ID
      │
      ▼
OpenMoji Image ID
      │
      ▼
Chrome Extension Asset URL
      │
      ▼
显示 SVG
```

示例：

```typescript
const imageUrl = chrome.runtime.getURL(
  "assets/openmoji/1F6B2.svg"
);
```

在支持的插件页面中使用 `<img>` 显示 SVG；不要将未经校验的 SVG 直接作为 HTML 注入。

### 7.3 与现有字幕 NLP 的关系

本模块只消费解析结果。

Local NLP 模式：

- 如果只识别出表层词，先尝试词形还原。
- 无法确定义项时，只使用无歧义的映射。
- 多义词默认不显示图片。

Remote NLP 模式：

- 优先使用服务端提供的 lemma 和义项信息。
- 服务端概念 ID 与本地概念体系不一致时需要映射。
- 不能直接相信 Remote NLP 返回的任意图片路径。

### 7.4 运行时失败处理

以下情况直接返回 `null`：

- 词汇未收录。
- 义项不能确认。
- 图片未收录。
- 图片资源加载失败。
- 用户关闭视觉词汇功能。

不得影响字幕正常渲染。

### 7.5 Chrome Extension 资源访问

- 图片应随 Extension 一起打包。
- 默认不发起图片网络请求。
- 根据资源运行的实际上下文配置 Manifest V3。
- 如果内容脚本需要向网页文档加载 Extension SVG，应配置最小范围的 `web_accessible_resources`。
- 不得无条件暴露全部扩展资源。

---

## 8. License 与版权合规

### 8.1 OpenMoji 许可

项目：

https://github.com/hfg-gmuend/openmoji

许可证：

https://creativecommons.org/licenses/by-sa/4.0/

OpenMoji 图形采用 **CC BY-SA 4.0**。

许可允许商业使用、复制、分享和改编，但需要履行署名和相应的 ShareAlike 义务。

### 8.2 必须执行的要求

1. 记录 OpenMoji 来源和固定版本。
2. 保存 CC BY-SA 4.0 许可文本或相应正式许可资料。
3. 在插件 About / Licenses 页面显示 OpenMoji 署名。
4. 提供项目及许可链接。
5. 记录图形是否经过修改。
6. 改编图形遵循相同的 ShareAlike 许可证。
7. 不得暗示 OpenMoji 官方认可或赞助本插件。
8. 不得将 OpenMoji 图形重新宣称为独占或 MIT 许可。

建议署名：

> All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0.

### 8.3 License 边界

图片素材、词汇数据库及插件代码分别管理许可证。

使用 OpenMoji 图片不应被简单解释为整个插件源代码自动变成 CC BY-SA 4.0；但经过改编的图形以及可能涉及的改编材料，需要独立评估 ShareAlike 义务。

OpenMoji 的构建辅助代码可能使用 LGPL-3.0，不能因为图片采用 CC BY-SA 4.0 就认为所有仓库文件拥有同一许可证。

如果使用 OpenJLPT：

- 保留 OpenJLPT 的 CC BY-SA 4.0 声明。
- 保留适用的上游来源署名及 `NOTICE.md`。
- 对再分发的改编词汇数据履行相应义务。
- 记录具体数据版本。

发布前应针对最终分发的素材及数据进行许可证检查。

---

## 9. 性能与包体积

目标：新增图片资源尽可能保持在几 MB 内。

初始参考预算：

- 100 张图片：目标不超过 1 MB。
- 300 张图片：目标不超过 2 MB。
- 500 张图片：目标不超过 3 MB。

以上是目标值，不是 OpenMoji 实际体积保证。

必须测量：

- SVG 文件数量。
- SVG 总字节数。
- JSON 总字节数。
- ZIP/CRX 压缩后增量。
- 运行时首次索引加载时间。
- 单次词汇查询耗时。

建议使用哈希文件名或版本化资源清单进行缓存管理。

运行时避免每出现一个词就重新解析整个 JSON。

---

## 10. 验收标准

### 10.1 数据正确性

- 每个正式词条都具有稳定 ID。
- 每个映射都指向真实存在的 Concept。
- 每个正式 Concept 都通过人工审核。
- 每个图片 ID 都存在对应 OpenMoji SVG。
- 一词多义不会错误显示不相关图片。
- 词形变化可以关联到正确词条。
- 相同 SVG 不重复打包。

### 10.2 多语言扩展

增加英语、韩语等语言时：

- 不需要修改 Concept 模型。
- 不需要复制现有图片。
- 只需要增加语言词库和映射。
- 支持不同语言词条复用同一 Concept。

### 10.3 性能

- 完全离线运行。
- 无运行时 Python 依赖。
- 无外部图片请求。
- 不阻塞字幕渲染。
- 图片查询失败后正常降级。

### 10.4 License

- 图片素材只来自 OpenMoji。
- 版本来源可追溯。
- 许可证和署名完整。
- 修改记录完整。
- 构建脚本能发现缺失的版权信息。

### 10.5 筛选质量

- 筛选过程可复现。
- 四维权重符合 40/35/15/10。
- 可辨识度低于 60 的图片不得进入正式结果。
- 未评分项目不能自动伪造分数。
- 统计报告分别列出候选词数、已审核 Concept 数、唯一 SVG 数、关联义项数及实际包体积。

---

## 11. 实施计划

### Phase 1：资源与数据模型

完成：

- 导入 OpenMoji 固定版本。
- 解析 OpenMoji 元数据。
- 建立 Concept Schema。
- 建立 Vocabulary Schema。
- 完成 License 文件管理。
- 编写数据验证器。

交付标准：能够验证并加载至少 10 个人工映射的 Concept。

### Phase 2：日语 MVP

完成：

- 导入 OpenJLPT N5/N4 词汇。
- 建立初始语义概念。
- 实现图片候选匹配。
- 完成首次人工审核。
- 接入可用字幕词频数据。
- 实现评分与排序。
- 输出最多 100 张已审核图片。

交付标准：Chrome Extension 能根据日语字幕词汇显示对应 OpenMoji 图片。

### Phase 3：扩展至 500 张

完成：

- 扩充候选概念。
- 审核图像准确性。
- 去重和打包优化。
- 输出资源覆盖报告。
- 完成许可证校验。
- 形成可重复构建流程。

交付标准：能够生成最多 500 张经过审核的唯一 SVG，而不是只依据数量强制填满。

### Phase 4：多语言验证

选择英语作为第二种语言。

验证：

- 同一 Concept 可以关联日语及英语词汇。
- 图片无需重复复制。
- 不同语言独立导出资源索引。
- 增加语言不会破坏现有日语映射。

---

## 12. 交付要求（给编码 AI）

实施时必须交付：

1. 完整的 Python 构建工具。
2. JSON Schema 和数据格式示例。
3. 固定版本的 OpenMoji 导入工具。
4. 日语 N5/N4 词汇导入工具。
5. 词汇与图片候选匹配工具。
6. 审核状态与审核清单机制。
7. 评分、排序、去重逻辑。
8. Chrome Extension 可直接使用的资源包。
9. TypeScript 图片查询接口与调用示例。
10. License 文件、署名文件及检查逻辑。
11. 单元测试和构建验收报告。
12. README，包括命令、版本、限制和资源更新方法。

**严禁：**

- 为凑够 500 张而编造词汇图片映射。
- 将尚未审核的视觉映射标记为已通过。
- 将主观估计冒充真实字幕频率。
- 引入 OpenMoji 之外的第三方图像。
- 忽略许可证及上游数据来源。
- 为这一功能引入不必要的服务器或数据库。

## 最终技术决策

采用 **OpenMoji + Multilingual Concept Mapping + Python Offline Builder + Static Chrome Extension Assets**。

优先交付 100 张可验证、可维护、符合许可证的日语词汇图片，再扩展到 500 张及更多语言。

设计的核心价值不是拥有大量图片，而是建立一个可持续扩展、语义准确、资源轻量、许可证可追溯的多语言视觉词汇系统。
