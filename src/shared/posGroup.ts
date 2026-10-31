import type { Pos, PosGroup } from './types';

/**
 * Universal POS → the eight colour groups.
 *
 * This is the only POS classification the core understands; language detail stays in the pack.
 * A pack may override it, but the default keeps every language rendering the same eight groups.
 */
const GROUPS: Record<Pos, PosGroup> = {
  NOUN: 'noun',
  PROPN: 'noun',
  PRON: 'noun',
  VERB: 'verb',
  AUX: 'particle',
  ADJ: 'adj',
  ADV: 'adverb',
  ADP: 'particle',
  PART: 'particle',
  SCONJ: 'conjunction',
  CCONJ: 'conjunction',
  DET: 'other',
  NUM: 'other',
  INTJ: 'other',
  PUNCT: 'symbol',
  SYM: 'symbol',
  X: 'other',
};

export const posGroupForPos = (pos: Pos): PosGroup => GROUPS[pos] ?? 'other';
