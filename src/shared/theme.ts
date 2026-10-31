export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_KEY = 'ui:theme';

const DARK_MEDIA = '(prefers-color-scheme: dark)';

const normalize = (value: unknown): ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system' ? value : 'system';

export const loadThemeMode = async (): Promise<ThemeMode> => {
  const raw = await chrome.storage.local.get(THEME_KEY);
  return normalize(raw[THEME_KEY]);
};

export const saveThemeMode = (mode: ThemeMode): Promise<void> =>
  chrome.storage.local.set({ [THEME_KEY]: mode });

export const resolvedTheme = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'system' ? (window.matchMedia(DARK_MEDIA).matches ? 'dark' : 'light') : mode;

export const applyTheme = (mode: ThemeMode): void => {
  document.documentElement.dataset.theme = resolvedTheme(mode);
};

/**
 * Applies the theme now and keeps it live: OS changes while in system mode, and mode
 * changes made from the other extension page. Returns a teardown for the listeners.
 */
export const watchTheme = (onMode: (mode: ThemeMode) => void): (() => void) => {
  const media = window.matchMedia(DARK_MEDIA);
  let mode: ThemeMode = 'system';

  const paint = (): void => {
    document.documentElement.dataset.theme = resolvedTheme(mode);
    onMode(mode);
  };
  const onMedia = (): void => {
    if (mode === 'system') paint();
  };
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !changes[THEME_KEY]) return;
    mode = normalize(changes[THEME_KEY].newValue);
    paint();
  };

  // Paint the OS preference immediately; the stored mode corrects it a microtask later.
  document.documentElement.dataset.theme = resolvedTheme('system');
  media.addEventListener('change', onMedia);
  chrome.storage.onChanged.addListener(onStorage);
  void loadThemeMode().then((loaded) => {
    mode = loaded;
    paint();
  });

  return () => {
    media.removeEventListener('change', onMedia);
    chrome.storage.onChanged.removeListener(onStorage);
  };
};