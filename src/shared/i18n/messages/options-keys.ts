import { defineMessages } from '../define-messages';

export const optionsKeys = defineMessages(
  {
    'keys.title': 'Shortcuts',
    'keys.description':
      'Active on playback pages only; they all start with Alt and never intercept normal typing.',
    'keys.group.time': 'Time',
    'keys.group.ad': 'Ads',
    'keys.group.appearance': 'Appearance',
    'keys.group.panel': 'Panel',
    'keys.offset.title': 'Subtitle offset',
    'keys.offset.description':
      'Left bracket earlier, right bracket later; hold Shift for 0.5 s steps',
    'keys.replay.title': 'Replay current line',
    'keys.replay.description': 'Restart 0.15 s before the current subtitle starts',
    'keys.reshow.title': 'Reshow subtitles',
    'keys.reshow.description': 'Force 1.8 s of display, ignoring “Display duration”',
    'keys.skip.title': 'Skip and mark',
    'keys.skip.description':
      'Advance by the seconds set for this series (15 by default) and record that span as an ad slot for this episode; pressing again does not duplicate the mark',
    'keys.translation.title': 'Toggle translation layer',
    'keys.translation.description':
      'Temporarily hide or restore the translation without changing the source',
    'keys.font.title': 'Source font size',
    'keys.font.description': 'Equals to enlarge, minus to shrink; hold Shift for coarse steps',
    'keys.move.title': 'Move source text',
    'keys.move.description':
      'Arrow keys move 1% at a time; affects the source layer only',
    'keys.close.title': 'Close',
    'keys.close.description': 'Dismiss the lookup card and any open library dropdown',
  },
  {
    'keys.title': '快捷键',
    'keys.description': '仅在播放页生效，统一用 Alt 起手，不会拦截普通输入。',
    'keys.group.time': '时间',
    'keys.group.ad': '广告',
    'keys.group.appearance': '外观',
    'keys.group.panel': '面板',
    'keys.offset.title': '字幕偏移',
    'keys.offset.description': '左括号提前、右括号延后；按住 Shift 步进 0.5 秒',
    'keys.replay.title': '重听当前句',
    'keys.replay.description': '回到当前字幕起点前 0.15 秒重新播放',
    'keys.reshow.title': '重显字幕',
    'keys.reshow.description': '强制显示 1.8 秒，不受“显示时长”限制',
    'keys.skip.title': '跳过并标记',
    'keys.skip.description':
      '前进该剧集设定的秒数（默认 15），并把这一段记录为本集广告位；再次按下不会重复标记',
    'keys.translation.title': '切换译文层',
    'keys.translation.description': '临时隐藏或恢复译文，不改动原文',
    'keys.font.title': '原文字号',
    'keys.font.description': '等号放大、减号缩小；按住 Shift 粗调',
    'keys.move.title': '移动原文',
    'keys.move.description': '方向键每次移动 1%，仅作用于原文层',
    'keys.close.title': '关闭',
    'keys.close.description': '收起查词卡片；库列表里同时关闭下拉',
  },
);
