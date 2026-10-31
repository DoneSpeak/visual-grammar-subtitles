import type { LanguageRuntime } from '@/languages/tokenizers';
import type { Lexicon, Tokenizer } from '@/languages/types';
import type { Pos, Token } from '@/shared/types';

import { loadEnLexicon } from './lexicon';
import {
  closedClass,
  irregularForm,
  lemmaCandidates,
  negatedBase,
  normalizeWord,
  suffixTag,
  toPos,
} from './pos';

/**
 * English tokenizer, local-first.
 *
 * `Intl.Segmenter('en')` supplies the word boundaries; everything after that is deliberately
 * conservative. Closed-class words are looked up first, irregular forms come from a table, the
 * seed lexicon may claim a word, and only then do endings earn a POS. An unknown word stays `X`
 * rather than receiving a plausible-looking colour it cannot justify.
 */

type Segment = { text: string; wordLike: boolean };

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' },
) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

const wordSegmenter = (): SegmenterCtor | undefined =>
  (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;

const FALLBACK_SEGMENT = /\s+|[A-Za-z0-9]+(?:['’.-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]+/gu;

const segmentText = (text: string): Segment[] => {
  const Ctor = wordSegmenter();
  if (Ctor) {
    return [...new Ctor('en', { granularity: 'word' }).segment(text)]
      .filter((part) => part.segment.length > 0)
      .map((part) => ({
        text: part.segment,
        wordLike: part.isWordLike ?? /[\p{L}\p{N}]/u.test(part.segment),
      }));
  }
  return (text.match(FALLBACK_SEGMENT) ?? []).map((part) => ({
    text: part,
    wordLike: /[\p{L}\p{N}]/u.test(part),
  }));
};

const WHITESPACE = /^\s+$/;
const PUNCTUATION = /^[\p{P}]+$/u;
const SYMBOL = /^[\p{P}\p{S}]+$/u;
const NUMBER = /^\d+(?:[.,]\d+)*$/;

/** One token for one dictionary hit; `toPos` also understands raw Penn Treebank tags. */
const entryPos = (entry: { p?: string[] }): Pos | undefined => {
  for (const raw of entry.p ?? []) {
    const pos = toPos(raw);
    if (pos !== 'X') return pos;
  }
  return undefined;
};

type WordTag = {
  pos: Pos;
  baseForm: string;
  morph?: Record<string, string>;
  dictIdx?: number;
  reading?: string;
};

const tagWord = (surface: string, previousPos: Pos | undefined, lexicon: Lexicon | null): WordTag => {
  const word = normalizeWord(surface);
  if (NUMBER.test(word)) return { pos: 'NUM', baseForm: word };

  const negated = negatedBase(word);
  if (negated) return { pos: 'AUX', baseForm: negated, morph: { Polarity: 'Neg' } };

  const closed = closedClass(word);
  if (closed) {
    const morph = word === 'not' ? { Polarity: 'Neg' } : closed.morph;
    return {
      pos: closed.pos,
      baseForm: closed.baseForm ?? word,
      ...(morph ? { morph } : {}),
    };
  }

  const irregular = irregularForm(word);
  if (irregular) return { pos: 'VERB', baseForm: irregular.baseForm, morph: irregular.morph };

  const suffix = suffixTag(word, previousPos);
  if (lexicon) {
    for (const candidate of lemmaCandidates(word)) {
      const probe: Token = { surface, pos: 'NOUN', baseForm: candidate };
      const index = lexicon.find(probe);
      if (index === undefined) continue;
      const entry = lexicon.entry(index);
      return {
        pos: entryPos(entry) ?? suffix?.pos ?? 'X',
        baseForm: entry.w.toLowerCase(),
        ...(suffix?.morph ? { morph: suffix.morph } : {}),
        ...(entry.ipa ? { reading: entry.ipa } : {}),
        dictIdx: index,
      };
    }
  }

  return {
    pos: suffix?.pos ?? 'X',
    baseForm: word,
    ...(suffix?.morph ? { morph: suffix.morph } : {}),
  };
};

const nonWordToken = (surface: string): Token => {
  if (WHITESPACE.test(surface)) {
    return { surface, pos: 'SYM', posRaw: 'SPACE', baseForm: surface };
  }
  const punctuation = PUNCTUATION.test(surface);
  return {
    surface,
    pos: punctuation ? 'PUNCT' : SYMBOL.test(surface) ? 'SYM' : 'PUNCT',
    posRaw: punctuation ? 'PUNCT' : 'SYM',
    baseForm: surface,
  };
};

/** `to` is a preposition before a noun phrase and an infinitive marker before a verb. */
const refineTo = (tokens: Token[]): Token[] =>
  tokens.map((token, index) => {
    if (normalizeWord(token.surface) !== 'to') return token;
    let next: Token | undefined;
    for (let i = index + 1; i < tokens.length; i++) {
      if (!WHITESPACE.test(tokens[i].surface) && tokens[i].pos !== 'PUNCT') {
        next = tokens[i];
        break;
      }
    }
    const infinitive = next ? ['VERB', 'AUX', 'ADV'].includes(next.pos) : false;
    return infinitive
      ? { ...token, pos: 'PART', morph: { VerbForm: 'Inf' } }
      : { ...token, pos: 'ADP', morph: undefined };
  });

export const tokenize = (text: string, lexicon: Lexicon | null = null): Token[] => {
  if (!text) return [];
  const tokens: Token[] = [];
  let previousWordPos: Pos | undefined;

  for (const part of segmentText(text)) {
    if (!part.wordLike) {
      tokens.push(nonWordToken(part.text));
      continue;
    }
    const tagged = tagWord(part.text, previousWordPos, lexicon);
    tokens.push({
      surface: part.text,
      pos: tagged.pos,
      baseForm: tagged.baseForm,
      ...(tagged.morph ? { morph: tagged.morph } : {}),
      ...(tagged.reading ? { reading: tagged.reading } : {}),
      ...(tagged.dictIdx !== undefined ? { dictIdx: tagged.dictIdx } : {}),
    });
    previousWordPos = tagged.pos;
  }
  return refineTo(tokens);
};

export const createTokenizer = (lexicon: Lexicon | null = null): Tokenizer => ({
  tokenize: (text) => tokenize(text, lexicon),
});

/** Loads the seed lexicon once and pairs it with the tokenizer the background caches. */
export const createEnRuntime = async (): Promise<LanguageRuntime> => {
  const lexicon = await loadEnLexicon();
  return { tokenizer: createTokenizer(lexicon), lexicon };
};
