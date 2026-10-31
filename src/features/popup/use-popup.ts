import * as React from 'react';

import {
  clampDictDuration,
  defaultDictSettings,
  loadDictSettings,
  patchDictSettings,
  type DictLevel,
  type DictSettings,
} from '@/shared/dictSettings';
import { packTitleForDisplay, ruleNameForDisplay, t } from '@/shared/i18n';
import { importKitsunekkoArchive, loadKitsunekkoIndex } from '@/shared/kitsunekkoLibrary';
import { listLibrary, listPacks, type LibraryEntry, type LibraryPack } from '@/shared/library';
import {
  boundPackOf,
  defaultSiteRules,
  loadSiteRules,
  resolveSite,
  saveSiteRules,
  type ResolvedSite,
  type SiteRules,
} from '@/shared/siteRules';
import { needsEnglish, requestEnglishQuery } from '@/shared/translate';
import { listDir, mergeSeries, searchSeries, type SeriesDir, type SubFile } from '@/features/scraper/kitsunekko';
import { toast } from '@/design-system';

export type PopupTab = 'subs' | 'sites';

type PopupStatus = { hasVideo: boolean; subtitle: string; theater: boolean };

type OnlineState =
  | { mode: 'idle' }
  | { mode: 'searching' }
  | { mode: 'results'; translated?: string | null }
  | { mode: 'dir'; dir: SeriesDir; dirs: SeriesDir[]; files: SubFile[] };

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const callTab = <T,>(tabId: number | null, message: unknown): Promise<T | null> =>
  new Promise((resolve) => {
    if (tabId === null) {
      resolve(null);
      return;
    }
    chrome.tabs.sendMessage(tabId, message, (response: T | undefined) => {
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });

const groupByPack = (entries: LibraryEntry[]): Map<string, LibraryEntry[]> => {
  const byPack = new Map<string, LibraryEntry[]>();
  for (const entry of entries) {
    const list = byPack.get(entry.packId);
    if (list) list.push(entry);
    else byPack.set(entry.packId, [entry]);
  }
  return byPack;
};

export const usePopup = () => {
  const [tabId, setTabId] = React.useState<number | null>(null);
  const tabIdRef = React.useRef<number | null>(null);
  const [tabUrl, setTabUrl] = React.useState('');
  const [hasTab, setHasTab] = React.useState(false);
  const [rules, setRules] = React.useState<SiteRules>(() => defaultSiteRules());
  const [site, setSite] = React.useState<ResolvedSite | null>(null);
  const [packs, setPacks] = React.useState<LibraryPack[]>([]);
  const [entries, setEntries] = React.useState<LibraryEntry[]>([]);
  const [dict, setDict] = React.useState<DictSettings>(defaultDictSettings());
  const [status, setStatus] = React.useState<PopupStatus | null>(null);
  const [statusChecked, setStatusChecked] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState<PopupTab>('subs');
  const [query, setQuery] = React.useState('');
  const [online, setOnline] = React.useState<OnlineState>({ mode: 'idle' });
  const [onlineHits, setOnlineHits] = React.useState<SeriesDir[]>([]);
  const onlineDirStack = React.useRef<SeriesDir[]>([]);
  const searchSeq = React.useRef(0);
  const searchTimer = React.useRef(0);
  const [openPacks, setOpenPacks] = React.useState<Set<string>>(new Set());

  const refreshStatus = React.useCallback(async (id = tabIdRef.current) => {
    const next = await callTab<PopupStatus>(id, { type: 'popupStatus' });
    setStatus(next);
    setStatusChecked(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (cancelled) return;
      const id = tab?.id ?? null;
      tabIdRef.current = id;
      setTabId(id);
      setHasTab(tab !== undefined);
      setTabUrl(tab?.url ?? '');

      const [nextRules, nextPacks, nextEntries, nextDict] = await Promise.all([
        loadSiteRules(),
        listPacks(),
        listLibrary(),
        loadDictSettings(),
      ]);
      if (cancelled) return;
      setRules(nextRules);
      setPacks(nextPacks);
      setEntries(nextEntries);
      setDict(nextDict);
      const resolved = tab?.url ? await resolveSite(nextRules, tab.url) : null;
      if (cancelled) return;
      setSite(resolved);

      const boundId = resolved ? boundPackOf(nextRules, resolved.rule.id, resolved.seriesId) : '';
      const preferred = boundId ? nextPacks.find((pack) => pack.id === boundId) : undefined;
      const first = preferred ?? nextPacks[0];
      if (first) setOpenPacks(new Set([first.id]));

      void refreshStatus(id);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  const boundPack = React.useMemo(() => {
    if (!site) return undefined;
    const id = boundPackOf(rules, site.rule.id, site.seriesId);
    return id ? packs.find((pack) => pack.id === id) : undefined;
  }, [rules, site, packs]);

  const applyEntry = React.useCallback(
    async (entry: LibraryEntry) => {
      const response = await callTab<{ ok: boolean; error?: string }>(tabIdRef.current, {
        type: 'popupApply',
        id: entry.id,
      });
      if (response?.ok) {
        toast.success(t('popup.toast.applied', { name: entry.name }));
        void refreshStatus();
        return true;
      }
      toast.error(
        response?.error ? t('errors.applyFailed', { error: response.error }) : t('errors.noPlayer'),
      );
      return false;
    },
    [refreshStatus],
  );

  const importFile = React.useCallback(
    async (dir: SeriesDir, file: SubFile) => {
      try {
        const { pack, entries: imported, errors } = await importKitsunekkoArchive(dir, file);
        const [nextPacks, nextEntries] = await Promise.all([listPacks(), listLibrary()]);
        setPacks(nextPacks);
        setEntries(nextEntries);
        const summary = t('popup.toast.imported', {
          count: imported.length,
          pack: packTitleForDisplay(pack.title, t),
        });
        if (errors) {
          toast.warning(summary + t('popup.toast.parseFailed', { count: errors }));
        } else {
          toast.success(summary);
        }
        return true;
      } catch (error) {
        toast.error(t('errors.downloadFailed', { error: errorText(error) }));
        return false;
      }
    },
    [],
  );

  const showDir = React.useCallback(async (dir: SeriesDir, push: boolean) => {
    if (push) onlineDirStack.current.push(dir);
    setOnline({ mode: 'searching' });
    try {
      const { dirs, files } = await listDir(dir.path);
      setOnline({ mode: 'dir', dir, dirs, files });
    } catch (error) {
      setOnline({ mode: 'dir', dir, dirs: [], files: [] });
      toast.error(t('errors.readDirFailed', { error: errorText(error) }));
    }
  }, []);

  const goBack = React.useCallback(async () => {
    onlineDirStack.current.pop();
    const parent = onlineDirStack.current[onlineDirStack.current.length - 1];
    if (parent) await showDir(parent, false);
    else setOnline({ mode: 'results' });
  }, [showDir]);

  const runSearch = React.useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) {
      searchSeq.current += 1;
      setOnline({ mode: 'idle' });
      onlineDirStack.current = [];
      return;
    }
    onlineDirStack.current = [];
    const seq = ++searchSeq.current;
    setOnline({ mode: 'searching' });
    try {
      const index = await loadKitsunekkoIndex();
      if (seq !== searchSeq.current) return;
      const hits = searchSeries(index, text);
      setOnlineHits(hits);
      setOnline({ mode: 'results' });
      if (!needsEnglish(text)) return;
      const english = await requestEnglishQuery(text);
      if (!english || seq !== searchSeq.current) return;
      setOnlineHits(mergeSeries([hits, searchSeries(index, english)]));
      setOnline({ mode: 'results', translated: english });
    } catch (error) {
      if (seq !== searchSeq.current) return;
      setOnline({ mode: 'idle' });
      toast.error(t('errors.searchFailed', { error: errorText(error) }));
    }
  }, []);

  // Debounce the online half of the search; local filtering is synchronous.
  React.useEffect(() => {
    if (activeTab !== 'subs') return;
    window.clearTimeout(searchTimer.current);
    if (!query.trim()) {
      searchSeq.current += 1;
      setOnline({ mode: 'idle' });
      onlineDirStack.current = [];
      return;
    }
    searchTimer.current = window.setTimeout(() => void runSearch(query), 350);
    return () => window.clearTimeout(searchTimer.current);
  }, [query, activeTab, runSearch]);

  const submitSearch = React.useCallback(() => {
    window.clearTimeout(searchTimer.current);
    void runSearch(query);
  }, [query, runSearch]);

  const saveDict = React.useCallback(async (patch: Partial<DictSettings>) => {
    await patchDictSettings(patch);
    setDict(await loadDictSettings());
  }, []);

  const setDictDurationSeconds = React.useCallback(
    async (seconds: number) => {
      const ms = clampDictDuration(seconds * 1000);
      await saveDict({ duration: { ...dict.duration, ms } });
    },
    [dict.duration, saveDict],
  );

  const toggleRule = React.useCallback(
    async (ruleId: string, enabled: boolean) => {
      const next: SiteRules = {
        ...rules,
        rules: rules.rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)),
      };
      setRules(next);
      await saveSiteRules(next);
      const rule = next.rules.find((item) => item.id === ruleId);
      if (rule) {
        toast.success(
          t(enabled ? 'popup.toast.ruleEnabled' : 'popup.toast.ruleDisabled', {
            name: ruleNameForDisplay(rule.name, t) || rule.id,
          }),
        );
      }
    },
    [rules],
  );

  const openPanel = React.useCallback(async () => {
    const response = await callTab<{ ok: boolean }>(tabIdRef.current, { type: 'popupPanel' });
    if (!response?.ok) toast.error(t('errors.noPlayer'));
  }, []);

  const toggleTheater = React.useCallback(async () => {
    const response = await callTab<{ ok: boolean; active?: boolean }>(tabIdRef.current, {
      type: 'popupTheater',
    });
    if (!response?.ok) {
      toast.error(t('errors.noPlayer'));
      return false;
    }
    setStatus((previous) =>
      previous ? { ...previous, theater: response.active ?? !previous.theater } : previous,
    );
    return true;
  }, []);

  const openOptions = React.useCallback((hash = '') => {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });
  }, []);

  const byPack = React.useMemo(() => groupByPack(entries), [entries]);

  const visiblePacks = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter(
      (pack) =>
        pack.title.toLowerCase().includes(q) ||
        packTitleForDisplay(pack.title, t).toLowerCase().includes(q) ||
        (byPack.get(pack.id) ?? []).some((entry) => entry.name.toLowerCase().includes(q)),
    );
  }, [packs, byPack, query]);

  return {
    tabId,
    hasTab,
    tabUrl,
    rules,
    site,
    packs,
    entries,
    dict,
    status,
    statusChecked,
    activeTab,
    setActiveTab,
    query,
    setQuery,
    submitSearch,
    online,
    onlineHits,
    openPacks,
    setOpenPacks,
    showDir,
    goBack,
    boundPack,
    byPack,
    visiblePacks,
    applyEntry,
    importFile,
    saveDict,
    setDictDurationSeconds,
    toggleRule,
    openPanel,
    toggleTheater,
    openOptions,
    refreshStatus,
  };
};

export type PopupController = ReturnType<typeof usePopup>;
export type { DictLevel, SeriesDir, SubFile };
