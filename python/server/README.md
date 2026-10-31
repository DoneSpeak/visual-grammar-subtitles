# 本机日语 NLP 服务

实现设计文档的文件级 Remote NLP 主链路。接口在 `127.0.0.1:8765`，CPU 推理由独立单工作进程执行；无需 Redis。

## 启动

项目根目录执行（需要 uv）：

```sh
make nlp-install
make nlp-serve
```

`nlp-install` 安装 Python 3.12、锁定依赖和 `ja_ginza` 模型。`nlp-serve` 确认接口就绪后返回终端，服务在后台运行，关闭终端也不会停止。启动输出直接包含服务 URL、完整 API Token、插件配置步骤和日志路径；重复执行会展示正在运行的服务信息，不会重复启动。

按终端中的提示完成首次配置：

1. 打开设置页面 `http://127.0.0.1:8765/ui/`（启动输出里也有；`/` 会重定向到这里），复制服务 URL 和 API Token。
2. 打开插件设置 → 颜色 → Japanese NLP，勾选“启用 Remote NLP”，填入并保存。
3. 回到插件点击“检测已保存连接”。首次连接会被拒绝；刷新设置页面（`/ui/`），在“检测到的新扩展来源”里点“允许”，再检测一次即可。不需要重启服务。

设置页面还可以手动增删允许来源，改动立即生效。白名单保存在 `python/server/.data/allowed-origins`，之后直接 `make nlp-serve` 即可，不必再传 `NLP_ALLOWED_ORIGINS`；显式设置该环境变量仍会覆盖文件内容（用于脚本化部署）。Token 首次自动生成，保存在 `python/server/.data/api-token`，重启复用；Token、白名单和进程状态文件仅当前用户可读写，整个 `.data/` 已忽略 Git。Token 不写入服务日志。仍可用 `make nlp-token` 单独查看默认 Token；若用 `NLP_API_TOKEN` 覆盖，请在相同环境下查看，或以启动输出为准。

设置页面与接口只监听 `127.0.0.1`，浏览器跨站请求被 Origin/CORS 拦截，保存来源还需要页面专用的自定义请求头。不要通过端口转发或反向代理把它暴露到其他机器——页面会显示 API Token。

## 服务管理

| 命令 | 用途 |
| --- | --- |
| `make nlp-serve` | 后台启动，显示 Token 和下一步操作 |
| `make nlp-serve LOG=1` | 后台启动并进入实时日志；服务已启动时直接查看日志 |
| `make nlp-serve -- --log` | 同上，Make 的 `--` 分隔符不可省略 |
| `make nlp-serve-log` | 显示最近 60 行日志并持续跟踪 |
| `make npl-serve-log` | 上一命令的兼容别名 |
| `make nlp-stop` | 停止后台服务；重复执行也安全 |

查看日志时，按 **Ctrl+C 或 Ctrl+Z** 退出日志查看，后台服务继续运行。只有 `make nlp-stop` 会停止服务。GNU Make 自身不接受 `--log` 选项，因此裸写 `make nlp-serve --log` 会被 Make 拒绝；使用上表的 `LOG=1` 或 `-- --log` 写法。

日志默认在 `python/server/.data/server.log`，启动失败可用日志命令排查。端口占用不会被误报为启动成功；停止服务会验证进程身份，避免旧 PID 指向其他程序。服务收到停止信号后先尝试正常退出，15 秒后仍未退出则终止其进程组。

可用 `make nlp-serve NLP_PORT=8766` 改端口。任务数据库、Token 和服务状态默认在 `python/server/.data/`，可用 `NLP_DATA_DIR` 覆盖；自定义数据目录时，启动、查看日志、停止都需要传入相同目录。显式设置 `NLP_API_TOKEN` 可覆盖本地 Token，长度必须至少 16 个字符。修改端口或 Token 前先执行 `make nlp-stop`，再重新启动；重复启动会继续使用现有进程的配置。允许来源可在设置页面直接修改，无需重启。

`make nlp-test` 运行 Python 测试（包含真实 GiNZA 推理、后台服务生命周期和终端快捷键测试，需要允许本地监听端口）；`make nlp-check` 同时运行前端类型与单元测试。

## 使用与协议

选择整份字幕后先显示原文、本地 Kuromoji 结果。开启 Remote 后插件从扩展后台上传完整 `cue-json-v1`（已经由项目加载器解析的可见 cues，适用于现有 SRT/VTT/ASS 导入路径），不上传视频。字幕变化会切换 generation，旧结果不会覆盖新轨。服务也直接支持 UTF-8 SRT/VTT；其他编码需在 metadata 显式指定。

路由约定：`/ui/` 与 `/` 是浏览器设置页，其余后端接口统一在 `/api/v1/` 下。

- `GET /api/v1/capabilities`：版本、模型指纹、输入格式、能力和大小限制。
- `POST /api/v1/analyses`：multipart `file` + `metadata` JSON；必需 `Idempotency-Key`，返回 202。
- `GET /api/v1/analyses/{jobId}`：任务状态。
- `GET /api/v1/analyses/{jobId}/result`：完整 `.sanno.json`。
- `DELETE /api/v1/analyses/{jobId}`：尽力取消；已经开始的模型调用会完成，但结果不再发布。
- `GET /api/v1/setup`、`POST /api/v1/setup/origins`：设置页读取配置与增删允许来源。

所有请求要求 `Authorization: Bearer <NLP_API_TOKEN>`。浏览器 Origin 必须匹配 `NLP_ALLOWED_ORIGINS`，多个值以逗号分隔；无 Origin 的命令行客户端仍要求 token。凭据不进入字幕、导出或返回给 Content Script。

创建 metadata 包含 `rawSha256, trackHash, normalizationVersion: "track-v1", language: "ja", encoding: "utf-8", requestedCapabilities, schemaMajor: 1`。两端共享 `packages/subtitle-contract/schema.json` 和真实模型 fixture，校验 UTF-16 字素边界、文本切片、引用、覆盖和内容指纹。

服务限制：10 MiB 上传、5 万 cues、单 cue 1 万字符、100 MiB 结果、最多 4 个未终结任务。任务和结果用 SQLite 事务持久化；重启将中断任务标记失败。24 小时后状态返回 410，创建新任务时清理过期记录。文件格式错误、指纹不匹配、幂等冲突分别返回 400、422、409。GiNZA 输出依存关系、文节、词性与读音；语法角色是模型和规则的教学映射，不保证所有句子正确。无法可靠处理的单元标记失败，插件对整条 cue 回退。

## 插件显示和缓存

颜色设置页支持词性、语法成分、表达、文节视图，以及 JSON 导入/导出。语法成分用颜色与下划线、悬停文本展示；分割后的 token 不能可靠注音时不重复 ruby。关闭 Remote 后仍能用缓存；选择 `local-only` 才排除 Remote 缓存。修改显示模式不会提交分析任务。当前缓存按 trackHash 保存最近成功产物，写入事务内按时间淘汰，预算 100 MiB；写入失败仅保留当前会话结果。导出包含完整字幕，名称不影响匹配。

## 与完整 V2 设计的边界

本次实现可运行的语法分析主链路，不代表 P0–P5 全部验收：

- 保留现有 Service Worker Kuromoji 与 Content Script 协调路径，尚未迁移到 Offscreen + Dedicated Worker，也未将 Local 产物转换为完整分析文件。关闭 Popup 不影响任务；关闭视频页后服务端继续完成，重选字幕通过幂等提交找回任务。
- 当前缓存每轨保留一个产物，未做 provider 多版本、pin、独立 metadata/jobs stores；状态没有逐单元百分比。
- 当前使用内置显示规则，尚无自定义 profile/逐属性样式编辑器；跨区间 token 的读音采取保守回退。
- 现有字幕加载器的 trim/排序行为没有改动。插件上传的是该加载器实际显示的 cue-json，而非声称与原文件字节完全相同。
- 设置更改立即刷新样式，播放中完成的分析在下一 cue 使用；暂停时刷新当前 cue。结束状态显示在播放器设置面板，详细原因记录在扩展控制台；重选字幕可重试连接或分析失败，重试使用独立且可去重的请求 key。
- 尚未执行真实 Chrome 本地网络权限、长片资源及 30–50 条日语字幕质量验收。

GiNZA API 依据：https://github.com/megagonlabs/ginza 。GiNZA 5.2.1 修复了新 spaCy 的严格组件类型校验兼容问题，依赖版本以 `uv.lock` 为准。
