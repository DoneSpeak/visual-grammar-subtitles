import * as React from 'react';

import {
  PROVIDER_KEYS_KEY,
  sanitizeProviderKeys,
  type ProviderKeyId,
  type ProviderKeys,
} from '@/shared/providerSettings';
import {
  providerFor,
  type EpisodeFile,
  type ProviderDescriptor,
  type SeriesHit,
} from '@/features/scraper/providers';
import type { SubtitleLanguageId } from '@/shared/subtitleLanguages';

/**
 * Search state for one provider: the chosen subtitle language, the stored key, the series hit
 * under inspection, its episode files, and the season/episode filter. The learning language and
 * the subtitle language are independent; the key is read once and written back explicitly.
 */
export const useProviderSearch = (initialLanguage: SubtitleLanguageId) => {
  const [subtitleLanguage, setSubtitleLanguageState] =
    React.useState<SubtitleLanguageId>(initialLanguage);
  const provider: ProviderDescriptor | undefined = providerFor(subtitleLanguage);
  const [keys, setKeys] = React.useState<ProviderKeys>({});
  const [query, setQuery] = React.useState('');
  const [season, setSeason] = React.useState('');
  const [episode, setEpisode] = React.useState('');
  const [hits, setHits] = React.useState<SeriesHit[] | null>(null);
  const [hit, setHit] = React.useState<SeriesHit | null>(null);
  const [files, setFiles] = React.useState<EpisodeFile[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [listing, setListing] = React.useState(false);
  const [importing, setImporting] = React.useState<string | null>(null);

  React.useEffect(() => {
    void chrome.storage.local.get(PROVIDER_KEYS_KEY).then((raw) => {
      setKeys(sanitizeProviderKeys(raw[PROVIDER_KEYS_KEY]));
    });
  }, []);

  const key = provider ? (keys[provider.id] ?? '') : '';

  /** A different language invalidates every result on screen; the key and query survive. */
  const setSubtitleLanguage = React.useCallback((language: SubtitleLanguageId) => {
    setSubtitleLanguageState(language);
    setHits(null);
    setHit(null);
    setFiles([]);
  }, []);

  const saveKey = React.useCallback(
    async (id: ProviderKeyId, value: string) => {
      const next = sanitizeProviderKeys({ ...keys, [id]: value });
      setKeys(next);
      await chrome.storage.local.set({ [PROVIDER_KEYS_KEY]: next });
    },
    [keys],
  );

  const search = React.useCallback(async () => {
    if (!provider || !key || !query.trim()) return;
    setSearching(true);
    setHit(null);
    setFiles([]);
    try {
      const found = await provider.create(key, subtitleLanguage).search(query.trim());
      setHits(found);
    } finally {
      setSearching(false);
    }
  }, [provider, key, subtitleLanguage, query]);

  const open = React.useCallback(
    async (target: SeriesHit) => {
      if (!provider || !key) return;
      setListing(true);
      setHit(target);
      try {
        const found = await provider.create(key, subtitleLanguage).listEpisodes(target, {
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        });
        setFiles(found);
      } finally {
        setListing(false);
      }
    },
    [provider, key, subtitleLanguage, season, episode],
  );

  return {
    provider,
    subtitleLanguage,
    setSubtitleLanguage,
    key,
    saveKey,
    query,
    setQuery,
    season,
    setSeason,
    episode,
    setEpisode,
    hits,
    hit,
    files,
    searching,
    listing,
    importing,
    setImporting,
    search,
    open,
  };
};
