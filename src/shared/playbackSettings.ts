export type PlaybackSettings = {
  /** Jump over ad stretches marked on the episode's subtitle timeline. */
  autoSkipAds: boolean;
};

export const PLAYBACK_SETTINGS_KEY = 'playback:settings';

export const isPlaybackSettingsKey = (key: string): boolean => key === PLAYBACK_SETTINGS_KEY;

export const defaultPlaybackSettings = (): PlaybackSettings => ({ autoSkipAds: true });

const normalize = (saved?: Partial<PlaybackSettings>): PlaybackSettings => {
  const base = defaultPlaybackSettings();
  return {
    autoSkipAds: typeof saved?.autoSkipAds === 'boolean' ? saved.autoSkipAds : base.autoSkipAds,
  };
};

export const loadPlaybackSettings = async (): Promise<PlaybackSettings> => {
  const raw = await chrome.storage.local.get(PLAYBACK_SETTINGS_KEY);
  return normalize(raw[PLAYBACK_SETTINGS_KEY] as Partial<PlaybackSettings> | undefined);
};

export const savePlaybackSettings = async (next: PlaybackSettings): Promise<void> => {
  await chrome.storage.local.set({ [PLAYBACK_SETTINGS_KEY]: normalize(next) });
};