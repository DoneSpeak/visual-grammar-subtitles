import type { Lexicon } from '@/languages/types';
import type { DictEntry, DictFile } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

export const LEXICON_PATH = 'dict/th/lexicon.json';

/** Thai marks may arrive decomposed; the bundled lexicon is NFC. */
const keyOf = (value: string): string => value.normalize('NFC').trim();

/** Thai has no inflection, so the written form is the only lookup key. */
export const lookupKeys = (token: Token): string[] => {
  const keys = new Set<string>();
  for (const value of [token.baseForm, token.surface]) {
    const key = keyOf(value);
    if (key) keys.add(key);
  }
  return [...keys];
};

/** Exact-form headword index over the bundled Thai lexicon. */
export class ThLexicon implements Lexicon {
  private keys = new Map<string, number>();

  constructor(private entries: DictEntry[]) {
    entries.forEach((entry, idx) => {
      const key = keyOf(entry.w);
      if (key && !this.keys.has(key)) this.keys.set(key, idx);
    });
  }

  find(token: Token): number | undefined {
    for (const key of lookupKeys(token)) {
      const index = this.keys.get(key);
      if (index !== undefined) return index;
    }
    return undefined;
  }

  entry(index: number): DictEntry {
    return this.entries[index];
  }
}

/**
 * Loads `public/dict/th/lexicon.json` from the extension bundle.
 *
 * Same contract as `loadEnLexicon`: absent chrome/fetch (tests, non-extension contexts) or a
 * missing file yields `null`, and the tokenizer keeps working without a dictionary.
 */
export const loadThLexicon = async (): Promise<ThLexicon | null> => {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
    if (typeof fetch !== 'function') return null;
    const response = await fetch(chrome.runtime.getURL(LEXICON_PATH));
    if (!response.ok) return null;
    const data = (await response.json()) as DictFile;
    if (!Array.isArray(data?.entries)) return null;
    const entries = data.entries.filter(
      (entry): entry is DictEntry => Boolean(entry) && typeof entry.w === 'string',
    );
    return new ThLexicon(entries);
  } catch {
    return null;
  }
};
