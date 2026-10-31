import type { LanguageId } from '@/languages/types';

import type { Token } from './types';

export type DictExample = { j: string; e: string };

/** Serializable shape of one bundled dictionary entry. `z` is reserved for Chinese glosses. */
export type DictEntry = {
  w: string;
  r: string;
  lv: number;
  p: string[];
  g: string[];
  x: DictExample[];
  id: string;
  /** Simplified-Chinese glosses, when a source covers the word. */
  z?: string[];
  /** OpenMoji hexcode for the word's reviewed mnemonic image. */
  img?: string;
  /** Source language; absent means ja (pre-multilingual data). */
  lang?: LanguageId | string;
  /** IPA transcription (English). */
  ipa?: string;
  /** Exam / corpus tags, e.g. 'ielts' | 'toefl' | 'bec' | 'kaoyan'. */
  tags?: string[];
};

export type DictFile = { v: number; entries: DictEntry[] };

/** One tokenized subtitle line plus the entries its `dictIdx` values point into. */
export type DictLine = { tokens: Token[]; entries: DictEntry[] };

/** Katakana → hiragana, so a reading can be compared with a kana-written surface. */
export const toHiragana = (text: string): string =>
  text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));