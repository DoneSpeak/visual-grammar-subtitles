import * as React from 'react';

import {
  getLibrarySettings,
  listLibrary,
  listPacks,
  patchLibrarySettings,
  type LibraryEntry,
  type LibraryPack,
} from '@/shared/library';

export type LibraryController = {
  packs: LibraryPack[];
  entries: LibraryEntry[];
  autoApply: boolean;
  refresh: () => Promise<void>;
  setAutoApply: (value: boolean) => Promise<void>;
};

/** The subtitle library is a document owned by shared/library.ts; this only mirrors it. */
export const useLibrary = (): LibraryController => {
  const [packs, setPacks] = React.useState<LibraryPack[]>([]);
  const [entries, setEntries] = React.useState<LibraryEntry[]>([]);
  const [autoApply, setAutoApplyState] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [nextEntries, nextPacks, settings] = await Promise.all([
      listLibrary(),
      listPacks(),
      getLibrarySettings(),
    ]);
    setEntries(nextEntries);
    setPacks(nextPacks);
    setAutoApplyState(settings.autoApply);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAutoApply = React.useCallback(async (value: boolean) => {
    setAutoApplyState(value);
    await patchLibrarySettings({ autoApply: value });
  }, []);

  return { packs, entries, autoApply, refresh, setAutoApply };
};
