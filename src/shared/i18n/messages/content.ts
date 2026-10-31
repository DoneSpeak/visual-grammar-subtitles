import { defineMessages } from '../define-messages';

export const content = defineMessages(
  {
    'content.back': '← Back',
    'content.searching': 'Searching kitsunekko… (the index loads on first use)',
    'content.searchingAll': 'Searching all available sources…',
    'content.searchingProvider': 'Searching {provider}…',
    'content.providerKeyMissing': 'No API key for {provider} — add it in the options page',
    'content.translated': 'Translated to “{title}” automatically',
    'content.translatedNoPack':
      'Translated to “{title}” automatically, but still no subtitle pack',
    'content.noMatch': 'No matching series — try an English or romaji name',
    'content.noMatchProvider': 'No matching series on {provider}',
    'content.readingDir': 'Reading {name}…',
    'content.subdir': 'Subdirectory',
    'content.emptyDir': 'This directory is empty',
    'content.downloading': 'Downloading and importing {name}…',
    'content.importedCount': {
      one: 'Imported {count} file',
      other: 'Imported {count} files',
    },
    'content.chooseAbove': '. Choose them in the “Source / Translation” search above',
    'content.seriesLabel': 'Series {id}',
    'content.logReady':
      'overlay ready — the panel is at the top right; choose a .srt file under “Source”',
  },
  {
    'content.back': '← 返回',
    'content.searching': '正在搜索 kitsunekko…（首次需加载索引）',
    'content.searchingAll': '正在搜索全部可用来源…',
    'content.searchingProvider': '正在搜索 {provider}…',
    'content.providerKeyMissing': '未配置 {provider} 的 API Key，请到设置页添加',
    'content.translated': '已自动翻译为「{title}」',
    'content.translatedNoPack': '已自动翻译为「{title}」，仍未找到字幕包',
    'content.noMatch': '没有匹配的番剧 — 试试英文或罗马音名',
    'content.noMatchProvider': '{provider} 上没有匹配的剧集',
    'content.readingDir': '正在读取 {name}…',
    'content.subdir': '子目录',
    'content.emptyDir': '该目录为空',
    'content.downloading': '正在下载并导入 {name}…',
    'content.importedCount': '已导入 {count} 份',
    'content.chooseAbove': '，可在上面「原文 / 译文」搜索里选用',
    'content.seriesLabel': '系列 {id}',
    'content.logReady': 'overlay ready — 面板在画面右上角，点「原文 载入」选择 .srt 文件',
  },
);
