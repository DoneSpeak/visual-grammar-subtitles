# 字幕学习增强技术设计 V2

日期：2026-10-31  
状态：设计方案；未读取项目源码、未实施、未实测  
目标项目：`/Users/ygr/Code/mygithub/chrome-extension-video-subtitles-language`  
建议位置：`docs/japanese-subtitle-nlp-design.md`

本版取代 V1 的单句远程调用方案，细化整份字幕解析、分析文件、缓存与学习模式渲染。本文“选择字幕”指选择字幕文件/字幕轨；点击某个字词仅用于查看解释，不触发整份文件上传。

## 1. 最终架构决定

**两种分析来源，一种分析文件协议，一套渲染器。**

| 概念 | 决定 |
| --- | --- |
| Local NLP | 浏览器内 Kuromoji.js + 规则；无 Python 服务也可使用 |
| Remote NLP | 用户本机运行 Python + GiNZA HTTP API；插件配置 URL 后上传字幕文件 |
| 分析文件 | 自包含的 `.sanno.json` 文件：文本、时间轴、token、标注与版本 |
| 渲染 | 始终在浏览器插件执行；服务端返回结构化数据 |
| 缓存 | 扩展 IndexedDB 持久保存分析文件；可导入/导出 JSON |
| 学习模式 | 按标注标签匹配的样式规则集合 |
| 用户配置 | 独立于分析文件；修改样式、切换模式不触发 NLP |

Remote 是调用方式，不意味着云服务。默认示例为 `http://127.0.0.1:8765`。插件不会自动启动电脑上的 Python 进程；用户独立启动服务，插件负责检测和调用。

### 默认工作流程

1. 用户选择字幕 → 浏览器解析原字幕并立即显示。
2. 计算规范化内容指纹 → 查询兼容的持久缓存。
3. 命中有效 Remote 缓存：直接渲染；不重复上传。
4. 无 Remote 缓存：使用已有 Local 缓存，或即时计算当前及临近 cue。
5. 开启 Remote 且已配置 URL：无有效 Remote 缓存时提交整份字幕分析任务。
6. 分析完成 → 下载并校验完整文件 → 原子写入缓存。
7. 在下一次 cue 边界切换到 Remote；暂停状态可以立即切换，播放不中断。
8. 服务不可用、结果无效或任务失败：继续 Local，显示简短状态并提供手动重试。

“关闭 Remote 分析”默认表示停止网络请求，已缓存/已导入的 Remote 结果仍可离线使用。如需完全排除 Remote 结果，另提供高级设置 `analysisSourcePreference: local-only`，避免把隐私开关和数据来源选择混在一起。

## 2. 职责与运行位置

| 模块 | 职责 |
| --- | --- |
| Subtitle Loader | 读取用户所选 SRT/VTT，保留原始文件与原文 |
| Track Normalizer | 解码、格式解析、生成 cue ID、规范文本及内容指纹 |
| Analysis Repository | IndexedDB 查询、版本检查、事务写入、导入导出、LRU |
| Analysis Coordinator | 选择 Local/Remote 来源、触发任务、处理进度与过期结果 |
| Local Analyzer | 分词、词性、读音、基础分组与表达规则 |
| Remote Client | 服务检测、上传、轮询、下载、取消任务 |
| Annotation Validator | 结构、hash、offset、引用、大小及能力检查 |
| View Compiler | 将重叠标注转成可渲染片段，计算最终样式 |
| Subtitle Renderer | 输出文本节点、span/ruby；时间同步与布局 |
| Profile Store | 内置学习模式、用户样式、配置迁移与恢复默认 |
| Python API | 字幕解析、跨 cue 上下文、GiNZA、角色映射、分析文件生成 |

建议宿主：Content Script 负责字幕 DOM；扩展 Offscreen Document 承载 Dedicated Worker 和分析任务协调；Service Worker 处理权限及消息路由。遵守 Offscreen 的扩展 API 限制，通过 runtime 消息沟通。Popup 只改配置，不拥有任务生命周期。

Offscreen 使用 `WORKERS` reason，并复用同一文档。宿主重建后从 IndexedDB 恢复任务 ID 和缓存；不能假设 Service Worker 长时间存活。实现前验证现有项目的宿主路径，保留现有 UI 框架和构建工具。

## 3. 分析能力与降级

| 能力 ID | 内容 | Local | Remote |
| --- | --- | --- | --- |
| `token.pos` | 分词与词性 | 支持 | 支持 |
| `token.reading` | 词条读音/假名 | 尽力支持 | 尽力支持 |
| `chunk.heuristic` | 规则辅助分组 | 支持 | 可选 |
| `chunk.bunsetsu` | 文节 | 不承诺 | GiNZA |
| `syntax.dependency` | 依存关系 | 不承诺 | GiNZA |
| `syntax.role` | 教学语法成分 | 不承诺 | 模型 + 映射规则 |
| `expression.grammar` | 语法表达 | 规则 | 规则 |
| `speech.observed` | 视频真实发音 | 不支持 | 本期不支持 |

能力同时记录在 provider 和分析单元中；文档级能力表示“存在这种能力”，不表示每句成功。读音字段允许缺失；模型推断与人工校验状态分开记录。

日语：主题不等于主语，文节不等于学习语块，依存标签不等于语义角色。省略的主语不虚构为可着色文本；不确定内容可不标注。

## 4. 分析文件格式：Subtitle Annotation Document

扩展名：`.sanno.json`；媒体类型：`application/json`；编码：UTF-8。应用内名称可称“已解析字幕”。JSON 是文件内容，不包含 HTML、CSS、脚本或字体二进制。

### 4.1 结构层次

| 字段 | 用途 |
| --- | --- |
| `format` / `schemaVersion` | 协议标识、语义版本 |
| `documentId` / `createdAt` | 分析产物身份与时间 |
| `source` | 原文件 hash、规范化算法与 trackHash |
| `track` | 字幕语言、cue 时间轴及原始显示文字 |
| `providers` | 引擎、模型、词典、规则、配置版本与来源 |
| `units` | 分析文本、cue 映射、token 和标注 |
| `diagnostics` | 单元失败/残句等诊断 |
| `extensions` | 命名空间扩展字段 |

### 4.2 文件示例

以下为协议示意与人工构造的分词/语法结果，不代表 GiNZA 实际输出。占位 hash 需由实现替换，示例不作为校验通过的正式 fixture。

```json
{
  "format": "subtitle-annotation",
  "schemaVersion": "1.0.0",
  "documentId": "doc-001",
  "createdAt": "2026-10-31T06:00:00Z",
  "source": {
    "format": "srt",
    "rawSha256": "<64-hex>",
    "normalizationVersion": "track-v1",
    "trackHash": "<64-hex>"
  },
  "track": {
    "language": "ja",
    "cues": [
      { "id": "c000001", "startMs": 1000, "endMs": 3000,
        "text": "私は日本語を勉強します。" }
    ]
  },
  "providers": [
    {
      "id": "p-remote",
      "kind": "remote",
      "engine": "ginza",
      "engineVersion": "<pinned>",
      "modelVersion": "<pinned>",
      "dictionaryVersion": "<pinned>",
      "ruleVersion": "ja-rules-1",
      "configHash": "<64-hex>",
      "capabilities": ["token.pos", "syntax.role"]
    }
  ],
  "units": [
    {
      "id": "u000001",
      "providerId": "p-remote",
      "status": "complete",
      "capabilities": ["token.pos", "syntax.role"],
      "text": "私は日本語を勉強します。",
      "offsetEncoding": "utf16",
      "mappings": [
        { "unitStart": 0, "unitEnd": 12,
          "cueId": "c000001", "cueStart": 0, "cueEnd": 12 }
      ],
      "tokens": [
        { "id": "t1", "start": 0, "end": 1, "surface": "私", "pos": "PRON", "lemma": "私", "reading": "ワタシ" },
        { "id": "t2", "start": 1, "end": 2, "surface": "は", "pos": "ADP" },
        { "id": "t3", "start": 2, "end": 5, "surface": "日本語", "pos": "NOUN" },
        { "id": "t4", "start": 5, "end": 6, "surface": "を", "pos": "ADP" },
        { "id": "t5", "start": 6, "end": 8, "surface": "勉強", "pos": "NOUN" },
        { "id": "t6", "start": 8, "end": 9, "surface": "し", "pos": "VERB", "lemma": "する" },
        { "id": "t7", "start": 9, "end": 11, "surface": "ます", "pos": "AUX" },
        { "id": "t8", "start": 11, "end": 12, "surface": "。", "pos": "PUNCT" }
      ],
      "annotations": [
        { "id": "a1", "layer": "syntax.role", "label": "topic",
          "spans": [{ "start": 0, "end": 2 }], "quality": "model" },
        { "id": "a2", "layer": "syntax.role", "label": "object",
          "spans": [{ "start": 2, "end": 6 }], "quality": "model" },
        { "id": "a3", "layer": "syntax.role", "label": "predicate",
          "spans": [{ "start": 6, "end": 11 }], "quality": "model" }
      ],
      "dependencies": []
    }
  ],
  "diagnostics": [],
  "extensions": {}
}
```

### 4.3 Offset 与跨 cue 约定

- 所有文本偏移使用 UTF-16 code unit，左闭右开；与 JavaScript `slice` 一致。Python 必须通过映射表转换，不能直接输出 Python 字符索引。
- token 必须满足 `unit.text.slice(start,end) === surface`；区间不得越界、切开代理对或用于显示的字素簇。
- `track.cues[].text` 是已解析后的可见文本；SRT/VTT 标签由白名单解析器处理，不作为原始 HTML 执行。
- `mappings` 只映射完全相同的文字片段；两侧长度和切片文字必须相同。插入的句间分隔符不映射到任何 cue。
- 一条 cue 可拆成多个 unit；一个 unit 可跨多个 cue。选择分析来源后，每个可见 cue 字符最多归属一个被选中的 unit，避免重复着色。
- `spans[]` 支持不连续表达；映射到当前 cue 时取交集。同一个表达跨 cue 显示时保留 annotation ID，详情可显示完整文本。
- 依存边格式为 `{dependentTokenId, headTokenId, relation}`，根节点 `headTokenId: null`；引用限制在当前 unit。
- 空白不要求被 token 覆盖；未被覆盖的文字照常渲染。

### 4.4 标签、扩展与版本

- POS 采用统一标签：`NOUN/PROPN/VERB/AUX/ADJ/ADV/PRON/ADP/PART/SCONJ/CCONJ/DET/NUM/INTJ/PUNCT/SYM/X`。日语细分类保留 `rawPos` 和 `features`，不硬塞进名词/动词二选一。
- 教学角色：`topic/subject/object/predicate/modifier/adverbial/unknown`；更细类别通过命名空间标签增加。
- `quality` 为 `heuristic/model/reviewed`。无校准概率时不生成数值 confidence。
- `extensions` 的键采用 `vendor.feature`；未知可选字段和 layer 忽略，未知主版本拒绝。新增可选字段提升 minor，不兼容变更提升 major；不改变旧字段含义。
- JSON Schema Draft 2020-12 用于结构校验；hash、引用关系、区间映射和覆盖检查由语义校验器执行。插件/Python 各维护相同 fixtures，并用显式迁移函数升级旧文件。
- Schema 是两端共同契约，须独立于 GiNZA、Kuromoji 和 UI；内部模型对象不直接序列化为公共文件。

## 5. 源文件规范化与缓存身份

### 5.1 原文指纹与语义指纹

`rawSha256` 对原文件 bytes 计算，用于服务端验证上传和溯源；`trackHash` 对规范化后的可见文本与时间轴计算，用于缓存复用。

规范化 `track-v1`：

1. UTF-8 为默认；其他编码需要显式选择，解码错误不静默替换。
2. 去 BOM，统一换行 LF；SRT/VTT 格式解析后提取显示文本与整数毫秒时间。
3. 不做 NFKC、全半角替换或任意 trim；这些操作会改变显示文字和偏移。
4. 保留文件内 cue 顺序；重叠时间允许，负时间或结束早于开始拒绝。
5. 依顺序分配 `c000001` 等确定性 ID。
6. 对 `["track-v1", language, [[startMs,endMs,text],...]]` 做无空白 JSON UTF-8 序列化，再取 SHA-256。数组结构避免对象键顺序差异；不转义非 ASCII，不转义 `/`。

两端用相同测试向量验证序列化。服务端重新计算两个 hash；同一文件名不作为身份，重复句子通过 cue ID 区分。时间轴、语言或任何文字变更均得到新 trackHash。

### 5.2 缓存键

```text
analysisKey = SHA256(JSON([
  trackHash, schemaMajor, providerFingerprint, requestedCapabilities
]))
```

`requestedCapabilities` 去重排序。providerFingerprint 由引擎/模型/词典/规则/配置版本的固定顺序数组计算；不包含 API token、样式配置或 URL。API URL 是连接位置，不是模型版本。

缓存查找先按 trackHash + schemaMajor 找兼容产物，再比较能力与版本。不连服务也能使用已验证缓存；服务版本变化仅标记“可更新”，不自动废弃离线可用结果。用户主动重分析或开启自动更新策略时才刷新。

### 5.3 IndexedDB 数据表

| Store | key / 内容 |
| --- | --- |
| `analysisDocuments` | analysisKey → 完整、已校验文档；索引 trackHash |
| `analysisMetadata` | analysisKey → 来源、能力、版本、字节数、lastAccessedAt、pinned |
| `analysisJobs` | endpoint 标识 + trackHash → jobId、状态、generation、重试时间 |
| `settings` | Remote 配置、当前模式、用户样式、设置版本 |

文档与元数据同事务写入；未完成任务不得伪装成完整缓存。Remote 失败或更新失败时保留旧版本。默认建议缓存上限 100MiB，按未 pin 的 LRU 淘汰；配额不足则当前会话内存使用并提示未持久化。这是初始产品预算，需实测调整。

插件不能默认扫描 Mac 项目目录或任意本地文件夹。“看到缓存文件”具体指：IndexedDB 命中，或用户手动选择导入 `.sanno.json`。自动关联旁边同名文件夹需另行设计浏览器文件授权，不纳入本期。

## 6. 本机 Python API：文件级异步任务

### 6.1 配置

```json
{
  "remoteNlp": {
    "enabled": true,
    "baseUrl": "http://127.0.0.1:8765",
    "autoAnalyzeOnTrackSelect": true,
    "autoRefreshCachedAnalysis": false,
    "apiToken": "<stored-separately>"
  },
  "analysisSourcePreference": "prefer-remote",
  "activeProfileId": "pos-basic"
}
```

Token 单独保存在扩展本地设置，不同步、不导出进分析文件、不传递给页面。更换 URL 使进行中的任务与新 endpoint 隔离；不会将旧任务 ID 发给新服务。

### 6.2 接口列表

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| GET | `/v1/capabilities` | 返回 API/schema 版本、provider 指纹、支持格式、语言、能力、大小限制 |
| POST | `/v1/analyses` | multipart 上传字幕并创建后台任务，返回 202 |
| GET | `/v1/analyses/{jobId}` | 状态与进度 |
| GET | `/v1/analyses/{jobId}/result` | 成功后返回完整 `.sanno.json` |
| DELETE | `/v1/analyses/{jobId}` | 尽力取消任务；不是删除浏览器缓存 |

创建请求：

- `file`：原始 SRT/VTT 文件 bytes。
- `metadata`：JSON 字符串，包含 `rawSha256, trackHash, normalizationVersion, language, encoding, requestedCapabilities, schemaMajor`。
- `Authorization: Bearer ...`：配置的本机凭据。
- `Idempotency-Key`：根据 endpoint、trackHash、provider 指纹和能力集生成的稳定请求身份；同 key、不同 payload 返回 409。无需包含样式。

自动抓取字幕轨时，如果已有完整 cues 而没有文件，插件先导出无损项目内 `cue-json-v1` 文件再上传。通过 capabilities 协商该输入格式；不得把 DOM 的当前一句伪装为完整字幕文件。仅能观察实时 DOM 时降级 Local，并提示无完整轨道可上传。

创建返回示意：

```json
{
  "jobId": "job-001",
  "status": "queued",
  "trackHash": "<64-hex>",
  "providerFingerprint": "<64-hex>",
  "pollAfterMs": 1000
}
```

状态：`queued → running → succeeded | failed | cancelled`；进度包含 `completedUnits/totalUnits`，总数未确定时不显示虚假的百分比。`succeeded` 表示文件已完整生成且通过服务端校验；个别解析失败可记录为 `units[].status: failed`，文件整体仍可成功。

客户端轮询起点 1 秒、上限 5 秒并带抖动；尊重服务端建议。上传请求超时起点 30 秒，分析任务期限起点 10 分钟，均为待实测参数。轮询可随扩展宿主恢复；不保持一条数分钟的 HTTP 请求等待计算。

GET 可有限重试；POST 因响应丢失而重试必须复用 Idempotency-Key。服务端把幂等 key→jobId、请求摘要及任务状态持久化；重启后中断任务标记失败或重新排队，不永久停在 running。结果及去重记录建议保留 24 小时，过期后返回明确的 404/410，客户端允许重新提交。

错误响应统一为 `{code,message,retryable,details}`。建议：400 格式错误、401 认证失败、409 指纹/幂等冲突、413 超限、422 规范化不匹配、429 队列满、500 分析失败；429/临时故障可返回 Retry-After 秒数。HTTP 成功不代表结果可直接信任，仍需插件校验。

### 6.3 Python 内部管线

文件解码/解析 → 规范化/hash 验证 → 跨 cue 单元构造 → GiNZA 批处理 → 表达规则/教学角色映射 → UTF-16 与 cue 映射 → 文档校验 → 原子保存结果。

FastAPI 可作为 HTTP 层；先采用单独分析工作进程串行处理有限队列，HTTP 状态接口保持响应。限制队列长度和文件大小，不在 async 请求处理函数直接执行长时间 CPU 推理。初期不需要 Redis、Celery 或独立消息队列。

本机服务只绑定 loopback；为跨源调用验证扩展来源及凭据，不以 CORS 代替认证。不自动跟随提交文件内的 URL，不获取视频或外部资源，不执行字幕内容。能力接口也不暴露本机文件路径。

## 7. 来源选择、任务与失败策略

| 条件 | 当前显示 | 后台动作 |
| --- | --- | --- |
| 有兼容 Remote 缓存 | 使用 Remote | 默认不请求服务 |
| 无 Remote，有 Local 缓存 | 使用 Local | 开启 Remote 时提交任务 |
| 都没有 | 原文 → 当前 cue 的 Local 结果 | 同时按配置提交 Remote |
| Remote 文件部分单元失败 | 成功单元用 Remote，失败单元用 Local | 保留诊断，手动重试 |
| 服务不可用/权限拒绝 | Local | 显示原因；不无限重试 |
| 导入缓存 hash 不匹配 | 当前来源保持 | 拒绝附着到该字幕 |
| schema 主版本未知/结构损坏 | Local | 拒绝缓存并允许删除 |
| Remote 关闭 | 仍可用兼容已有缓存 | 不上传、不轮询；取消本客户端任务关注 |
| `local-only` | 只用 Local | 不请求 Remote、不选择 Remote 缓存 |

Local 与 Remote 分词可能不同，**不要合并两套 token ID**。按 cue 分配来源：仅当覆盖该 cue 的所需 Remote 单元均有效时才整条切换，否则整条保持 Local。文档保留两种产物，渲染一次只用选定来源的 token/标注；缺失某种能力时不借另一来源拼接 token。

选择字幕时递增 generation。旧任务允许完成并保存到它自己的 trackHash 缓存，但不能覆盖新字幕画面。按 trackHash/provider 去重进行中任务，多标签页共享分析，不因每次点击重复上传。

## 8. 学习模式：结构数据的不同视图

| 内置模式 | 主要标签 | 默认表现 |
| --- | --- | --- |
| `plain` 原文 | 无 | 原始字幕 |
| `pos-basic` 词性 | NOUN/VERB/ADJ/ADV 等 | 前景色 + 图例 |
| `syntax-focus` 语法成分 | topic/subject/object/predicate | 颜色与下划线 |
| `chunk-focus` 语块 | bunsetsu 或 heuristic | 间隔/背景分组，区分辅助分组 |
| `expression-focus` 表达 | expression.grammar | 背景强调，点击解释 |
| `reading-assist` 读音 | token.reading | ruby 假名 |

模式声明 `requiredCapabilities`、可选能力和 fallbackProfileId。`syntax-focus` 缺少语法角色时显示“当前使用本地词性模式，语法分析完成后可切换”，有效模式回退到 `pos-basic`，同时保留用户所选模式 ID。数据更新后重新计算有效模式。

用户可由内置模式复制自定义模式；内置配置只读，用户覆盖独立存储。恢复默认只删除覆盖；内置模式升级保留用户修改。模式不是 NLP 参数，不应加入分析缓存键。

## 9. 用户样式配置与冲突规则

### 9.1 配置样例

```json
{
  "format": "subtitle-style-profile",
  "schemaVersion": "1.0.0",
  "id": "my-pos",
  "basePresetId": "pos-basic",
  "baseStyle": {
    "fontFamilyId": "system-sans",
    "fontSizePx": 32,
    "color": "#FFFFFF",
    "backgroundColor": "#000000CC"
  },
  "rules": [
    {
      "id": "noun-style",
      "selector": { "layer": "token.pos", "labels": ["NOUN", "PROPN"] },
      "priority": 10,
      "style": { "color": "#60A5FA", "fontScale": 1.05 }
    },
    {
      "id": "verb-style",
      "selector": { "layer": "token.pos", "labels": ["VERB", "AUX"] },
      "priority": 20,
      "style": {
        "color": "#FB923C",
        "backgroundColor": "#431407AA",
        "underline": { "enabled": true, "style": "solid", "color": "#FB923C", "thicknessPx": 2 }
      }
    }
  ]
}
```

### 9.2 可配置属性

| 属性 | 约定 |
| --- | --- |
| 字体 | `fontFamilyId` 指向插件白名单字体/本机字体集合 |
| 字号 | 基础字号 `fontSizePx`；分类使用 `fontScale` 相对缩放 |
| 字色/背景色 | `#RRGGBB` 或 `#RRGGBBAA`；允许显式透明 |
| 下划线 | enabled、solid/dashed/dotted/wavy、颜色与厚度 |
| 可扩展项 | 字重、斜体、描边等通过版本化字段新增 |

建议边界：基础字号 12–96px，分类缩放 0.5–2.0，下划线厚度 1–4px；作为配置校验起点。不得接受任意 CSS、CSS selector、`url()` 或服务端下发样式。selector 是有限 JSON 条件，首期不支持执行表达式。

分类规则不设置绝对字号；最终字号 = 基础字号 × 胜出的 fontScale。若未来提供分类绝对字号，应增加显式互斥字段，不能让两种计算方式隐式叠加。自动适应字幕框时，对整行再施加统一缩放，保留词类之间的比例；限制最小可读字号并允许换行。

### 9.3 样式层级

从低到高：应用默认 → 当前内置模式 → 用户全局规则 → 当前模式用户覆盖 → 临时选中/悬停状态。

- 逐属性合并；更高层只覆盖它明确设置的属性，未设置的保留。
- 同一层按 priority 从小到大应用；相同 priority 按规则数组顺序应用，后者胜出。
- 字号倍率采用胜出值，不能把多个命中规则相乘。
- `underline.enabled: false` 明确关闭；`backgroundColor: #00000000` 明确清空；缺省字段表示继承。
- 取消某项用户覆盖时删除该字段，不用 null 同时表达“继承”和“清除”。

例：`勉強` 可同时是 NOUN、predicate 的一部分和某个表达的一部分。语法模式默认用角色色；用户若设置了全局 NOUN 字色，会按上述层级覆盖。设置页注明覆盖来源，并允许把规则限定到某个模式，避免隐藏的优先级。

## 10. 渲染算法与重叠区间

1. 根据播放时间取得 cue；按来源选择规则获得有效 unit 与标注。
2. 将 token、role、chunk、expression 区间映射为 cue 内偏移。
3. 收集所有起止边界，加上 0 和 text.length，排序去重。
4. 生成不重叠原子片段，每片保留覆盖它的标签及 annotation ID。
5. 匹配当前模式与用户规则，逐属性计算样式。
6. 相邻且样式、交互身份一致的片段合并，再创建文本节点与受控 span。
7. mode/style 更新只重跑视图编译，不重跑分词或重新上传。

交叉的角色/表达区间不能直接按任意顺序嵌套 span；使用原子区间避免非法 DOM 和文本丢失。语块背景用 annotation ID 计算首/中/尾样式；详情选择保留完整表达身份。

ruby 以完整 token 为注音单位：若细分片段需不同颜色，把细分 span 放入同一个 ruby 的基文字部分，读音只显示一次；无法可靠对齐时保留点击查看读音。不能对每个片段重复完整假名。

增大部分文字会改变行高和换行：统一 baseline、稳定行高策略，测量最终样式后的布局。字幕模式设置支持实时预览；颜色之外保留图例或下划线提示。动画帧只做时间同步，不在每帧重新分析或编译全部片段。

## 11. 网络与本地资源边界

- 用户启用并保存 URL 时，插件按目标 origin 请求 optional host permission；从扩展上下文 fetch，不从视频页面 Content Script 直接跨源上传 [1][2]。
- 默认支持 loopback HTTP；非本机 URL 默认要求 HTTPS。限制 URL scheme，拒绝内嵌用户名密码及不受控重定向，不将认证头转发到新 origin。
- 动态 URL 使用预声明 optional_host_permissions 的 scheme 范围，运行时只申请实际目标；不把可选范围等同于一次性授予全部主机。
- Chrome 本地网络访问规则在演进；必须在目标 Chrome 版本实测扩展上下文访问 loopback、权限拒绝与连接恢复，不能把网页端 CORS/PNA 方案直接当作扩展实现结论 [3]。
- Local 引擎、Worker、可执行 WASM 随插件构建；WASM 所需 CSP 与具体库兼容需集成验证 [4]。
- 初始建议限制：上传 10MiB、5 万 cues、返回 JSON 100MiB；客户端/服务端同时执行限制，capabilities 返回实际值；这些值需结合实际影片实测调整。
- 分析文件不存绝对本机路径、Token 或视频账号信息；导出文件包含完整字幕，应在导出按钮中明确内容范围。

## 12. 建议增量目录

```text
packages/subtitle-contract/    JSON Schema、TS 类型、协议 fixtures
src/subtitle/                 文件加载、规范化、时间轴、字符映射
src/nlp/local/                Kuromoji 适配与规则
src/nlp/remote/               API 客户端与任务状态机
src/nlp/coordinator/          来源选择、队列与 generation
src/storage/                  IndexedDB repository、迁移与 LRU
src/render/                   原子片段、样式解析、DOM/ruby 输出
src/profiles/                 内置模式、用户覆盖与配置迁移
src/offscreen/                分析宿主、Worker 及消息协议
services/nlp-api/              Python API、工作进程、持久任务
services/nlp-api/contracts/    构建时同步协议 schema/fixtures
```

这是建议布局，按现有项目结构映射；不要求改造成 monorepo。单一契约源构建时复制给 Python，不在两端手工维护两套语义不同的 schema。

## 13. 实施里程碑与验证

| 顺序 | 交付 | 验收重点 |
| --- | --- | --- |
| P0 | 协议 + fixture + 原文渲染 | Unicode、映射、hash 两端一致；非法文件拒绝 |
| P1 | Local → 同一文档结构 + 词性模式 | 无服务可用、关闭 Popup 继续工作、失败保留原文 |
| P2 | IndexedDB + 导入/导出 | 重启命中、原子写入、损坏/错轨拒绝、配额降级 |
| P3 | Python 文件任务 + Remote 自动分析 | 整份上传、进度、幂等、恢复、取消、失败回退 |
| P4 | 学习模式与自定义样式 | 切换无需 NLP；规则冲突、字号、交叉区间、ruby 正确 |
| P5 | 语块/语法角色/表达扩充 | 真实日语字幕评估误报漏报，保留未知结果 |

核心测试场景：

- emoji 在句首、组合字符、全角字符、重复句、换行、跨 cue 长句、重叠时间轴。
- 同一字幕改名命中缓存；时间轴/正文变更不误命中；客户端/服务端 trackHash 一致。
- 已缓存 Remote、服务关闭：仍能显示语法标注；Remote 开关关闭：无任何请求。
- 无缓存、服务关闭：Local 正常；任务进行时换字幕：旧结果只入旧缓存。
- 多标签页同时选同一轨：只创建一个幂等任务；响应丢失重试不重复计算。
- Remote/Local token 边界不同：按 cue 来源切换，不混用 ID；失败单元回退。
- 修改名词色、动词大小、下划线：画面更新，无 NLP 任务或缓存失效。
- Token 不进入导出文件；错误 origin、超大输入、错误 schema 与越界 span 被拒绝。

性能目标待实测：预热后 200 字符以内 Local 分析 P95 ≤ 100ms；原始字幕不等待分析；无 >50ms 的 NLP 主线程长任务。整片解析单独记录耗时、内存峰值、产物大小及失败单元数，不套用单句延迟预算。先用 30–50 条真实字幕评估，再用完整长片评估资源上限。

## 14. 后续扩展边界

新增语言通过独立 Analyzer 适配器接入同一协议；不同语言的角色与细分类保留命名空间。新增音调、JLPT、词频、翻译等作为新 layer/字段与能力出现，不改已有 token offset 语义。音调词典需确认授权；词条读音、音调预测和真实音频观察分别建模。

LLM 可在用户点击时提供解释，不进入整轨实时主链路。更换引擎或增加规则只影响 provider 指纹和相关分析缓存；用户样式继续复用。

## 15. 参考依据

产品流程、协议字段、缓存预算、接口和样式优先级均为本设计决策；不是外部标准规定。

1. Chrome 扩展跨源请求：<https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
2. Chrome 可选权限：<https://developer.chrome.com/docs/extensions/reference/api/permissions>
3. Chrome Local Network Access：<https://developer.chrome.com/blog/local-network-access>
4. Chrome 扩展 CSP：<https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy>
5. Chrome Offscreen：<https://developer.chrome.com/docs/extensions/reference/api/offscreen>
6. Kuromoji.js：<https://github.com/takuyaa/kuromoji.js>
7. GiNZA：<https://github.com/megagonlabs/ginza>
8. Sudachi：<https://github.com/WorksApplications/Sudachi>

当前环境无法访问目标 Mac 目录；本文件尚未写入该项目，也没有实际插件测试结果。
