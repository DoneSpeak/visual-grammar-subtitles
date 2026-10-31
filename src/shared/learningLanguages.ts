import { DEFAULT_LANGUAGE, isSelectableLanguage } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';

/**
 * The languages whose study modes and vocabulary bands the options page exposes.
 *
 * This is a set, not an editing context: a user learning Japanese and English sees both groups
 * side by side. The two subtitle layers (`a` / `b`) are unrelated to it — they pick a language
 * per source, while this only decides what the settings page shows.
 */
export const LEARNING_LANGUAGES_KEY = 'ui:learningLanguages';

/** Pre-multi-language single value; read once as a migration, never written again. */
export const LEGACY_CONTENT_LANGUAGE_KEY = 'ui:contentLanguage';

/** Keeps declaration order, drops unknown ids and duplicates. */
export const normalizeLearningLanguages = (value: unknown): LanguageId[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<LanguageId>();
  for (const id of value) {
    if (typeof id === 'string' && isSelectableLanguage(id)) seen.add(id);
  }
  return [...seen];
};

export const loadLearningLanguages = async (): Promise<LanguageId[]> => {
  const raw = await chrome.storage.local.get([LEARNING_LANGUAGES_KEY, LEGACY_CONTENT_LANGUAGE_KEY]);
  const saved = normalizeLearningLanguages(raw[LEARNING_LANGUAGES_KEY]);
  if (saved.length) return saved;

  const legacy = raw[LEGACY_CONTENT_LANGUAGE_KEY];
  if (typeof legacy === 'string' && isSelectableLanguage(legacy)) return [legacy];
  return [DEFAULT_LANGUAGE];
};

/** Writes the normalized set; an empty input falls back to the default so the page is never blank. */
export const saveLearningLanguages = async (languages: LanguageId[]): Promise<void> => {
  const next = normalizeLearningLanguages(languages);
  await chrome.storage.local.set({
    [LEARNING_LANGUAGES_KEY]: next.length ? next : [DEFAULT_LANGUAGE],
  });
};
