import * as React from 'react';

import {
  listDir,
  mergeSeries,
  searchSeries,
  type DirListing,
  type SeriesDir,
} from '@/features/scraper/kitsunekko';
import { loadKitsunekkoIndex } from '@/shared/kitsunekkoLibrary';
import { t } from '@/shared/i18n';
import { needsEnglish, requestEnglishQuery } from '@/shared/translate';

export type KitsunekkoController = {
  query: string;
  setQuery: (value: string) => void;
  searching: boolean;
  hits: SeriesDir[] | null;
  translated: string | null;
  search: () => Promise<void>;
  /** Directory trail; the last entry is the open directory. */
  trail: SeriesDir[];
  listing: DirListing | null;
  dirLoading: boolean;
  openDir: (dir: SeriesDir) => Promise<void>;
  back: () => Promise<void>;
  reset: () => void;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useKitsunekko = (onError: (message: string) => void): KitsunekkoController => {
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [hits, setHits] = React.useState<SeriesDir[] | null>(null);
  const [translated, setTranslated] = React.useState<string | null>(null);
  const [trail, setTrail] = React.useState<SeriesDir[]>([]);
  const [listing, setListing] = React.useState<DirListing | null>(null);
  const [dirLoading, setDirLoading] = React.useState(false);
  const seq = React.useRef(0);

  const search = React.useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    const current = ++seq.current;
    setTrail([]);
    setListing(null);
    setSearching(true);
    try {
      const index = await loadKitsunekkoIndex();
      let results = searchSeries(index, text);
      let english: string | null = null;
      if (needsEnglish(text)) {
        english = await requestEnglishQuery(text);
        if (english) results = mergeSeries([results, searchSeries(index, english)]);
      }
      if (current !== seq.current) return;
      setHits(results);
      setTranslated(english);
    } catch (error) {
      if (current !== seq.current) return;
      setHits([]);
      setTranslated(null);
      onError(t('errors.indexLoadFailed', { error: errorText(error) }));
    } finally {
      if (current === seq.current) setSearching(false);
    }
  }, [query, onError]);

  const load = React.useCallback(
    async (nextTrail: SeriesDir[]) => {
      const dir = nextTrail[nextTrail.length - 1];
      if (!dir) {
        setTrail([]);
        setListing(null);
        return;
      }
      setTrail(nextTrail);
      setDirLoading(true);
      try {
        setListing(await listDir(dir.path));
      } catch (error) {
        setListing({ dirs: [], files: [] });
        onError(t('errors.readDirFailed', { error: errorText(error) }));
      } finally {
        setDirLoading(false);
      }
    },
    [onError],
  );

  const openDir = React.useCallback(
    async (dir: SeriesDir) => {
      await load([...trail, dir]);
    },
    [load, trail],
  );

  const back = React.useCallback(async () => {
    await load(trail.slice(0, -1));
  }, [load, trail]);

  const reset = React.useCallback(() => {
    seq.current += 1;
    setTrail([]);
    setListing(null);
    setHits(null);
    setTranslated(null);
    setSearching(false);
  }, []);

  return {
    query,
    setQuery,
    searching,
    hits,
    translated,
    search,
    trail,
    listing,
    dirLoading,
    openDir,
    back,
    reset,
  };
};
