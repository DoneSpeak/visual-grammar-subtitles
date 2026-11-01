# 审核备注（Notes for certification）

粘贴到后台「审核 → 给审核员的备注」。用英文，审核员默认读英文；中文版留在仓库备查。

## 英文（粘贴用）

```text
Thank you for reviewing.

WHAT IT DOES
Visual Grammar Subtitles draws a subtitle layer over a <video> element and colours words by part of speech. It ships no videos and no subtitles; the user provides a subtitle file or imports one from a public catalogue (kitsunekko.net for Japanese, SubDL for other languages). Nothing is unlocked, decrypted, or bypassed. The extension is free, has no account and no ads. Annotatable language packs: Japanese, English and Thai.

HOW TO TEST (about 2 minutes)
1. Install the extension. No sign-in is required.
2. Open any page containing an HTML5 video, for example:
   https://www.w3schools.com/html/html5_video.asp
   Move the pointer over the video: a small round button labelled "字" appears at the top-right of the video.
3. Click it to open the subtitle panel. With no subtitle loaded the layer is intentionally empty.
4. Download the sample subtitle:
   https://donespeak.github.io/visual-grammar-subtitles/privacy/sample.ja.srt
5. Open the extension's options page (chrome://extensions → Details → Extension options), go to the subtitle library, import the sample .srt, then apply it to the current page from the panel or the toolbar popup.
6. The Japanese lines appear over the video with part-of-speech colours. Hover a word to see the dictionary card; the word cards use a bundled offline dictionary and work with the network disabled.
7. Use Alt+[ and Alt+] to shift timing, and drag the subtitle layer by its top-left handle.

WHY <all_urls>
Videos can appear on any site, so the content script is registered for all URLs. It only locates <video> elements, reads their size and playback time, reads the page URL to restore per-page settings, and on Bilibili pages reads the season/episode id from the URL. It does not read unrelated page content.

NETWORK USE
- No requests at all during the test above, except the user-initiated download of the sample file.
- kitsunekko.net is contacted only when the user searches or imports Japanese subtitles from the online catalogue.
- api.subdl.com / dl.subdl.com are contacted only when the user searches or downloads non-Japanese subtitles through SubDL. This is opt-in and requires the user's own API key: no key is bundled and the feature cannot be used without one. We cannot supply a reviewer key; the rest of the extension works without it.
- translate.googleapis.com receives the search query only when it contains Japanese or Chinese characters.
- api.bilibili.com is contacted only on Bilibili pages.
- An optional analysis server (default http://127.0.0.1:8765) is used only if the user enables it. The developer operates no server.

REMOTE CODE
None. All JavaScript and dictionary data are bundled; there is no eval and no remote script loading.

The full privacy policy is linked on the listing and in the extension's options page.
```

## 中文（仓库备查）

1. 安装后无需登录。
2. 打开任一含 `<video>` 的页面（示例：`https://www.w3schools.com/html/html5_video.asp`），鼠标移到视频上，右上角出现「字」按钮。
3. 点开面板；未载入字幕时字幕层为空，这是预期行为。
4. 从 Pages 下载示例字幕 `privacy/sample.ja.srt`。
5. 选项页 → 字幕包 → 导入该文件 → 在面板或工具栏弹窗中套用。
6. 视频上出现带词性颜色的日语字幕；悬停单词弹出词典卡（离线词典，断网可用）。
7. `Alt+[` / `Alt+]` 调整时间偏移，左上角手柄拖动位置。

审核备注中需主动说明：SubDL 搜索需要用户自备 API key，扩展不内置 key，也无法提供审核用 key；其余功能均可离线验证。

## 提交前核对

- `https://donespeak.github.io/visual-grammar-subtitles/privacy/sample.ja.srt` 部署后用无痕窗口自测一次。
- 示例页不要用需要登录或地区限制的站点；B 站页面仅作为可选项提及。
