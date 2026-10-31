import { entryInBands } from '@/languages/bands';
import type { BandSelection } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import type { FeatureId } from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';

import { EN_BANDS } from './bands';
import { CHUNK_GROUP_KEY, EXPRESSION_ELEMENT, LEVEL_ELEMENT } from './features';
import { analyze, applyParse, chunkSpans, type Analysis, type ParseFeature } from './parse';
import { PHRASES, phraseWords } from './phrases';
import { isBreak, isSpace, withGrammar } from './words';

/**
 * English annotations that need no grammar service: clause-aware semantic chunks, phrasal verbs
 * and idioms, exam-vocabulary membership, and the shallow parser's roles/clauses/structure/morph.
 * They write into the same `groups` / `grammar` fields the remote analyser uses, so the renderer
 * never learns where a label came from.
 */

const PARSE_FEATURES = new Set<string>(['chunk', 'syntax', 'clause', 'structure', 'morph']);
const PARSE_LAYERS: ParseFeature[] = ['syntax', 'clause', 'structure', 'morph'];

/** Applies chunk spans to copied tokens; punctuation is skipped, so a group stays contiguous. */
const applyChunks = (tokens: Token[], analysis: Analysis): Token[] => {
  const out = [...tokens];
  let group = 0;
  for (const span of chunkSpans(analysis)) {
    const id = `rule-${group++}`;
    const first = analysis.words[span.start].index;
    const last = analysis.words[span.end].index;
    for (let index = first; index <= last; index++) {
      if (isBreak(tokens[index])) continue;
      out[index] = { ...out[index], groups: { ...out[index].groups, [CHUNK_GROUP_KEY]: id } };
    }
  }
  return out;
};

/** Contiguous NP / PP / VP spans, clause-aware where the shallow parser can place them. */
export const chunks = (tokens: Token[]): Token[] => applyChunks(tokens, analyze(tokens));

/**
 * Matches `phrases.ts` entries across word-token boundaries. Whitespace is ignored; inflected
 * forms match through `baseForm`. No `groups` key is written — only the expression label.
 */
export const expressions = (tokens: Token[]): Token[] => {
  const words: { index: number; forms: Set<string>; run: number }[] = [];
  let run = 0;
  tokens.forEach((token, index) => {
    if (isSpace(token)) return;
    if (isBreak(token)) {
      run++;
      return;
    }
    const forms = new Set<string>();
    for (const value of [token.surface, token.baseForm]) {
      const form = value.trim().toLowerCase().replace(/[’‘]/g, "'");
      if (form) forms.add(form);
    }
    words.push({ index, forms, run });
  });

  const hit = new Set<number>();
  for (const phrase of PHRASES) {
    const parts = phraseWords(phrase);
    for (let start = 0; start + parts.length <= words.length; start++) {
      const first = words[start];
      let matched = true;
      for (let offset = 0; offset < parts.length; offset++) {
        const word = words[start + offset];
        if (word.run !== first.run || !word.forms.has(parts[offset])) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      for (let offset = 0; offset < parts.length; offset++) hit.add(words[start + offset].index);
    }
  }

  return tokens.map((token, index) => (hit.has(index) ? withGrammar(token, EXPRESSION_ELEMENT) : token));
};

/** Marks dictionary words that carry any exam tag; band filtering happens later. */
export const levels = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
): Token[] =>
  tokens.map((token) => {
    const entry = token.dictIdx !== undefined ? entries[token.dictIdx] : undefined;
    return entry && entryInBands(EN_BANDS, entry, bands) ? withGrammar(token, LEVEL_ELEMENT) : token;
  });

export const local = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
  features: FeatureId[],
): Token[] => {
  const analysis = features.some((id) => PARSE_FEATURES.has(id)) ? analyze(tokens) : undefined;
  let annotated = tokens;
  if (analysis) {
    const layers = PARSE_LAYERS.filter((layer) => features.includes(layer));
    if (layers.length) annotated = applyParse(annotated, analysis, layers);
    if (features.includes('chunk')) annotated = applyChunks(annotated, analysis);
  }
  if (features.includes('expression')) annotated = expressions(annotated);
  if (features.includes('exam')) annotated = levels(annotated, entries, bands);
  return annotated;
};
