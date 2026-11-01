# 商店条目文案（逐字段粘贴）

对应 Chrome Web Store 开发者后台 →「商店信息」标签页。所有字段都在后台手填，Store API 不能写入。

## 字段对照

| 后台字段 | 值 | 限制 |
|---|---|---|
| 名称 | `Visual Grammar Subtitles` | 24/45 |
| 简短说明（English） | 见下 | 126/132（与 `_locales/en_GB` 的 `extDescription` 同文） |
| 详细说明（English） | 见下 | 约 3.0k/16k |
| 类别 | **Education**（备选 Productivity） | 单选 |
| 语言 | English (United Kingdom)；再添加 Chinese (Simplified) | 与 `default_locale: en_GB` 一致 |
| 价格 | Free | — |
| 地区 | All regions | — |
| 官方网站 | `https://github.com/DoneSpeak/visual-grammar-subtitles` | 可选；Pages 只发布 `/privacy/`，站点根路径是 404 |
| 支持网址 | `https://github.com/DoneSpeak/visual-grammar-subtitles/issues` | 强烈建议填，审核会看 |
| 隐私政策网址 | `https://donespeak.github.io/visual-grammar-subtitles/privacy/` | **必填**，见 `privacy/index.html` |
| 图标 | `public/icon/128.png` | 128×128，已有 |
| 截图 | 3–5 张 1280×800 或 640×400 | 已生成：`assets/en/`、`assets/zh/` 各 5 张 |
| 小型宣传图 | 440×280 | 已生成：`assets/promo/promo-small-440x280.jpg` |
| 大型宣传图 | 1400×560 | 已生成：`assets/promo/promo-marquee-1400x560.jpg` |

## 简短说明

English（126 字符）：

```text
Overlay local subtitles on any web video with colour-coded grammar, word cards and display-time control for language learning.
```

> 上传时的 locale en-GB 描述取自 `public/_locales/en_GB/messages.json` 的 `extDescription`，硬上限 132 字符。改文案必须同步这一处并重新 `pnpm zip`。

Chinese：

```text
视觉语法与彩色语言学习：在任意网页视频上叠加本地字幕，支持词性着色、振假名、词汇卡与显示时长控制。
```

## 详细说明（English）

```text
Visual Grammar Subtitles puts the subtitles you already have onto any web video, then turns them into a colour-coded grammar lesson.

IMPORTANT: this extension contains no videos and no subtitle content. You supply the subtitle files (.srt, .vtt, .ass) or import them from a public catalogue: kitsunekko.net for Japanese, or SubDL for English, Thai, Simplified Chinese and Traditional Chinese. It does not bypass DRM, unlock paid content, or host copyrighted material. The SubDL search uses your own SubDL API key; no key is bundled.

SUBTITLES ON ANY VIDEO
• Load one or two subtitle files (original + translation) onto a video, or drag them straight onto the page.
• The subtitle layer is draggable and resizable; position, style and timing offset are saved per page path.
• Timing offset is adjustable from the panel or with Alt+[ / Alt+] while the video has focus.
• Show a translation for a limited time and let the original stay visible, so you read first and then listen.
• Mark advertisement segments and skip them with a keyboard shortcut.

COLOUR-CODED LANGUAGE PACKS
• Japanese: part-of-speech colouring, optional furigana, JLPT N1–N5 word cards and sentence playback through your system's Japanese voices.
• English and Thai: part-of-speech, phrase and syntax colouring with offline dictionary cards (English cards include IPA), tuned for contrast on bright and dark video.
• Choose a study mode per language — original text, part of speech, syntax roles, phrase blocks, expressions or reading aids — and keep a separate palette for each.
• Tokenisation and dictionary lookups run fully offline; the dictionaries ship with the package.

SUBTITLE LIBRARY
• Import individual files, whole folders, or a zip archive. Files are grouped into one pack per series.
• Search the public kitsunekko.net index for Japanese, or SubDL for other subtitle languages, from the options page or the toolbar popup. SubDL requires your own API key.
• Japanese or Chinese search terms are translated to English for the catalogue search (via Google's public translation endpoint).
• Every pack records where it came from; re-importing a series merges into the existing pack.

BUILT FOR DAILY USE
• Toolbar popup for the current page, subtitle search, site rules and learning settings.
• Light, dark and system themes; English and Simplified Chinese interface.
• No account, no sign-in, no ads, no analytics. Your subtitle library stays in local extension storage.

PRIVACY
The extension reads pages only to find video elements, synchronise subtitles and restore per-page settings. Network requests happen only for the optional online subtitle import (kitsunekko.net, or SubDL with your own key), query translation and, if you enable it, an analysis server you configure yourself. Full policy: https://donespeak.github.io/visual-grammar-subtitles/privacy/.

Not affiliated with Bilibili, kitsunekko.net, JMdict/EDRDG, or OpenMoji. Subtitle and dictionary credits are listed in the package's NOTICE files.
```

## 详细说明（中文，可选第二语言）

```text
「视觉语法字幕」把你自己已有的字幕放到任意网页视频上，并把它变成彩色标注的语法课堂。

重要说明：本扩展不包含任何视频或字幕内容。字幕由你提供（.srt / .vtt / .ass 文件），或从公开目录导入：日语用 kitsunekko.net，其他语言用 SubDL（英语、泰语、简体中文、繁体中文）。它不绕过 DRM、不解锁付费内容、不托管受版权保护的资源。SubDL 搜索使用你自备的 SubDL API key，扩展不内置 key。

核心能力
• 在视频上加载原文与译文两层字幕，也可直接把字幕文件拖到画面上。
• 字幕层可拖动、可缩放；位置、样式与时间偏移按页面路径保存。
• 日语：词性着色、振假名、JLPT N1–N5 词汇卡，以及系统日语语音的整句朗读。
• 英语、泰语：词性、短语与句法着色，离线词汇卡（英语卡含 IPA 音标），深浅背景下均可读。
• 每种语言可选学习模式（原文、词性、句法角色、短语块、表达、读音辅助），配色互不干扰。
• 译文可只显示固定时长后淡出，原文常显，适合先读后听。
• 标记并跳过广告片段，支持页面内快捷键。
• 字幕库按番剧归包，支持文件夹与 zip 导入；日语可搜索 kitsunekko 公开目录，其他语言可搜索 SubDL（需自备 API key）。
• 分词完全离线，词典随扩展打包。

隐私
扩展只在页面上查找视频元素、同步字幕与恢复页面设置。仅在在线导入（kitsunekko、SubDL）、搜索词翻译，或你自行配置分析服务时发起网络请求。完整政策：https://donespeak.github.io/visual-grammar-subtitles/privacy/。

与 B 站、kitsunekko.net、SubDL、JMdict/EDRDG、OpenMoji 无关联。字幕与词典来源见安装包内的 NOTICE 文件。
```

## 提交前自测

- 隐私政策 URL 已定为 `https://donespeak.github.io/visual-grammar-subtitles/privacy/`，提交前用无痕窗口打开确认可访问。
- 联系邮箱已填 `guanrong.young@foxmail.com`（`privacy/index.html` 两处）。
