# 字幕学习增强技术设计 V2.1

日期：2026-10-31  
状态：设计方案；已核对现有 `src/features/options`、`src/features/overlay/tokenize` 实现；未实施、未实测  
目标项目：`/Users/ygr/Code/mygithub/chrome-extension-video-subtitles-language`  
建议位置：`docs/japanese-subtitle-nlp-design.md`

本版取代 V1 的单句远程调用方案，细化整份字幕解析、分析文件、缓存与学习模式渲染。本文“选择字幕”指选择字幕文件/字幕轨；点击某个字词仅用于查看解释，不触发整份文件上传。

V2.1 相对 V2 的审核结论：

- 新增“元素”作为唯一配色单位（词性、语法角色、语块、表达、读音），每个元素可配色、透明度、大小、下划线、文字背景色；V2 的 `rules[]` 只覆盖颜色与字号，且按全局选择器组织，无法表达上述五项。
- 学习模式从“渲染开关”升级为“元素族 + 独立调色板”：不同模式的信息通道不同（前景色 / 下划线 / 背景块 / ruby 字号），共用一套颜色会把名词蓝误读为主题蓝。
- 配色页并入导航“学习”分组下的“学习模式”页：顶部模式卡片画廊（每张带真实渲染预览），下方当前模式的预览 + 元素配置；`#colors` 作为别名重定向。
- 语法解析服务配置按模式能力条件渲染：只有需要 Remote 的模式才展开 URL/token/检测，本地模式不显示该区块。
- 现有实现与本文冲突，按本文为准：`src/features/overlay/tokenize/render.ts:66-70` 硬编码角色色与模式分支；`src/shared/posColors.ts` 只有 8 个词性颜色；`src/features/options/pages/ColorsPage.tsx` 只有一个全局调色板；`src/features/options/pages/NlpSettings.tsx` 在配色页内承载模式选择且文案硬编码中英双语。
- 学习模式归属需纠正：它是渲染配置，不是 NLP 参数，应从 `NLP_SETTINGS_KEY` 移出到样式存储。

## 1. 最终架构决定

**两种分析来源，一种分析文件协议，一套渲染器。**

| 概念 | 决定 |
| --- | --- |
| Local NLP | 浏览器内 Kuromoji.js + 规则；无 Python 服务也可使用 |
| Remote NLP | 用户本机运行 Python + GiNZA HTTP API；插件配置 URL 后上传字幕文件 |
| 分析文件 | 自包含的 `.sanno.json` 文件：文本、时间轴、token、标注与版本 |
| 渲染 | 始终在浏览器插件执行；服务端返回结构化数据 |
| 缓存 | 扩展 IndexedDB 持久保存分析文件；可导入/导出 JSON |
| 学习模式 | 一组“元素”及其独立调色板；切换只重编译视图 |
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
| `chunk.bunsetsu` | 文节 | 规则切分（近似） | GiNZA |
| `syntax.dependency` | 依存关系 | 不承诺 | GiNZA |
| `syntax.role` | 教学语法成分 | 不承诺 | 模型 + 映射规则 |
| `expression.grammar` | 语法表达 | 规则 | 规则 |
| `token.level` | 学习计划级别词 | 词典 `lv` | 词典 `lv` |
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
  "analysisSourcePreference": "prefer-remote"
}
```

`activeProfileId` 不在 NLP 配置里，移至样式存储（§9.4）。

Token 单独保存在扩展本地设置，不同步、不导出进分析文件、不传递给页面。更换 URL 使进行中的任务与新 endpoint 隔离；不会将旧任务 ID 发给新服务。

### 6.2 接口列表

路由约定：`/api/v1/` 为后端接口，`/ui/` 为浏览器设置页。

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| GET | `/api/v1/capabilities` | 返回 API/schema 版本、provider 指纹、支持格式、语言、能力、大小限制 |
| POST | `/api/v1/analyses` | multipart 上传字幕并创建后台任务，返回 202 |
| GET | `/api/v1/analyses/{jobId}` | 状态与进度 |
| GET | `/api/v1/analyses/{jobId}/result` | 成功后返回完整 `.sanno.json` |
| DELETE | `/api/v1/analyses/{jobId}` | 尽力取消任务；不是删除浏览器缓存 |

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

### 8.1 预设 = 功能点组合

学习模式不是 NLP 参数，而是一组“功能点”的预设组合。内置预设只是初始值：**内置预设可直接编辑**（改后标记 `customized`，可恢复默认），也可以新建自定义预设（`custom:<uuid>`），并按功能点自由搭配。任意预设都能**复制**：副本是自定义预设，完整继承源预设的功能点、`base` 与全部元素覆盖（含下划线子对象深拷贝），且不继承 `customized`，因此复制内置预设后再改不会污染源预设。

| 内置预设 | 功能点 | 默认表现 |
| --- | --- | --- |
| `plain` 原文 | — | 原始字幕 |
| `pos-basic` 词性 | `pos` | 前景色 + 图例 |
| `syntax-focus` 语法成分 | `syntax` | 颜色与下划线 |
| `chunk-focus` 语块 | `chunk-rule` | 半透明背景块 + 下划线，首/中/尾只圆外侧角 |
| `expression-focus` 表达 | `expression` | 背景强调 |
| `reading-assist` 读音 | `reading` | ruby 假名字号/颜色 |

`chunk-focus` 默认用**本地规则**切分，不依赖语法服务；GiNZA 文节作为独立功能点 `chunk` 提供，与 `chunk-rule` 互斥。能力标签与回退行为由功能点的 `requires` 推导，不按预设 id 硬编码。需要 Remote 功能点而服务未就绪时，有效预设只保留其本地功能点（`localOnlyPreset`），用户选择不变。

预设不是分析缓存键的一部分；切换预设只重编译视图。

### 8.1.1 功能点注册表

| 功能点 | 分组 | 来源 | 依赖 | 互斥 | 元素 |
| --- | --- | --- | --- | --- | --- |
| `pos` | token | 本地分词 | — | — | `token.pos:*` |
| `nouns` | token | 本地分词 | `pos` | — | 复用 `token.pos:NOUN` |
| `reading` | token | 本地分词 | — | — | `token.reading:ruby` |
| `expression` | rule | 本地规则 | — | — | `expression.grammar:all` |
| `level` | rule | 本地规则 | — | — | `token.level:plan` |
| `chunk-rule` | rule | 本地规则 | — | `chunk` | `chunk.bunsetsu:{first,middle,last,only}` |
| `syntax` | remote | 语法解析 | — | — | `syntax.role:*` |
| `chunk` | remote | 语法解析 | — | `chunk-rule` | 同 `chunk-rule` |

规则（`src/shared/studyFeatures.ts`）：

- 启用某功能点会拉入其依赖，并挤掉互斥对手（点击总能生效）；关闭依赖时，依赖它的功能点一并关闭。
- 来源分组固定为「本地分词 / 本地规则 / 语法解析」，设置页按此分组呈现，组头标注能力徽标。
- `nouns` 不新增元素：它把 `base.focusElement` 设为 `token.pos:NOUN`、`dimOpacity` 设为 0.35，非名词整体变淡。

本地规则标注（`tokenize/local.ts`）在 content script 内完成：文节切分以助詞/助動詞/動詞/形容詞/記号/接続詞/感動詞 为边界；固定表达按 `src/shared/grammarPatterns.ts` 的模式跨 token 匹配；计划级别词按内联词典条目的 `lv` 与 `dictSettings.levels` 命中。三者写入与远程分析相同的 `grammar` / `groups` 字段，渲染层不区分来源。

### 8.2 元素

“元素”是本功能唯一的样式单位：可被规则命中、可被单独配色的一段语义文本。词性、词组、短语、语法成分、读音一律建模为元素，不设并行概念。

元素 id 为 `<layer>:<label>`，与标注层同名，避免两套词汇：

| 功能点 | 元素 id | 数量 |
| --- | --- | --- |
| `pos` | `token.pos:NOUN` … `token.pos:X` | 8 |
| `syntax` | `syntax.role:topic` / `subject` / `object` / `predicate` / `modifier` / `adverbial` | 6 |
| `chunk-rule` / `chunk` | `chunk.bunsetsu:first` / `middle` / `last` / `only` | 4 |
| `expression` | `expression.grammar:all` | 1 |
| `level` | `token.level:plan` | 1 |
| `reading` | `token.reading:ruby`（`rt` 文本） | 1 |

语块位置按标注 id 推导：`Token.groups['chunk.bunsetsu']` 相同且下标相邻的 token 属于同一文节，首/中/尾/整块由此决定。本地规则与远程分析写同一个键，两类来源可互换。

`plain` 无元素。一条文字片段可同时命中多个元素（如 `勉強` 是 NOUN、谓语的一部分、又属于某表达），按 §9.3 逐属性合并；元素不等于互斥分类。未命中的文字用基础样式，不被任何元素着色。

### 8.3 每模式独立调色板

显示通道不同，所以调色板必须分模式：

- `pos-basic` 只改前景色，词性之间靠色相区分。
- `syntax-focus` 靠颜色 + 下划线表达角色，同一颜色在不同角色上可能混淆。
- `chunk-focus` 靠背景块与首/中/尾衔接表达分组，背景必须半透明以免盖住文字。
- `expression-focus` 靠背景强调，通常只一个小元素。
- `reading-assist` 靠 ruby 字号与颜色，基文字基本保持不动。

**语块块间距只能用圆角 + 半透明背景 + 下划线表达**，不能用 margin/padding：字幕换行依赖 `unitsOf()` 对 token 宽度的测量，任何插入的空白都会让测量失真。相邻 token 因 ruby 与词典点击保持独立 span，观感上的连续靠相同的背景色与内侧不圆角实现。

任何元素都可切换到「仅下划线」：此时解析结果删除 `color`，文字继承基础色，只绘制下划线（`textColorMode: 'underline-only'`）。

把一套 POS 颜色套进语法模式，会把“名词蓝”误读成“主题蓝”。因此：

- 调色板 = 该模式的元素列表 + 每个元素的 `ElementStyle`（§9.1）+ 该模式的基础样式；切换模式同时切换预览、元素列表与配色。
- 内置调色板只读；用户修改只存覆盖；恢复默认只清当前模式的覆盖。
- 支持“从其他模式复制配色”：只复制 id 相同的元素，缺失的元素跳过并提示，不做模糊映射。
- 切换模式只重跑 View Compiler，不触发 NLP、不使分析缓存失效。

### 8.4 例句预览

- 预览必须复用播放页的 View Compiler 与 `renderTokens`，不得另写预览渲染器；同一函数、同一数据形状。
- 所有预设共用**一条**静态已标注 fixture（`lib/study-fixtures.ts`）：词性、语法角色、一个三 token 文节（含中位）、固定表达、计划级别词与读音齐全，随包内置，不调用 NLP、不读页面 DOM。fixture 由真实的本地标注器生成，而不是手写标签，避免预览与播放不一致。
- 预览按预设的功能点裁剪：启用什么就显示什么，因此新增/切换功能点会立即反映在卡片与主预览上。元素行另用 `SAMPLE_TOKENS` 提供示例词；确实覆盖不到的元素显示占位，不用默认样式冒充已配置效果。
- 预览容器模拟字幕框：基础字号 32px、深/浅两种底色可切换（颜色要在任意画面上可读），下方显示图例 chips。
- 修改任一元素属性后立即重渲染预览；不写缓存、不派发任务。
- 有效模式发生回退时，预览上方显示回退说明，预览内容按回退后的模式渲染。

### 8.5 导航与信息架构

“词性配色”不再单独成页，并入新的“学习模式”页（`#modes`），放在导航“学习”分组，与词典、词汇并列：

| 分组 | 页面 |
| --- | --- |
| 学习 | 词典、词汇、**学习模式**（`modes`） |
| 外观 | 移除 `colors` |

理由：每模式有独立调色板后，`colors` 与 `modes` 会编辑同一份数据，形成双源；`pos-basic` 只是六个模式之一。

`#colors` 保留为深链别名，重定向到 `#modes` 并默认选中 `pos-basic`。旧书签不失效，也不留下第二个入口。

### 8.6 学习模式页布局

```text
┌ 学习模式 ─────────────────────────────────────────────────────┐
│ 模式卡片（每张：名称 + 一行真实渲染预览 + 能力标签）            │
│ ┌原文──┐ ┌词性✓─┐ ┌语法成分┐ ┌语块──┐ ┌表达──┐ ┌读音──┐      │
│ │ 字幕 │ │ああ… │ │ 本地需 │ │ 语块 │ │ 表达 │ │ かな │      │
│ └──────┘ └──────┘ └────────┘ └──────┘ └──────┘ └──────┘      │
├────────────────────────────────┬──────────────────────────────┤
│ 当前模式预览（sticky，深/浅底） │ 元素（当前模式）               │
│  ┌ 16:9 字幕框 ─────────────┐  │ ▸ 名词  ●#1E90FF  ●背景       │
│  │ ああ、しかし彼は…        │  │ ▸ 动词  ●#E5533D  ●背景       │
│  └──────────────────────────┘  │ ▸ 助词  …                     │
│  图例 chips                     │ 展开：不透明度/大小/下划线/    │
│  基础字号 · 字幕底色 · 恢复默认 │ 文字背景色/重置                │
├────────────────────────────────┴──────────────────────────────┤
│ ▸ 语法解析服务（仅当前模式需要 Remote 时渲染）                  │
└───────────────────────────────────────────────────────────────┘
```

- 模式卡片即模式选择器，选中态用边框 + 对勾，不只靠颜色；支持方向键切换与 `aria-selected`。
- 卡片上的能力标签由预设所含功能点的 `requires` 计算，不按预设 id 硬编码：`syntax`、`chunk`（GiNZA 文节）需要 Remote；`pos`、`nouns`、`reading`、`expression`、`level`、`chunk-rule` 本地即可。
- 宽屏两列（预览 5/12、元素 7/12）；窄屏单列，模式卡片两列网格，预览吸顶。不做嵌套滚动。
- 元素行默认折叠，只露名称、示例、字色、背景色；展开后是五项控制。滑杆用原生 `range`，命中区高度 ≥44px。
- 控件复用 `design-system` 的 swatch/toggle；新增滑杆、可折叠行须补 `*.stories.tsx`。预览面板依赖 overlay 渲染器，留在 `src/features/options/`，不进 design-system。
- 不引入新字体或新色板，全部走现有 CSS 变量与 `data-theme`；图标用 Lucide，不用 emoji。
- 所有文案加到 `src/shared/i18n/messages/options-colors.ts`；删除 `NlpSettings.tsx` 里的硬编码中英双语字符串。

### 8.7 语法解析配置的条件展开

“语法解析服务”（现 `NlpSettings` 的内容）只在当前模式需要 Remote 时出现：

| 当前模式 | 是否显示 | 形态 |
| --- | --- | --- |
| 需要 Remote 且未配置 | 显示，自动展开 | 提示“该模式需要语法解析服务”，URL/token/检测按钮直接可见 |
| 需要 Remote 且已配置 | 显示，收起为一行 | `已连接 · <engine> <version>` + 展开箭头 + 状态点 |
| 需要 Remote 且服务不可用 | 显示，展开 | 错误原因 + 重试；预览按回退模式渲染并标注 |
| 本地模式 | 不渲染整块 | 一行说明“本地分词即可，无需服务”，仅在有连接配置时提供入口 |

- 展开条件由模式能力推导（`requiresRemote`），不使用模式名列表；新增模式自动获得正确行为。
- 未配置时不在页面顶部弹错误，只在模式卡片与该区块内提示，避免打断配色。
- 检测连接使用 loading → 成功/失败状态，结果 `aria-live="polite"`；保存自动进行，无需单独“保存”按钮。
- 服务配置与样式配置分属不同存储（§9.4），清空连接不影响已选模式与配色。

## 9. 用户样式配置与冲突规则

### 9.1 配置样例

```json
{
  "version": 3,
  "activePresetId": "pos-basic",
  "presets": {
    "pos-basic": {
      "id": "pos-basic",
      "features": ["pos"],
      "base": { "dimOpacity": 1, "focusElement": null },
      "elements": {
        "token.pos:NOUN": { "color": "#60A5FA", "fontScale": 1.05 },
        "token.pos:VERB": {
          "color": "#FB923C",
          "opacity": 0.95,
          "fontScale": 1.1,
          "backgroundColor": "#431407AA",
          "underline": { "enabled": true, "style": "solid", "color": "#FB923C", "thicknessPx": 2, "offsetPx": 4 }
        }
      },
      "customized": true
    },
    "custom:4d1f": {
      "id": "custom:4d1f",
      "name": "名词 + 计划词",
      "features": ["pos", "nouns", "level"],
      "base": { "dimOpacity": 0.35, "focusElement": "token.pos:NOUN" },
      "elements": {
        "token.level:plan": { "textColorMode": "underline-only", "underline": { "enabled": true, "color": "#FBBF24", "thicknessPx": 3, "offsetPx": 5 } }
      }
    }
  }
}
```

未列出的元素沿用 `defaultElementsFor(features)` 的内置调色板；未列出的属性沿用低层值。`presets[*].elements` 只保存用户覆盖，不保存内置默认值。`base` 由功能点推导（`baseForFeatures`），`nouns` 会把它设为聚焦名词。

### 9.2 元素可配置属性

| 属性 | 约定 |
| --- | --- |
| `enabled` | 元素默认生效；只有 `false` 会被保存。关闭的元素不参与合并（任何属性都不贡献），未命中的 token 保持默认颜色。聚焦元素被关闭时不施加变暗 |
| `color` | 文字颜色，`#RRGGBB` 或 `#RRGGBBAA` |
| `opacity` | 0–1，作用于该元素生成的整个片段（文字、背景、下划线）；缺省继承 1 |
| `fontScale` | 相对缩放 0.5–2.0；最终字号 = 基础字号 × 胜出值 |
| `underline` | `enabled`、`solid/dashed/dotted/wavy`、`color`、`thicknessPx` 1–6、`offsetPx`（与文字的间距）0–12 |
| `backgroundColor` | 文字背景色，`#RRGGBBAA`；`#00000000` 表示显式透明 |
| `radiusPx` / `radiusSides` | 背景块圆角 0–16；`all` / `start` / `end` 决定圆哪几边，语块首尾只圆外侧 |
| `textColorMode` | `color`（默认）或 `underline-only`；后者删除 `color`，文字保持基础色 |
| 基础样式 | `dimOpacity` 0–1、`focusElement`，按预设各存一份 |
| 可扩展项 | 字重、斜体、描边等通过版本化字段新增 |

边界：基础字号 12–96px，分类缩放 0.5–2.0，下划线厚度 1–6px、间距 0–12px，圆角 0–16px，透明度 0–1；越界值夹紧，不接受任意 CSS、CSS selector、`url()` 或服务端下发样式。

分类元素不设置绝对字号；最终字号 = 基础字号 × 胜出的 fontScale。未来若提供绝对字号，必须增加显式互斥字段，不让两种算法隐式叠加。自动适应字幕框时对整行统一缩放，保留元素间比例，限制最小可读字号并允许换行。

透明度低于 0.35 时在预览与设置页给出可读性警告，但不阻止保存。字色与背景色相对亮度对比度低于 3:1 时同样警告；这两项都是建议，不是硬校验。

### 9.3 样式层级与合并

从低到高：

1. 应用默认（基础色、透明度）
2. `defaultElementsFor(features)` 的内置调色板
3. 当前预设的 `elements` 用户覆盖
4. 预设 `base` 的聚焦/变淡

同一片段会命中多个功能点时，按功能点优先级逐属性取值（`src/shared/studyFeatures.ts:FEATURE_ORDER`，低 → 高）：`pos` → `nouns` → `reading` → `chunk-rule` → `chunk` → `level` → `expression` → `syntax`。

- 逐属性合并；高优先级只覆盖它明确设置的属性，未设置的保留。
- 一个片段命中多个元素时（如 NOUN + predicate + 表达），`color`、`backgroundColor`、`underline`、`fontScale`、`opacity`、`radiusPx` 各自独立取胜出值，**不得连乘或叠加**。
- 由此得到稳定的最终顺序：背景「固定表达 › 计划词汇 › 语块」，颜色「语法成分 › 词性」，下划线「语法成分 › 计划词汇 › 语块」。
- `underline.enabled: false` 明确关闭；`backgroundColor: "#00000000"` 明确清空；缺省字段表示继承。
- 取消某项用户覆盖时删除该字段，不用 `null` 同时表达“继承”和“清除”。
- 互斥只发生在功能点之间（`chunk` vs `chunk-rule`），元素之间从不互斥。

例：`勉強` 可同时是 NOUN、predicate 的一部分、计划级别词和某表达的一部分。设置页在每个元素行上标出「被 X 覆盖」，并给出完整的优先级说明，避免隐藏优先级。

### 9.4 存储与迁移

| 键 | 内容 |
| --- | --- |
| `ui:subtitleStyle` | `{ version: 3, activePresetId, presets }`，即 §9.1 结构 |
| `ui:posColors`（旧） | v1 迁移源；读取后写入 `presets['pos-basic'].elements`，迁移完成后保留只读一个版本，不再写入 |

迁移 v2 → v3：`activeProfileId` → `activePresetId`，每个 profile 的元素覆盖原样搬入同名预设并标记 `customized`；旧的单一元素 `chunk.bunsetsu:all` 复制到 `first/middle/last/only` 四个位置 id。迁移幂等，旧值非法时回退内置预设，不阻断启动。

`activePresetId` 从 `NLP_SETTINGS_KEY` 移出：学习模式是渲染配置，清空或重置 NLP 连接不应改变显示模式。内置预设被编辑后 `customized: true`；当编辑被全部撤销（功能点回到内置值且无元素覆盖）时该标记自动清除，可恢复默认。

样式配置不写入 `.sanno.json`，不参与 `analysisKey`，导出样式文件时也不包含字幕正文。

## 10. 渲染算法与重叠区间

1. 根据播放时间取得 cue；按来源选择规则获得有效 unit 与标注。
2. 将 token、role、chunk、expression 区间映射为 cue 内偏移。
3. 收集所有起止边界，加上 0 和 text.length，排序去重。
4. 生成不重叠区间，每段保留覆盖它的标签及 annotation ID。
5. 按 token 计算命中元素（含文节首/中/尾位置），用当前预设的功能点列表按 §9.3 逐属性解析出 `ElementStyle`。
6. 每个 token 生成一个受控 span（ruby 与词典点击需要独立命中区）；同一文节内相邻 token 共享背景色，只由 `radiusSides` 决定外侧圆角，从而连成一块，不插入任何影响换行测量的空白。
7. 预设/style 更新只重跑视图编译，不重跑分词或重新上传；切换时 `shownCue` 置空，rAF 循环在暂停状态下也会重绘。

元素样式在 token 上解析：角色、文节、表达都可跨 token，命中判定读取 `grammar` / `groups` 标注，不看 token 属于哪个模式；渲染层没有硬编码颜色与 `studyProfile` 分支，全部由功能点与调色板数据驱动。

`opacity` 直接设置在片段的 span 上，一个片段只应用一个胜出值，因此不会出现嵌套透明度连乘；`backgroundColor` 与 `textDecoration` 同 span，互不覆盖。ruby 的 `rt` 使用 `token.reading:ruby` 元素样式，基文字使用片段自己的样式；片段需要不同颜色时把细分 span 放入同一个 ruby 的基文字部分，读音只显示一次。

预览页与播放页共用同一编译器：预览传入内置 fixture 与同一份调色板，禁止在 options 侧复制样式计算逻辑。

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
| P4 | 学习模式页、元素调色板与例句预览 | 模式切换只重编译；每模式配色隔离；五项属性生效；语法解析配置按能力条件展开；交叉区间与 ruby 正确；预览与播放一致 |
| P5 | 语块/语法角色/表达扩充 | 真实日语字幕评估误报漏报，保留未知结果 |

核心测试场景：

- emoji 在句首、组合字符、全角字符、重复句、换行、跨 cue 长句、重叠时间轴。
- 同一字幕改名命中缓存；时间轴/正文变更不误命中；客户端/服务端 trackHash 一致。
- 已缓存 Remote、服务关闭：仍能显示语法标注；Remote 开关关闭：无任何请求。
- 无缓存、服务关闭：Local 正常；任务进行时换字幕：旧结果只入旧缓存。
- 多标签页同时选同一轨：只创建一个幂等任务；响应丢失重试不重复计算。
- Remote/Local token 边界不同：按 cue 来源切换，不混用 ID；失败单元回退。
- 修改名词色、动词大小、下划线、透明度、文字背景色：预览与播放同时更新，无 NLP 任务或缓存失效。
- 在 `pos-basic` 改 `token.pos:NOUN` 不改变 `syntax-focus`、`chunk-focus` 的显示；从其他模式复制配色只命中相同元素 id。
- 同一片段命中 NOUN 与 predicate：逐属性合并且 fontScale/opacity 不连乘；`underline.enabled: false` 与 `#00000000` 能显式关闭。
- 旧 `ui:posColors` 迁移后 `pos-basic` 颜色不变，重复迁移幂等；清空 NLP 设置后模式不重置。
- 例句预览与播放页对同一 fixture 输出一致（同一渲染函数的快照测试）。
- 选中本地模式时页面不渲染 NLP 配置块；选中 `syntax-focus` 且未配置服务时自动展开并提示；切换模式不发起任何网络请求。
- `#colors` 深链落到 `#modes` 且选中 `pos-basic`；模式卡片可用键盘切换并有选中态。
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
