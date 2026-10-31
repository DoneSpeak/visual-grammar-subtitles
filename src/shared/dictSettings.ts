import { defaultBandSelection } from '@/languages/bands';
import { DEFAULT_LANGUAGE, SELECTABLE_LANGUAGES } from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';

export type DictTrigger = 'click' | 'hover';
/** `cue`: the card closes with its subtitle line; `fixed`: it stays for `durationMs`. */
export type DictDurationMode = 'cue' | 'fixed';

export type DictPronunciation = {
  /** Show the kana reading in romaji under its kana line. */
  romaji: boolean;
};

/** Which dictionary bands each language allows. Languages without bands map to `{}`. */
export type DictBands = Record<LanguageId, BandSelection>;

export type DictSettings = {
  enabled: boolean;
  /** Per language, because JLPT levels and English exam tags are different vocabularies. */
  bands: DictBands;
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

/** Every band the language declares, switched on. A pack without bands contributes `{}`. */
export const defaultDictBands = (): DictBands =>
  Object.fromEntries(SELECTABLE_LANGUAGES.map((pack) => [pack.id, defaultBandSelection(pack.bands)]));

export const defaultDictSettings = (): DictSettings => ({
  enabled: true,
  bands: defaultDictBands(),
  trigger: 'click',
  duration: { mode: 'cue', ms: 8000 },
  pronunciation: { romaji: true },
  pauseOnLookup: false,
});

export const clampDictDuration = (ms: number): number =>
  Math.min(DICT_DURATION_MAX_MS, Math.max(DICT_DURATION_MIN_MS, Math.round(ms)));

/** Pre-v2 stored the Japanese levels as `{ 1: true, … }`; keep the user's choices. */
const legacyLevels = (levels: unknown): BandSelection => {
  if (!levels || typeof levels !== 'object') return {};
  const entries = Object.entries(levels as Record<string, unknown>)
    .filter(([id]) => /^[1-5]$/.test(id))
    .map(([id, enabled]) => [id, enabled === true]);
  return Object.fromEntries(entries);
};

/** Saved bands win over the defaults, band by band, so a newly declared band starts switched on. */
const mergeBands = (saved: DictBands | undefined, legacy: unknown): DictBands => {
  const bands = defaultDictBands();
  if (!saved) {
    // Nothing has been saved since bands replaced levels: translate the JLPT selection.
    bands[DEFAULT_LANGUAGE] = {
      ...bands[DEFAULT_LANGUAGE],
      ...legacyLevels(legacy),
    };
    return bands;
  }
  for (const [language, selection] of Object.entries(saved)) {
    if (selection && typeof selection === 'object') {
      bands[language] = { ...(bands[language] ?? {}), ...selection };
    }
  }
  return bands;
};

export const loadDictSettings = async (): Promise<DictSettings> => {
  const raw = await chrome.storage.local.get(DICT_SETTINGS_KEY);
  const saved = raw[DICT_SETTINGS_KEY] as (Partial<DictSettings> & { levels?: unknown }) | undefined;
  const base = defaultDictSettings();
  return {
    enabled: saved?.enabled ?? base.enabled,
    bands: mergeBands(saved?.bands, saved?.levels),
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

/**
 * Switches bands for one language. `bands` is a single object, so a partial patch would wipe the
 * other languages — every UI caller should go through this helper.
 */
export const patchDictBands = async (language: LanguageId, selection: BandSelection): Promise<void> => {
  const current = await loadDictSettings();
  await patchDictSettings({ bands: { ...current.bands, [language]: selection } });
};
