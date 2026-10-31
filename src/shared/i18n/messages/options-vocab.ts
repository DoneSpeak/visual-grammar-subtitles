import { defineMessages } from '../define-messages';

export const optionsVocab = defineMessages(
  {
    'vocab.title': 'Vocabulary pictures',
    'vocab.description':
      'The review-approved pictures attached to dictionary words; they appear on the word card during playback. {count} words have one.',
    'vocab.search': 'Filter by word, reading or meaning',
    'vocab.language': 'Subtitle language',
    'vocab.languageEmpty': 'No pictures for {language} yet. Pictures are grouped by part of speech.',
    'vocab.loading': 'Loading pictures…',
    'vocab.failed': 'Could not load the picture index. Rebuild with pnpm vocab:build.',
    'vocab.noMatch': 'No word matches the filter.',
    'vocab.imageAlt': 'Picture for {word}',
    'vocab.creditLead': 'Pictures: ',
  },
  {
    'vocab.title': '词汇图示',
    'vocab.description':
      '已审核通过的联想图片，播放时点词会在卡片里显示。当前共 {count} 个词带图。',
    'vocab.search': '按词、读音或释义过滤',
    'vocab.language': '字幕语言',
    'vocab.languageEmpty': '{language} 暂无图示。图示按词性分组显示。',
    'vocab.loading': '正在加载图片…',
    'vocab.failed': '图片索引加载失败，请先运行 pnpm vocab:build 重新生成。',
    'vocab.noMatch': '没有匹配的词。',
    'vocab.imageAlt': '{word} 的图片',
    'vocab.creditLead': '图片：',
  },
);
