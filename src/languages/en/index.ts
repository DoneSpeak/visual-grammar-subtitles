import type { LanguagePack } from '@/languages/types';

import { chunks, expressions, levels, local } from './annotators';
import { EN_BANDS } from './bands';
import { enFeatures } from './features';
import { lookupKeys } from './lexicon';
import { FUNCTION_WORDS, isInflected, posGroup, toPos } from './pos';
import { reading } from './presentation';
import { classifyBreak, segment } from './text';

const LATIN = /[A-Za-z]/g;
/** Non-global: `.test` must not carry `lastIndex` between detection calls. */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /[\p{Script=Han}]/gu;

/**
 * Latin text with spaces is English; kana is never English.
 *
 * Han-only text scores 0 so it falls to `plain` rather than being tokenized as English. A mixed
 * Han/Latin line takes the Latin share, and a single unspaced Latin word is damped because it
 * could be a code, a URL fragment, or a name.
 */
const detect = (text: string): number => {
  const latin = text.match(LATIN)?.length ?? 0;
  if (latin < 3) return 0;
  if (KANA.test(text)) return 0;

  const han = (text.match(HAN)?.length ?? 0) + (text.match(/\p{Script=Thai}/gu)?.length ?? 0);
  const latinShare = han ? latin / (latin + han) : 1;
  const score = /\s/.test(text) ? latinShare : latinShare * 0.65;
  return Math.min(0.95, score);
};

export const en: LanguagePack = {
  id: 'en',
  shortLabel: 'EN',
  displayName: 'English',
  detect,
  toPos,
  posGroup,
  isInflected,
  functionWords: FUNCTION_WORDS,
  lookupKeys,
  annotators: { chunks, expressions, levels, local },
  text: { locale: 'en', segment, classifyBreak },
  presentation: { reading },
  features: enFeatures,
  bands: EN_BANDS,
};

export { createEnRuntime } from './tokenizer';
export { enFeatures } from './features';
