export type DictLevel = 1 | 2 | 3 | 4 | 5;
export type DictTrigger = 'click' | 'hover';
/** `cue`: the card closes with its subtitle line; `fixed`: it stays for `durationMs`. */
export type DictDurationMode = 'cue' | 'fixed';

export type DictPronunciation = {
  /** Show the kana reading in romaji under its kana line. */
  romaji: boolean;
};

export type DictSettings = {
  enabled: boolean;
  levels: Record<DictLevel, boolean>;
  trigger: DictTrigger;
  duration: { mode: DictDurationMode; ms: number };
  pronunciation: DictPronunciation;
  /** Pause playback when a word is looked up. Only applies to the click trigger. */
  pauseOnLookup: boolean;
};

export const DICT_SETTINGS_KEY = 'dict:settings';

export const isDictSettingsKey = (key: string): boolean => key === DICT_SETTINGS_KEY;

export const DICT_DURATION_MIN_MS = 1000;
export const DICT_DURATION_MAX_MS = 30000;

export const defaultDictSettings = (): DictSettings => ({
  enabled: true,
  levels: { 1: true, 2: true, 3: true, 4: true, 5: true },
  trigger: 'click',
  duration: { mode: 'cue', ms: 8000 },
  pronunciation: { romaji: true },
  pauseOnLookup: false,
});

export const clampDictDuration = (ms: number): number =>
  Math.min(DICT_DURATION_MAX_MS, Math.max(DICT_DURATION_MIN_MS, Math.round(ms)));

export const loadDictSettings = async (): Promise<DictSettings> => {
  const raw = await chrome.storage.local.get(DICT_SETTINGS_KEY);
  const saved = raw[DICT_SETTINGS_KEY] as Partial<DictSettings> | undefined;
  const base = defaultDictSettings();
  return {
    enabled: saved?.enabled ?? base.enabled,
    levels: { ...base.levels, ...saved?.levels },
    trigger: saved?.trigger === 'hover' ? 'hover' : base.trigger,
    duration: {
      mode: saved?.duration?.mode === 'fixed' ? 'fixed' : base.duration.mode,
      ms: typeof saved?.duration?.ms === 'number' ? clampDictDuration(saved.duration.ms) : base.duration.ms,
    },
    pronunciation: {
      romaji: saved?.pronunciation?.romaji ?? base.pronunciation.romaji,
    },
    pauseOnLookup: saved?.pauseOnLookup ?? base.pauseOnLookup,
  };
};

export const patchDictSettings = async (patch: Partial<DictSettings>): Promise<void> => {
  const next = { ...(await loadDictSettings()), ...patch };
  await chrome.storage.local.set({ [DICT_SETTINGS_KEY]: next });
};