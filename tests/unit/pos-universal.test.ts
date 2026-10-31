import { describe, expect, it } from 'vitest';

import { toPos } from '@/languages/ja/pos';
import { posGroupForPos } from '@/shared/posGroup';
import { normalizePos, type Pos, type PosGroup } from '@/shared/types';

/** The eight groups each IPADIC tag produced before the UPOS migration; it must not drift. */
const IPADIC_GROUPS: [string, Pos, PosGroup][] = [
  ['名詞', 'NOUN', 'noun'],
  ['代名詞', 'PRON', 'noun'],
  ['動詞', 'VERB', 'verb'],
  ['形容詞', 'ADJ', 'adj'],
  ['形状詞', 'ADJ', 'adj'],
  ['連体詞', 'ADJ', 'adj'],
  ['助詞', 'ADP', 'particle'],
  ['助動詞', 'AUX', 'particle'],
  ['副詞', 'ADV', 'adverb'],
  ['接続詞', 'CCONJ', 'conjunction'],
  ['記号', 'PUNCT', 'symbol'],
  ['空白', 'SYM', 'symbol'],
  ['感動詞', 'INTJ', 'other'],
  ['接頭詞', 'X', 'other'],
  ['フィラー', 'X', 'other'],
  ['前置詞', 'X', 'other'],
];

describe('IPADIC → UPOS', () => {
  it.each(IPADIC_GROUPS)('maps %s to %s and keeps the %s colour group', (raw, pos, group) => {
    expect(toPos(raw)).toBe(pos);
    expect(posGroupForPos(pos)).toBe(group);
  });

  it('falls back to X for a tag the core does not model', () => {
    expect(toPos('未知語')).toBe('X');
    expect(posGroupForPos('X')).toBe('other');
  });
});

describe('contract POS normalization', () => {
  it('accepts every UPOS value', () => {
    const values: Pos[] = [
      'NOUN', 'PROPN', 'PRON', 'VERB', 'AUX', 'ADJ', 'ADV', 'ADP', 'PART',
      'SCONJ', 'CCONJ', 'DET', 'NUM', 'INTJ', 'PUNCT', 'SYM', 'X',
    ];
    for (const pos of values) expect(normalizePos(pos)).toBe(pos);
  });

  it('never lets a native tag or junk through as a POS', () => {
    expect(normalizePos('名詞')).toBe('X');
    expect(normalizePos(undefined)).toBe('X');
    expect(normalizePos('noun')).toBe('X');
  });
});
