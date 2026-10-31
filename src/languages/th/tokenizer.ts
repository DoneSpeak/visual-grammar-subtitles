import type { LanguageRuntime } from '@/languages/tokenizers';
import type { Pos, Token } from '@/shared/types';
import { segment } from './text';

// A small, explicit seed vocabulary. Unknown words and ambiguous particles stay unclassified.
const SEED: Record<string, Pos> = {
  ฉัน: 'PRON', ผม: 'PRON', คุณ: 'PRON', เรา: 'PRON', เขา: 'PRON',
  กิน: 'VERB', อ่าน: 'VERB', เรียน: 'VERB', แมว: 'NOUN', ปลา: 'NOUN',
  หนังสือ: 'NOUN', ภาษาไทย: 'NOUN', และ: 'CCONJ', แต่: 'CCONJ',
  ครับ: 'PART', ค่ะ: 'PART', ไม่: 'PART',
};
export const tokenize = (text: string): Token[] => segment(text).map(surface => ({
  surface, baseForm: surface,
  pos: /^\s+$/u.test(surface) ? 'SYM'
    : /^[\p{N}]+$/u.test(surface) ? 'NUM'
    : /^[\p{P}]+$/u.test(surface) ? 'PUNCT'
    : /^[\p{S}\u200d\ufe0f]+$/u.test(surface) ? 'SYM'
    : SEED[surface] ?? 'X',
}));
export const createThRuntime = async (): Promise<LanguageRuntime> => ({
  tokenizer: { tokenize }, lexicon: null,
});
