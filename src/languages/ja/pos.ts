import { posGroupForPos } from '@/shared/posGroup';
import type { Pos, PosGroup, Token } from '@/shared/types';

/**
 * IPADIC → Universal Dependencies.
 *
 * The mapping is chosen to keep the eight colour groups stable: 連体詞 stays `adj` rather than
 * becoming `DET`, and rare tags (接頭詞, フィラー, 前置詞) stay `X` instead of being guessed at.
 */
const UPOS: Record<string, Pos> = {
  名詞: 'NOUN',
  代名詞: 'PRON',
  動詞: 'VERB',
  形容詞: 'ADJ',
  形状詞: 'ADJ',
  連体詞: 'ADJ',
  助詞: 'ADP',
  助動詞: 'AUX',
  副詞: 'ADV',
  接続詞: 'CCONJ',
  記号: 'PUNCT',
  空白: 'SYM',
  感動詞: 'INTJ',
};

export const toPos = (raw: string): Pos => UPOS[raw] ?? 'X';

export const posGroup = (token: Token): PosGroup => posGroupForPos(token.pos);

/** `基本形` and `*` are kuromoji's "not conjugated" markers, not inflections. */
export const isInflected = (token: Token): boolean =>
  token.conjForm !== '' && token.conjForm !== '*' && token.conjForm !== '基本形';
