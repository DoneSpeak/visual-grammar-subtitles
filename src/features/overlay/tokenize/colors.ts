import type { PosGroup, Token } from '@/shared/types';
import { defaultPosColors, type PosColors } from '@/shared/posColors';

const COLOR_PLAIN = '#FFFFFF';
const DEFAULT_PALETTE = defaultPosColors();

export const posGroupOf = (token: Token): PosGroup => {
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

export const isInflected = (token: Token): boolean =>
  token.conjForm !== '' && token.conjForm !== '*' && token.conjForm !== '基本形';

export const colorFor = (group: PosGroup, colorize: boolean, colors: PosColors = DEFAULT_PALETTE): string =>
  colorize ? colors[group] : COLOR_PLAIN;