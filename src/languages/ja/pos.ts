import type { PosGroup, Token } from '@/shared/types';

/** IPADIC part-of-speech → the shared eight-colour groups. */
export const posGroup = (token: Token): PosGroup => {
  switch (token.pos) {
    case '名詞':
    case '代名詞':
      return 'noun';
    case '動詞':
      return 'verb';
    case '形容詞':
    case '形状詞':
    case '連体詞':
      return 'adj';
    case '助詞':
    case '助動詞':
      return 'particle';
    case '副詞':
      return 'adverb';
    case '接続詞':
      return 'conjunction';
    case '記号':
    case '空白':
      return 'symbol';
    default:
      return 'other';
  }
};

/** `基本形` and `*` are kuromoji's "not conjugated" markers, not inflections. */
export const isInflected = (token: Token): boolean =>
  token.conjForm !== '' && token.conjForm !== '*' && token.conjForm !== '基本形';
