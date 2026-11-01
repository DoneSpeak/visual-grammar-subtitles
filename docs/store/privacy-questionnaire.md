# 隐私权实践问卷 + 权限理由（逐项粘贴）

对应开发者后台 →「隐私权实践」标签页。Chrome 对“收集”的定义是**数据离开设备**；仅存 `chrome.storage.local` 不算收集。下面的勾选按这条定义给出，判断依据附在每项后面。

## 1. 单一用途说明（Single purpose）

```text
Display subtitle files supplied by the user over videos on web pages, and annotate Japanese subtitle text with part-of-speech colouring, readings, dictionary cards and saved vocabulary entries for language learning.
```

## 2. 权限理由（Permission justification）

### `storage`

```text
Saves the user's subtitle library (imported files and pack metadata), per-page subtitle selection and timing offsets, appearance and learning preferences, site rules, and small caches. All data stays in chrome.storage.local on the user's device and is never sent to the developer.
```

### `unlimitedStorage`

```text
The subtitle library is stored in chrome.storage.local. A library of several series, each with an original and a translated subtitle track, exceeds the default 10 MB quota. The permission only raises the local quota; no data leaves the device. The bundled dictionaries ship inside the extension package and do not consume this quota.
```

### 主机权限 `host_permissions: ["<all_urls>"]`

```text
A video can appear on any website, so the content script must be able to attach the subtitle layer wherever the user is watching; the extension cannot predict which sites a user will play video on. On a page it only locates <video> elements, reads their geometry and playback time, reads the page URL/title to restore per-page subtitle settings, and on Bilibili pages reads the season/episode identifier from the URL. It does not read or transmit unrelated page content, form fields or browsing history. The permission also enables the cross-origin requests the extension makes when the user explicitly starts them: downloading subtitle archives from kitsunekko.net, searching and downloading subtitles from api.subdl.com / dl.subdl.com using the user's own SubDL API key, reading season metadata from api.bilibili.com, and translating a CJK search term the user typed via Google's public translate endpoint (no cookies, no credentials).
```

### 远程代码（Remote code）

选择 **No, I am not using remote code**。

```text
All JavaScript, WASM and dictionary data are bundled in the submitted package. The extension does not fetch or evaluate remote scripts, does not use eval or new Function, and does not load remote configuration.
```

验证命令（上传前跑一次，应无输出）：

```bash
grep -rnE "eval\(|new Function\(|import\(" .output/chrome-mv3 --include='*.js' | grep -v 'chunks/' || true
```

> 注意：Vite 产物里可能有合法的 `import(`（动态 chunk 加载）。若命中，逐条确认目标是包内 `chrome-extension://` 路径，再在备注里说明。

## 3. 数据用途勾选

| 问卷项 | 勾选 | 依据 |
|---|---|---|
| 个人身份信息 | 否 | 无账号、无姓名/邮箱/电话 |
| 健康信息 | 否 | — |
| 财务与支付信息 | 否 | — |
| 身份验证信息 | **是（建议）** | 用户自行填写的 SubDL API key 会随请求发送给 api.subdl.com；本地 NLP 令牌只发往用户自设端点 |
| 个人通信 | 否 | 不读取页面上的消息/邮件 |
| 位置 | 否 | — |
| 网络历史 | 否 | 页面 URL 仅本地保存，不上传 |
| 用户活动 | **是（建议）** | 用户主动输入的搜索词会发往 kitsunekko、SubDL 与 Google 翻译 |
| 网站内容 | **是（建议）** | 用户启用可选分析服务时，字幕文本发往其自行配置的端点；在线导入时请求 kitsunekko / SubDL 内容 |

**判断说明（未在 Chrome 文档中逐字确认，提交前请按后台最新措辞复核）：**

- 开发者本人不接收任何数据，但问卷问的是“扩展是否收集/传输”，不是“开发者是否收到”。因此按“有传输”勾选，属于偏保守的如实申报。
- 若不启用可选 NLP 服务，字幕文本不会离开设备；但用户搜索词仍会发往第三方，所以“用户活动”不建议留空。
- SubDL API key 是用户自备的第三方凭据，扩展只把它发送给 SubDL，不发送给开发者。按“有传输”口径仍勾选“身份验证信息”，避免审核认定漏报。
- 勾选后问卷会追问加密与用途，按下面填写。

### 追问项答案

| 问题 | 答案 |
|---|---|
| 数据是否加密传输？ | Yes — 默认不含任何远端传输；发往 kitsunekko.net、api.subdl.com / dl.subdl.com、api.bilibili.com、Google 翻译的请求均为 HTTPS，SubDL API key 也只在 HTTPS 请求中发送。可选分析服务默认是回环地址 `http://127.0.0.1:8765`（本机，不出设备）；用户若改成远端地址只能填 `https://` 源，协议仍由用户自选。 |
| 数据是否出售给第三方？ | No |
| 数据是否用于与单一用途无关的目的？ | No |
| 数据是否用于判断信用度/贷款？ | No |
| 开发者是否保留服务器端副本？ | No |

### 三项认证（必须全勾）

- 不出售用户数据。
- 不将数据用于与单一用途无关的用途。
- 不将数据用于信用评估。

## 4. 其他后台声明

| 项 | 选择 |
|---|---|
| 包含广告 | No |
| 面向儿童 / 含成人内容 | No（扩展不提供内容，仅渲染用户自备字幕） |
| 是否收集账号数据 | No（无账号） |
| 交易者身份（EU DSA） | 个人、无商业变现 → **Non-trader**；若将来收费或接广告，必须改为 Trader 并公示地址与联系方式 |

## 5. 无需提交的文件

- Chrome Web Store **不要求 EULA / 服务条款**。开发者协议与计划政策在注册开发者账号时勾选接受，不在条目里上传。
- 唯一必须提供 URL 的法律文档是**隐私政策**：`privacy/index.html`。
