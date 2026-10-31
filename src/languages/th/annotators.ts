import type { BandSelection } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import {
  SEGMENTATION_ELEMENT,
  TH_EXPRESSION_ELEMENT,
  type FeatureId,
} from '@/shared/studyFeatures';
import type { Pos, Token } from '@/shared/types';

import { CHUNK_GROUP_KEY } from './features';

/**
 * Thai annotations the extension can produce locally.
 *
 * Thai writes words continuously, so mode 1 is just the tokenizer's own boundaries; modes 2, 4
 * and 6 are rule-based groupings over those tokens. They write into the same `grammar` / `groups`
 * fields the analyzer uses, so the renderer cannot tell local from remote.
 */

const isSpace = (token: Token): boolean => !/\S/.test(token.surface);

/** Whitespace is transparent; punctuation ends a phrase. */
const isBreak = (token: Token): boolean => token.pos === 'PUNCT' || (token.pos === 'SYM' && !isSpace(token));

const isWord = (token: Token): boolean => /[\p{L}\p{N}]/u.test(token.surface);

const withGrammar = (token: Token, label: string): Token => ({
  ...token,
  grammar: token.grammar?.includes(label) ? token.grammar : [...(token.grammar ?? []), label],
});

/** Mode 1: mark every word so the renderer can draw the invisible boundaries. */
export const segmentation = (tokens: Token[]): Token[] =>
  tokens.map((token) => (isWord(token) ? withGrammar(token, SEGMENTATION_ELEMENT) : token));

/**
 * Words that open a new meaning unit: conjunctions, conditional markers and time/discourse
 * adverbs. Particles and auxiliaries stay with the word they follow (ก็ attaches right, เอง
 * attaches left), which is what makes `ก็พักก่อน` one block in the reference sentence.
 */
const CONJUNCTION_SURFACES = new Set([
  'ถ้า',
  'ถ้าหาก',
  'หาก',
  'ก็',
  'แต่',
  'และ',
  'หรือ',
  'เพราะ',
  'เมื่อ',
  'ถ้า',
]);

// แล้ว is deliberately absent: after a verb it marks completion and belongs to that chunk.
const STARTER_SURFACES = new Set(['เดี๋ยว', 'ตอนนี้', 'ทีนี้', 'วันนี้', 'พรุ่งนี้', 'เมื่อวาน']);

// The reference line splits `เดี๋ยว` off from the clause it introduces (`เดี๋ยว | ฉันช่วยเอง`),
// unlike the syntax layer, where the whole continuation is one clause.
const STANDALONE_SURFACES = new Set(['เดี๋ยว', 'ตอนนี้', 'ทีนี้']);

const startsChunk = (token: Token): boolean =>
  token.pos === 'SCONJ' ||
  token.pos === 'CCONJ' ||
  STARTER_SURFACES.has(token.surface) ||
  CONJUNCTION_SURFACES.has(token.surface);

type Word = { index: number; token: Token; run: number };

const wordsOf = (tokens: Token[]): Word[] => {
  const words: Word[] = [];
  let run = 0;
  tokens.forEach((token, index) => {
    if (isSpace(token)) return;
    if (isBreak(token)) {
      run++;
      return;
    }
    words.push({ index, token, run });
  });
  return words;
};

/** Mode 2: contiguous semantic chunks, never crossing punctuation. */
export const chunks = (tokens: Token[]): Token[] => {
  const words = wordsOf(tokens);
  const groupAt = new Map<number, string>();
  let group = -1;
  let run = -1;
  let previousStandalone = false;

  for (const word of words) {
    // A new run (punctuation boundary) always starts a new chunk; a standalone time adverb ends
    // its own chunk, so the word after it opens the next one.
    if (word.run !== run || startsChunk(word.token) || previousStandalone) group++;
    run = word.run;
    groupAt.set(word.index, `rule-${group}`);
    previousStandalone = STANDALONE_SURFACES.has(word.token.surface);
  }

  const out = tokens.map((token, index) => {
    const id = groupAt.get(index);
    return id ? { ...token, groups: { ...token.groups, [CHUNK_GROUP_KEY]: id } } : token;
  });

  // Whitespace between two tokens of the same chunk belongs to it, so the block stays unbroken.
  for (let index = 1; index < out.length - 1; index++) {
    if (!isSpace(out[index])) continue;
    const left = out[index - 1].groups?.[CHUNK_GROUP_KEY];
    const right = out[index + 1].groups?.[CHUNK_GROUP_KEY];
    if (left && left === right) {
      out[index] = { ...out[index], groups: { ...out[index].groups, [CHUNK_GROUP_KEY]: left } };
    }
  }
  return out;
};

/**
 * Mode 6: fixed spoken patterns. Written as regex sources so a slot can stay open without
 * enumerating every surface form (`เดี๋ยว…เอง`).
 */
const EXPRESSION_SOURCES: readonly RegExp[] = [
  /ถ้า[^\s]{0,30}ก็/g,
  /ไม่เป็นไร(?:นะ)?/g,
  /เดี๋ยว[^\s]{0,20}เอง/g,
  /พักก่อน/g,
];

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
    const pattern = new RegExp(source.source, source.flags);
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
  return tokens.map((token, index) =>
    hit.has(index) ? withGrammar(token, TH_EXPRESSION_ELEMENT) : token,
  );
};

/**
 * Mode 4: the function words that carry condition, sequence, time, emphasis and the progressive
 * frame. กำลัง and อยู่ are tagged independently because the frame is discontinuous; both carry
 * the same element, so the renderer marks the two ends without inventing an enclosing span.
 */
const ASPECT_SURFACES: ReadonlyArray<readonly [string, string]> = [
  ['ถ้า', 'aspect.function:conditional'],
  ['ถ้าหาก', 'aspect.function:conditional'],
  ['หาก', 'aspect.function:conditional'],
  ['ก็', 'aspect.function:connective'],
  ['ก่อน', 'aspect.function:sequence'],
  ['แล้ว', 'aspect.function:sequence'],
  ['เดี๋ยว', 'aspect.function:prospective'],
  ['จะ', 'aspect.function:prospective'],
  ['เอง', 'aspect.function:emphasis'],
  ['กำลัง', 'aspect.function:progressive'],
  ['อยู่', 'aspect.function:progressive'],
];

const ASPECT_BY_SURFACE = new Map(ASPECT_SURFACES);

export const aspect = (tokens: Token[]): Token[] =>
  tokens.map((token) => {
    const label = ASPECT_BY_SURFACE.get(token.surface);
    return label ? withGrammar(token, label) : token;
  });

/** Thai has no study bands yet, so the band layer is a no-op rather than a lookup. */
export const levels = (tokens: Token[]): Token[] => tokens;

export const local = (
  tokens: Token[],
  _entries: DictEntry[],
  _bands: BandSelection,
  features: FeatureId[],
): Token[] => {
  let annotated = tokens;
  if (features.includes('segmentation')) annotated = segmentation(annotated);
  if (features.includes('chunk')) annotated = chunks(annotated);
  if (features.includes('aspect')) annotated = aspect(annotated);
  if (features.includes('expression')) annotated = expressions(annotated);
  return annotated;
};
