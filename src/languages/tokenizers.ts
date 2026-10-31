import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

import { createThRuntime } from './th/tokenizer';
import { createEnRuntime } from './en/tokenizer';
import { createJaRuntime } from './ja/tokenizer';
import type { LanguageId } from './types';

/**
 * Runtime tokenizer/lexicon per language.
 *
 * The shared types live here (structurally identical to the language-pack contract) because the
 * tokenizer seam is only ever imported by the background entrypoint. A pack supplies a factory;
 * the loader caches its promise so kuromoji is initialised once per service worker.
 *
 * `plain` has no factory: asking for it resolves to null, which the handlers report as
 * "tokenizer unavailable" and the overlay renders as plain text.
 */

export type Lexicon = { find(token: Token): number | undefined; entry(index: number): DictEntry };
export type Tokenizer = { tokenize(text: string): Token[] };

export type LanguageRuntime = { tokenizer: Tokenizer; lexicon: Lexicon | null };

export const RUNTIME_FACTORIES: Record<LanguageId, () => Promise<LanguageRuntime>> = {
  ja: createJaRuntime,
  en: createEnRuntime,
  th: createThRuntime,
};

const runtimes = new Map<LanguageId, Promise<LanguageRuntime | null>>();

/** Cached runtime, or null when the id has no factory (plain/unknown) or init fails. */
export const loadLanguageRuntime = (id: LanguageId): Promise<LanguageRuntime | null> => {
  const factory = RUNTIME_FACTORIES[id];
  if (!factory) return Promise.resolve(null);
  const cached = runtimes.get(id);
  if (cached) return cached;
  const pending = factory().catch((error) => {
    console.error('[jp-sub] tokenizer init failed', id, error);
    return null;
  });
  runtimes.set(id, pending);
  return pending;
};

/** Test/debug hook: forget cached runtimes so a fresh worker can be simulated. */
export const resetLanguageRuntimes = (): void => {
  runtimes.clear();
};
