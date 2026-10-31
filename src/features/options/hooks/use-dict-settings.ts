import * as React from 'react';

import {
  clampDictDuration,
  defaultDictSettings,
  loadDictSettings,
  patchDictSettings,
  type DictSettings,
} from '@/shared/dictSettings';

export type DictSettingsController = {
  settings: DictSettings;
  save: (patch: Partial<DictSettings>) => Promise<void>;
  setDurationSeconds: (seconds: number) => Promise<void>;
};

export const useDictSettings = (): DictSettingsController => {
  const [settings, setSettings] = React.useState<DictSettings>(() => defaultDictSettings());

  React.useEffect(() => {
    void loadDictSettings().then(setSettings);
  }, []);

  const save = React.useCallback(async (patch: Partial<DictSettings>) => {
    await patchDictSettings(patch);
    setSettings(await loadDictSettings());
  }, []);

  const setDurationSeconds = React.useCallback(
    async (seconds: number) => {
      const current = await loadDictSettings();
      await save({ duration: { ...current.duration, ms: clampDictDuration(seconds * 1000) } });
    },
    [save],
  );

  return { settings, save, setDurationSeconds };
};
