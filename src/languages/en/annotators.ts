import { entryInBands } from '@/languages/bands';
import type { BandSelection } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import type { FeatureId } from '@/shared/studyFeatures';
import type { Pos, Token } from '@/shared/types';

import { EN_BANDS } from './bands';
import { CHUNK_GROUP_KEY, EXPRESSION_ELEMENT, LEVEL_ELEMENT } from './features';
import { PHRASES, phraseWords } from './phrases';

/**
 * English annotations that need no grammar service: NP/VP/PP chunks, phrasal verbs and idioms,
 * and exam-vocabulary membership. They write into the same `groups` / `grammar` fields the remote
 * analyser uses, so the renderer never learns where a label came from.
 */

const isSpace = (token: Token): boolean => !/\S/.test(token.surface);

/** Whitespace is transparent inside a phrase; punctuation is a hard boundary. */
const isBreak = (token: Token): boolean =>
  token.pos === 'PUNCT' || (token.pos === 'SYM' && !isSpace(token));

const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

const NP_POS = new Set<Pos>(['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM']);
const NP_HEADS = new Set<Pos>(['NOUN', 'PROPN', 'PRON', 'NUM']);
const VP_POS = new Set<Pos>(['AUX', 'VERB', 'ADV']);

type Word = { token: Token; index: number; run: number };

const wordList = (tokens: Token[]): Word[] => {
  const words: Word[] = [];
  let run = 0;
  tokens.forEach((token, index) => {
    if (isSpace(token)) return;
    if (isBreak(token)) {
      run++;
      return;
    }
    words.push({ token, index, run });
  });
  return words;
};

/** End index (inclusive) of the noun phrase starting at `start`, or -1. */
const nounPhraseEnd = (words: Word[], start: number): number => {
  const run = words[start]?.run;
  let end = start;
  while (end < words.length && words[end].run === run && NP_POS.has(words[end].token.pos)) end++;
  const hasHead = words.slice(start, end).some((word) => NP_HEADS.has(word.token.pos));
  return hasHead ? end - 1 : -1;
};

/** End index (inclusive) of the verb phrase starting at `start`, or -1. */
const verbPhraseEnd = (words: Word[], start: number): number => {
  const run = words[start]?.run;
  let end = start;
  while (end < words.length && words[end].run === run && VP_POS.has(words[end].token.pos)) end++;
  const hasVerb = words.slice(start, end).some((word) => word.token.pos === 'VERB');
  return hasVerb ? end - 1 : -1;
};

/**
 * Contiguous NP / VP / PP spans, never crossing punctuation. Whitespace inside a span is included
 * so the renderer sees one uninterrupted group and can round only the outer words.
 */
export const chunks = (tokens: Token[]): Token[] => {
  const words = wordList(tokens);
  const out = [...tokens];
  let group = 0;

  const claim = (from: number, to: number): void => {
    const id = `rule-${group++}`;
    const first = words[from].index;
    const last = words[to].index;
    for (let index = first; index <= last; index++) {
      if (isBreak(tokens[index])) continue;
      out[index] = { ...out[index], groups: { ...out[index].groups, [CHUNK_GROUP_KEY]: id } };
    }
  };

  let cursor = 0;
  while (cursor < words.length) {
    // A preposition plus its noun phrase is one PP; otherwise the NP starts on its own head.
    if (words[cursor].token.pos === 'ADP' && words[cursor + 1]?.run === words[cursor].run) {
      const end = nounPhraseEnd(words, cursor + 1);
      if (end >= 0) {
        claim(cursor, end);
        cursor = end + 1;
        continue;
      }
    }
    const nounEnd = nounPhraseEnd(words, cursor);
    if (nounEnd >= 0) {
      claim(cursor, nounEnd);
      cursor = nounEnd + 1;
      continue;
    }
    const verbEnd = verbPhraseEnd(words, cursor);
    if (verbEnd >= 0) {
      claim(cursor, verbEnd);
      cursor = verbEnd + 1;
      continue;
    }
    cursor++;
  }
  return out;
};

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
  let annotated = tokens;
  if (features.includes('chunk')) annotated = chunks(annotated);
  if (features.includes('expression')) annotated = expressions(annotated);
  if (features.includes('exam')) annotated = levels(annotated, entries, bands);
  return annotated;
};
