import type { Pos, Token } from '@/shared/types';

/**
 * Shared word index for the English local annotators.
 *
 * `Word.run` counts punctuation boundaries; a span may never cross one. `Word.sentence` only
 * advances on a strong terminator, so a clause inside a sentence can be found without splitting
 * at commas.
 */

export type Word = { token: Token; index: number; run: number; sentence: number };

export const isSpace = (token: Token): boolean => !/\S/.test(token.surface);

/** Whitespace is transparent inside a phrase; punctuation is a hard boundary. */
export const isBreak = (token: Token): boolean =>
  token.pos === 'PUNCT' || (token.pos === 'SYM' && !isSpace(token));

export const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

export const NP_POS = new Set<Pos>(['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM']);
export const NP_HEADS = new Set<Pos>(['NOUN', 'PROPN', 'PRON', 'NUM']);
export const VP_POS = new Set<Pos>(['AUX', 'VERB', 'ADV']);

const SENTENCE_END = /[.!?;…]/;

export const wordList = (tokens: Token[]): Word[] => {
  const words: Word[] = [];
  let run = 0;
  let sentence = 0;
  tokens.forEach((token, index) => {
    if (isSpace(token)) return;
    if (isBreak(token)) {
      run++;
      if (token.pos === 'PUNCT' && SENTENCE_END.test(token.surface)) sentence++;
      return;
    }
    words.push({ token, index, run, sentence });
  });
  return words;
};

/** End index (inclusive) of the noun phrase starting at `start`, or -1. */
export const nounPhraseEnd = (
  words: Word[],
  start: number,
  limit: number = words.length,
): number => {
  const run = words[start]?.run;
  let end = start;
  while (end < limit && words[end].run === run && NP_POS.has(words[end].token.pos)) end++;
  const hasHead = words.slice(start, end).some((word) => NP_HEADS.has(word.token.pos));
  return hasHead ? end - 1 : -1;
};

/** End index (inclusive) of the verb phrase starting at `start`, or -1. */
export const verbPhraseEnd = (
  words: Word[],
  start: number,
  limit: number = words.length,
): number => {
  const run = words[start]?.run;
  let end = start;
  while (end < limit && words[end].run === run && VP_POS.has(words[end].token.pos)) end++;
  const hasVerb = words.slice(start, end).some((word) => word.token.pos === 'VERB');
  return hasVerb ? end - 1 : -1;
};

export type Span = { start: number; end: number };

/**
 * Greedy NP/PP/VP scan over a word range, never crossing a run. This is the fallback for clauses
 * the shallow parser cannot analyse; it is what the annotator used before clause analysis.
 */
export const greedySpans = (words: Word[], from: number, to: number): Span[] => {
  const limit = to + 1;
  const spans: Span[] = [];
  let cursor = from;
  while (cursor < limit) {
    if (words[cursor].token.pos === 'ADP' && words[cursor + 1]?.run === words[cursor].run) {
      const end = nounPhraseEnd(words, cursor + 1, limit);
      if (end >= 0) {
        spans.push({ start: cursor, end });
        cursor = end + 1;
        continue;
      }
    }
    const nounEnd = nounPhraseEnd(words, cursor, limit);
    if (nounEnd >= 0) {
      spans.push({ start: cursor, end: nounEnd });
      cursor = nounEnd + 1;
      continue;
    }
    const verbEnd = verbPhraseEnd(words, cursor, limit);
    if (verbEnd >= 0) {
      spans.push({ start: cursor, end: verbEnd });
      cursor = verbEnd + 1;
      continue;
    }
    cursor++;
  }
  return spans;
};
