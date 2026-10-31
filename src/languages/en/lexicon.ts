import type { Lexicon } from '@/languages/types';
import type { DictEntry, DictFile } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

import { FUNCTION_WORDS } from './pos';

export const LEXICON_PATH = 'dict/en/lexicon.json';

/** Matches `normalizeWord`: ECDICT headwords use ASCII apostrophes. */
const normalizeKey = (value: string): string =>
  value.toLowerCase().replace(/[’‘]/g, "'").trim();

/** Lookup candidates in priority order: lemma, then the surface as written. */
export const lookupKeys = (token: Token): string[] => {
  if (FUNCTION_WORDS.has(token.pos)) return [];
  const keys = new Set<string>();
  for (const value of [token.baseForm, token.surface]) {
    const key = normalizeKey(value);
    if (key && key !== '*') keys.add(key);
  }
  return [...keys];
};

/** Case-insensitive headword index over the bundled English seed lexicon. */
export class EnLexicon implements Lexicon {
  private keys = new Map<string, number>();
  /** Inflected forms; a real headword always wins, so these are a second pass. */
  private forms = new Map<string, number>();

  constructor(private entries: DictEntry[]) {
    entries.forEach((entry, idx) => {
      const key = normalizeKey(entry.w);
      if (key && !this.keys.has(key)) this.keys.set(key, idx);
    });
    entries.forEach((entry, idx) => {
      for (const form of entry.forms ?? []) {
        const key = normalizeKey(form);
        if (key && !this.keys.has(key) && !this.forms.has(key)) this.forms.set(key, idx);
      }
    });
  }

  find(token: Token): number | undefined {
    for (const key of lookupKeys(token)) {
      const index = this.keys.get(key) ?? this.forms.get(key);
      if (index !== undefined) return index;
    }
    return undefined;
  }

  entry(index: number): DictEntry {
    return this.entries[index];
  }
}

/**
 * Loads `public/dict/en/lexicon.json` from the extension bundle.
 *
 * Runs in the MV3 service worker, so `chrome.runtime.getURL` is the only supported address.
 * Tests and non-extension contexts get `null`, which keeps the tokenizer usable without data.
 */
export const loadEnLexicon = async (): Promise<EnLexicon | null> => {
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
    return new EnLexicon(entries);
  } catch {
    return null;
  }
};
