# 截图与宣传图

素材已生成，位于 `docs/store/assets/`。全部是 24-bit JPEG、无 alpha，直接上传后台。

## 现有素材

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `assets/en/en-1-wordcard.jpg` | 1280×800 | 词卡：词性着色 + 振假名 + JLPT 卡片 |
| `assets/en/en-2-panel.jpg` | 1280×800 | 控制面板：原文/译文、偏移、显示时长 |
| `assets/en/en-3-library.jpg` | 1280×800 | 选项页「字幕包」：kitsunekko 来源与分包 |
| `assets/en/en-4-modes.jpg` | 1280×800 | 「学习模式」：同一句的多种标注方式 |
| `assets/en/en-5-transcript.jpg` | 1280×800 | 字幕流：视频与逐句列表分栏 |
| `assets/zh/*.jpg` | 1280×800 | 同上五张，中文界面 |
| `assets/promo/promo-small-440x280.jpg` | 440×280 | 小型宣传图（全局） |
| `assets/promo/promo-marquee-1400x560.jpg` | 1400×560 | 大型宣传图（全局） |

图标沿用 `public/icon/128.png`（128×128 RGBA，商店接受带透明通道的图标）。

## 重新生成

```bash
pnpm build                                   # 素材来自真实扩展 UI，必须先构建
node scripts/capture-store-assets.mjs        # 两套语言 + 宣传图
node scripts/capture-store-assets.mjs --lang zh
```

依赖 `ffmpeg`（生成 900×800 的渐变背景视频）与 Playwright 的 chromium。脚本会：

1. 启动本地 HTTP 服务，用 `<video>` 播放合成背景；
2. 向扩展 `chrome.storage.local` 写入示例字幕包与页面配置；
3. 加载 `.output/chrome-mv3`，截取真实 UI（词卡、面板、选项页、字幕流）；
4. 用同一批截图合成宣传图。

中间产物在 `.output/store-assets/`，已随 `.output/` 忽略。

## 上传

- 商店信息 → 语言选 English，上传 `assets/en/` 五张；
- 切到 Chinese (Simplified)，上传 `assets/zh/` 五张；
- Global assets → 宣传图上传两张。

## 合规检查

- 截图为真实界面，未拼接不存在的功能。
- 背景是脚本生成的抽象渐变，不含第三方影视画面。
- 无个人信息、无账号、无调试信息。
- 界面语言与所列语言一致（英文/中文各一套）。
