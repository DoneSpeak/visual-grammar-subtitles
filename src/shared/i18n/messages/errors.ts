import { defineMessages } from '../define-messages';

export const errors = defineMessages(
  {
    'errors.unparsableFile': '{name}: no subtitles could be parsed',
    'errors.noRecognizedSubtitles': 'No recognisable subtitle files in {name}',
    'errors.noVideo': 'No playable video on this page',
    'errors.noPlayer': 'No usable player on this page',
    'errors.applyFailed': 'Could not apply: {error}',
    'errors.downloadFailed': 'Download failed: {error}',
    'errors.readDirFailed': 'Could not read the directory: {error}',
    'errors.indexLoadFailed': 'Could not load the index: {error}',
    'errors.searchFailed': 'kitsunekko search failed: {error}',
    'errors.onlineSearchFailed': 'Online search failed: {error}',
    'errors.importFailed': 'Import failed: {error}',
    'errors.bilibiliInfo': 'Could not fetch bilibili series info',
  },
  {
    'errors.unparsableFile': '{name}：未解析到任何字幕',
    'errors.noRecognizedSubtitles': '{name} 里没有可识别的字幕文件',
    'errors.noVideo': '当前页没有可用视频',
    'errors.noPlayer': '当前页没有可用的播放器',
    'errors.applyFailed': '套用失败：{error}',
    'errors.downloadFailed': '下载失败：{error}',
    'errors.readDirFailed': '读取目录失败：{error}',
    'errors.indexLoadFailed': '索引加载失败：{error}',
    'errors.searchFailed': 'kitsunekko 搜索失败：{error}',
    'errors.onlineSearchFailed': '在线搜索失败：{error}',
    'errors.importFailed': '导入失败：{error}',
    'errors.bilibiliInfo': 'bilibili 番剧信息获取失败',
  },
);
