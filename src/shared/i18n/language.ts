import type { Language } from './types';

export const LANGUAGE_KEY = 'ui:language';
export const DEFAULT_LANGUAGE: Language = 'zh-CN';

const normalizeTag = (tag: string | null | undefined): Language | null => {
  if (!tag) return null;
  if (/^zh\b/i.test(tag)) return 'zh-CN';
  if (/^en\b/i.test(tag)) return 'en-GB';
  return null;
};

/** Accepts a stored value (`zh-CN`) or a raw browser tag (`zh-TW`, `en-US`). */
export const normalizeLanguage = (value: unknown): Language | null =>
  normalizeTag(typeof value === 'string' ? value : null);

const uiLanguage = (): string | null => {
  if (typeof chrome === 'undefined') return null;
  try {
    return chrome.i18n?.getUILanguage?.() ?? null;
  } catch {
    return null;
  }
};

/** Browser UI language first, then the navigator's preference list; anything else is zh-CN. */
export const resolveBrowserLanguage = (): Language => {
  const candidates: (string | null | undefined)[] = [uiLanguage()];
  if (typeof navigator !== 'undefined') {
    candidates.push(...(navigator.languages ?? []), navigator.language);
  }
  for (const tag of candidates) {
    const hit = normalizeTag(tag);
    if (hit) return hit;
  }
  return DEFAULT_LANGUAGE;
};

// Synchronous cache so `t()` works before storage resolves. Never read storage at module top.
let current: Language = resolveBrowserLanguage();
const listeners = new Set<(language: Language) => void>();

export const getLanguage = (): Language => current;

export const applyLanguage = (language: Language): void => {
  if (current === language) return;
  current = language;
  for (const listener of listeners) listener(language);
};

export const loadLanguage = async (): Promise<Language> => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return current;
    const raw = await chrome.storage.local.get(LANGUAGE_KEY);
    return normalizeLanguage(raw[LANGUAGE_KEY]) ?? resolveBrowserLanguage();
  } catch {
    return current;
  }
};

export const saveLanguage = async (language: Language): Promise<void> => {
  try {
    await chrome.storage.local.set({ [LANGUAGE_KEY]: language });
  } catch {
    // Storage unavailable (Storybook, tests): keep the in-memory choice.
  }
};

/** Applies the choice now and persists it; other contexts receive it through storage. */
export const setLanguage = (language: Language): void => {
  applyLanguage(language);
  void saveLanguage(language);
};

let initPromise: Promise<Language> | null = null;

/** Loads the stored preference once. Safe to call from every context. */
export const initI18n = (): Promise<Language> => {
  initPromise ??= loadLanguage().then((language) => {
    applyLanguage(language);
    return language;
  });
  return initPromise;
};

/** Live updates from another extension page or the content script. Returns a teardown. */
export const watchLanguage = (onChange: (language: Language) => void): (() => void) => {
  listeners.add(onChange);
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return () => listeners.delete(onChange);
  }
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !changes[LANGUAGE_KEY]) return;
    const next = normalizeLanguage(changes[LANGUAGE_KEY].newValue);
    if (next) applyLanguage(next);
  };
  chrome.storage.onChanged.addListener(onStorage);
  return () => {
    listeners.delete(onChange);
    chrome.storage.onChanged.removeListener(onStorage);
  };
};
