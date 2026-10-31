/**
 * User-supplied API keys for subtitle providers.
 *
 * Keys live in `chrome.storage.local` and are never bundled or shipped: the extension only reads
 * them when the user asks for a search. Sentinels and sanitising stay here so every reader agrees
 * on the shape, mirroring `dictSettings`.
 */

export type ProviderKeyId = 'subdl' | 'opensubtitles';

export type ProviderKeys = Partial<Record<ProviderKeyId, string>>;

export const PROVIDER_KEYS_KEY = 'providers:keys';

export const isProviderKeysKey = (key: string): boolean => key === PROVIDER_KEYS_KEY;

/** Drops unknown ids and non-string values; an empty string means "not configured". */
export const sanitizeProviderKeys = (raw: unknown): ProviderKeys => {
  if (!raw || typeof raw !== 'object') return {};
  const out: ProviderKeys = {};
  for (const id of ['subdl', 'opensubtitles'] as const) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === 'string' && value.trim()) out[id] = value.trim();
  }
  return out;
};
