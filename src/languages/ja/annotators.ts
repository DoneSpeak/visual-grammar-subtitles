import type { DictEntry } from '@/shared/dictionary';
import { EXPRESSION_ELEMENT, LEVEL_ELEMENT, type FeatureId } from '@/shared/studyFeatures';
import type { Pos, Token } from '@/shared/types';
import { EXPRESSION_SOURCES } from './grammarPatterns';

/**
 * Japanese annotations the extension can produce locally, with no grammar service: bunsetsu
 * boundaries, fixed expressions and study-plan vocabulary. They are computed once per tokenized
 * line and written into the same `grammar` / `groups` fields the remote analyser fills, so the
 * renderer never needs to know where a label came from.
 */

/** Layer a bunsetsu annotation lands in; also the key of `Token.groups`. */
export const CHUNK_GROUP_KEY = 'chunk.bunsetsu';

/** A bunsetsu ends on a particle, an auxiliary, a conjugable word or punctuation. */
const ENDS_CHUNK = new Set<Pos>(['ADP', 'AUX', 'VERB', 'ADJ', 'PUNCT', 'CCONJ', 'INTJ']);

/**
 * 連体詞 (こんな, その) is `ADJ` in Universal POS, but it modifies the following noun and so stays
 * inside the bunsetsu. Only the native tag can tell it apart from a real 形容詞.
 */
const endsChunk = (token: Token): boolean =>
  ENDS_CHUNK.has(token.pos) && token.posRaw !== '連体詞';

const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

/** Rule-based bunsetsu grouping; group ids mirror what the remote analyser puts in `groups`. */
export const chunks = (tokens: Token[]): Token[] => {
  let group = 0;
  return tokens.map((token, index) => {
    if (!token.surface.trim() || token.pos === 'PUNCT') {
      group++;
      return token;
    }
    const id = `rule-${group}`;
    const next = tokens[index + 1];
    if (!next || endsChunk(token)) group++;
    return { ...token, groups: { ...token.groups, [CHUNK_GROUP_KEY]: id } };
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
  enabled: Record<number, boolean>,
): Token[] =>
  tokens.map((token) => {
    const entry = token.dictIdx !== undefined ? entries[token.dictIdx] : undefined;
    return entry && enabled[entry.lv] ? withGrammar(token, LEVEL_ELEMENT) : token;
  });

export const local = (
  tokens: Token[],
  entries: DictEntry[],
  enabled: Record<number, boolean>,
  features: FeatureId[],
): Token[] => {
  let annotated = tokens;
  if (features.includes('chunk-rule')) annotated = chunks(annotated);
  if (features.includes('expression')) annotated = expressions(annotated);
  if (features.includes('level')) annotated = levels(annotated, entries, enabled);
  return annotated;
};
