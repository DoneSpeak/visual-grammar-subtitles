import type { LanguageRuntime } from '@/languages/tokenizers';
import type { Pos, Token } from '@/shared/types';
import { loadThLexicon } from './lexicon';
import { segment } from './text';

// A small, explicit seed vocabulary. Unknown words and ambiguous particles stay unclassified.
// Function words are tagged here because the local study modes key off their POS as well as
// their surface (see `annotators.ts`).
const SEED: Record<string, Pos> = {
  ฉัน: 'PRON', ผม: 'PRON', คุณ: 'PRON', เรา: 'PRON', เขา: 'PRON',
  กิน: 'VERB', อ่าน: 'VERB', เรียน: 'VERB', พัก: 'VERB', ช่วย: 'VERB', ไป: 'VERB', มา: 'VERB', ทำ: 'VERB',
  แมว: 'NOUN', ปลา: 'NOUN', หนังสือ: 'NOUN', ภาษาไทย: 'NOUN', ไทย: 'PROPN',
  เหนื่อย: 'ADJ', สวย: 'ADJ', ดี: 'ADJ',
  มาก: 'ADV', ก่อน: 'ADV', เดี๋ยว: 'ADV', แล้ว: 'ADV',
  ถ้า: 'SCONJ', และ: 'CCONJ', แต่: 'CCONJ', ก็: 'CCONJ', หรือ: 'CCONJ', เพราะ: 'SCONJ', เมื่อ: 'SCONJ',
  กำลัง: 'AUX', อยู่: 'AUX', จะ: 'AUX',
  ครับ: 'PART', ค่ะ: 'PART', คะ: 'PART', นะ: 'PART', ไหม: 'PART', ไม่: 'PART', เอง: 'PART',
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
  tokenizer: { tokenize }, lexicon: await loadThLexicon(),
});
