import type { LanguagePack } from '@/languages/types';

import { chunks, expressions, levels, local } from './annotators';
import { JA_BANDS } from './bands';
import { jaFeatures } from './features';
import { FUNCTION_WORDS, lookupKeys } from './lexicon';
import { isInflected, posGroup, toPos } from './pos';
import { alignRuby } from './presentation';
import { classifyBreak, segment } from './text';

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/**
 * Kana is unique to Japanese, so any kana at all is decisive. Han-only text stays ambiguous
 * (Chinese) and scores 0, which sends it to the plain fallback rather than to kuromoji.
 */
const detect = (text: string): number => {
  const kana = text.match(KANA)?.length ?? 0;
  if (!kana) return 0;
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.min(1, 0.6 + (0.4 * kana) / Math.max(1, cjk));
};

export const ja: LanguagePack = {
  id: 'ja',
  shortLabel: 'JA',
  displayName: '日本語',
  detect,
  toPos,
  posGroup,
  isInflected,
  functionWords: FUNCTION_WORDS,
  lookupKeys,
  annotators: { chunks, expressions, levels, local },
  text: { locale: 'ja', segment, classifyBreak },
  presentation: {
    reading: { layout: 'ruby', align: alignRuby },
  },
  features: jaFeatures,
  bands: JA_BANDS,
  dictAttribution: 'dict.footnote.ja',
};
