import * as React from 'react';

import {
  PROVIDER_KEYS_KEY,
  sanitizeProviderKeys,
  type ProviderKeyId,
  type ProviderKeys,
} from '@/shared/providerSettings';
import {
  providersFor,
  type EpisodeFile,
  type ProviderDescriptor,
  type SeriesHit,
} from '@/features/scraper/providers';
import type { LanguageId } from '@/languages/types';

/**
 * Search state for one provider: the stored key, the series hit under inspection, its episode
 * files, and the season/episode filter. The key is read once and written back explicitly.
 */
export const useProviderSearch = (language: LanguageId) => {
  const provider: ProviderDescriptor | undefined = providersFor(language)[0];
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
      const found = await provider.create(key).search(query.trim());
      setHits(found);
    } finally {
      setSearching(false);
    }
  }, [provider, key, query]);

  const open = React.useCallback(
    async (target: SeriesHit) => {
      if (!provider || !key) return;
      setListing(true);
      setHit(target);
      try {
        const found = await provider.create(key).listEpisodes(target, {
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        });
        setFiles(found);
      } finally {
        setListing(false);
      }
    },
    [provider, key, season, episode],
  );

  return {
    provider,
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
