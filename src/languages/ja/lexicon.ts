import { toHiragana, type DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

/** Japanese participial lookup: these POS values never map to a dictionary entry. */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set(['助詞', '助動詞', '記号', '空白', '']);

/** Lookup candidates in priority order: lemma first, then surface, then reading. */
export const lookupKeys = (token: Token): string[] => {
  if (FUNCTION_WORDS.has(token.pos)) return [];
  const keys = new Set<string>();
  for (const value of [token.baseForm, token.surface, token.reading]) {
    if (!value || value === '*') continue;
    keys.add(value);
    keys.add(toHiragana(value));
  }
  return [...keys];
};

/** Headword/reading index over the bundled JLPT dictionary. */
export class DictIndex {
  private keys = new Map<string, number[]>();

  constructor(private entries: DictEntry[]) {
    const readingCount = new Map<string, number>();
    for (const entry of entries) {
      const reading = toHiragana(entry.r);
      readingCount.set(reading, (readingCount.get(reading) ?? 0) + 1);
    }
    entries.forEach((entry, idx) => {
      this.claim(entry.w, idx);
      // Reading-only keys alias homographs (こと → 琴, し → 為る); index them only when
      // the reading is unique, so kana-written forms still resolve.
      const reading = toHiragana(entry.r);
      if (reading !== entry.w && readingCount.get(reading) === 1) this.claim(reading, idx);
    });
  }

  private claim(key: string, idx: number): void {
    const list = this.keys.get(key);
    if (!list) this.keys.set(key, [idx]);
    else if (!list.includes(idx)) list.push(idx);
  }

  find(token: Token): number | undefined {
    const reading = toHiragana(token.reading);
    for (const key of lookupKeys(token)) {
      const candidates = this.keys.get(key);
      if (!candidates?.length) continue;
      let best = candidates[0];
      for (const idx of candidates) {
        const entry = this.entries[idx];
        // Same headword, different readings (角 かく/かど/つの): use the token's reading.
        if (reading && toHiragana(entry.r) === reading) return idx;
        if (this.entries[best].lv > entry.lv) best = idx;
      }
      return best;
    }
    return undefined;
  }

  entry(idx: number): DictEntry {
    return this.entries[idx];
  }
}
