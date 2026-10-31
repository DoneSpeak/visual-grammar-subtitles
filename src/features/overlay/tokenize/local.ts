import type { DictEntry } from '@/shared/dictionary';
import { EXPRESSION_SOURCES } from '@/shared/grammarPatterns';
import { EXPRESSION_ELEMENT, LEVEL_ELEMENT, type FeatureId } from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';
import { CHUNK_GROUP_KEY } from './style';

/**
 * Annotations the extension can produce locally, with no grammar service: chunk boundaries,
 * fixed expressions and study-plan vocabulary. They are computed once per tokenized line and
 * written into the same `grammar` / `groups` fields the remote analyser fills, so the renderer
 * never needs to know where a label came from.
 */

/** A bunsetsu ends on a particle, an auxiliary, a conjugable word or punctuation. */
const ENDS_CHUNK = new Set(['助詞', '助動詞', '動詞', '形容詞', '記号', '接続詞', '感動詞']);

const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

/** Rule-based bunsetsu grouping; group ids mirror what the remote analyser puts in `groups`. */
export const annotateChunks = (tokens: Token[]): Token[] => {
  let group = 0;
  return tokens.map((token, index) => {
    if (!token.surface.trim() || token.pos === '記号') {
      group++;
      return token;
    }
    const id = `rule-${group}`;
    const next = tokens[index + 1];
    if (!next || ENDS_CHUNK.has(token.pos)) group++;
    return { ...token, groups: { ...token.groups, [CHUNK_GROUP_KEY]: id } };
  });
};

/** Matches the expression list across token boundaries and tags every covered token. */
export const annotateExpressions = (tokens: Token[]): Token[] => {
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
export const annotateLevels = (
  tokens: Token[],
  entries: DictEntry[],
  levels: Record<number, boolean>,
): Token[] =>
  tokens.map((token) => {
    const entry = token.dictIdx !== undefined ? entries[token.dictIdx] : undefined;
    return entry && levels[entry.lv] ? withGrammar(token, LEVEL_ELEMENT) : token;
  });

export const annotateLocal = (
  tokens: Token[],
  entries: DictEntry[],
  levels: Record<number, boolean>,
  features: FeatureId[],
): Token[] => {
  let annotated = tokens;
  if (features.includes('chunk-rule')) annotated = annotateChunks(annotated);
  if (features.includes('expression')) annotated = annotateExpressions(annotated);
  if (features.includes('level')) annotated = annotateLevels(annotated, entries, levels);
  return annotated;
};
