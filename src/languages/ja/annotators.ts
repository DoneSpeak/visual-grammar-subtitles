import { entryInBands } from '@/languages/bands';
import type { BandSelection } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import type { FeatureId } from '@/shared/studyFeatures';
import type { Pos, Token } from '@/shared/types';
import { JA_BANDS } from './bands';
import { CHUNK_GROUP_KEY, EXPRESSION_ELEMENT, LEVEL_ELEMENT } from './features';
import { EXPRESSION_SOURCES } from './grammarPatterns';

/**
 * Japanese annotations the extension can produce locally, with no grammar service: bunsetsu
 * boundaries, fixed expressions and study-plan vocabulary. They are computed once per tokenized
 * line and written into the same `grammar` / `groups` fields the remote analyser fills, so the
 * renderer never needs to know where a label came from.
 */

/** 付属語 (particles, auxiliaries) and dependent content words attach to the word before them. */
const ATTACHES_LEFT = new Set<Pos>(['ADP', 'AUX', 'PART']);

/**
 * 連体詞 (こんな, その) is `ADJ` in Universal POS, but it modifies the following noun and so stays
 * inside the bunsetsu. 接頭詞 (お, ご) likewise belongs to the word on its right. Only the native
 * tag can tell them apart from an ordinary 形容詞 / 名詞.
 */
const ATTACHES_RIGHT = new Set(['連体詞', '接頭詞']);

/**
 * A bunsetsu is one independent word plus the dependents that follow it (立ち + たい + ん + だ +
 * から). So the boundary sits *before* an independent word, never after a particle or auxiliary.
 * 非自立 and 接尾 words are dependents even though their POS is 名詞 / 動詞.
 */
const isDependent = (token: Token): boolean =>
  ATTACHES_LEFT.has(token.pos) ||
  token.posDetail1 === '非自立' ||
  token.posDetail1 === '接尾';

const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

const startsChunk = (tokens: Token[], index: number): boolean => {
  const token = tokens[index];
  if (isDependent(token)) return false;
  const previous = tokens[index - 1];
  if (!previous) return true;
  // Punctuation and whitespace close the bunsetsu before them.
  if (!previous.surface.trim() || previous.pos === 'PUNCT') return true;
  return !ATTACHES_RIGHT.has(previous.posRaw ?? '');
};

/** Rule-based bunsetsu grouping; group ids mirror what the remote analyser puts in `groups`. */
export const chunks = (tokens: Token[]): Token[] => {
  let group = -1;
  return tokens.map((token, index) => {
    if (!token.surface.trim() || token.pos === 'PUNCT') return token;
    if (startsChunk(tokens, index)) group++;
    return { ...token, groups: { ...token.groups, [CHUNK_GROUP_KEY]: `rule-${group}` } };
  });
};

/** Matches the expression list across token boundaries and tags every covered token. */
export const expressions = (tokens: Token[]): Token[] => {
  const text = tokens.map((token) => token.surface).join('');
  if (!text) return tokens;
  const starts: number[] = [];
  let offset = 0;
  for (const token of tokens) {
    starts.push(offset);
    offset += token.surface.length;
  }
  const hit = new Set<number>();
  for (const source of EXPRESSION_SOURCES) {
    const pattern = new RegExp(source, 'g');
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const from = match.index;
      const to = from + match[0].length;
      tokens.forEach((token, index) => {
        const tokenStart = starts[index];
        const tokenEnd = tokenStart + token.surface.length;
        if (tokenStart < to && from < tokenEnd) hit.add(index);
      });
    }
  }
  return tokens.map((token, index) => (hit.has(index) ? withGrammar(token, EXPRESSION_ELEMENT) : token));
};

/** Tags dictionary words whose JLPT level is in the user's study plan. */
export const levels = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
): Token[] =>
  tokens.map((token) => {
    const entry = token.dictIdx !== undefined ? entries[token.dictIdx] : undefined;
    return entry && entryInBands(JA_BANDS, entry, bands) ? withGrammar(token, LEVEL_ELEMENT) : token;
  });

export const local = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
  features: FeatureId[],
): Token[] => {
  let annotated = tokens;
  if (features.includes('chunk-rule')) annotated = chunks(annotated);
  if (features.includes('expression')) annotated = expressions(annotated);
  if (features.includes('level')) annotated = levels(annotated, entries, bands);
  return annotated;
};
