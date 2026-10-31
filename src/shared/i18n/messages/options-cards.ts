import { defineMessages } from '../define-messages';

export const optionsCards = defineMessages(
  {
    'cards.title': 'Word cards',
    'cards.description':
      'What a looked-up word looks like during playback. Both cards are built by the overlay’s own renderer, with and without a reviewer-approved picture.',
    'cards.withoutImage': 'Text only',
    'cards.withImage': 'With a memory picture',
    'cards.hint':
      'Click or hover a highlighted word to open this card. Romaji lines follow the pronunciation setting on the dictionary page.',
    'cards.sourceTitle': 'Dictionary sources',
    'cards.sourceWords': 'Word list',
    'cards.sourceWordsValue': 'JMdict + open-anki-jlpt-decks',
    'cards.sourceImages': 'Memory pictures',
    'cards.sourceImagesValue': 'OpenMoji · CC BY-SA 4.0',
    'cards.sourceNote': 'Words outside the bundled list are not clickable.',
  },
  {
    'cards.title': '词汇卡片',
    'cards.description':
      '播放页查词时弹出的卡片样式。两张卡片都由字幕层的真实渲染器生成，分别展示无图片与带图片的情况。',
    'cards.withoutImage': '无图片',
    'cards.withImage': '有图片',
    'cards.hint': '点击或悬停高亮词即可打开卡片；罗马音随词典页的发音设置显示。',
    'cards.sourceTitle': '词典来源',
    'cards.sourceWords': '词表',
    'cards.sourceWordsValue': 'JMdict + open-anki-jlpt-decks',
    'cards.sourceImages': '联想图片',
    'cards.sourceImagesValue': 'OpenMoji · CC BY-SA 4.0',
    'cards.sourceNote': '不在内置词表中的词不可点击。',
  },
);
