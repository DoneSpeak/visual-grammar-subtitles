import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LEGACY_CONTENT_LANGUAGE_KEY,
  LEARNING_LANGUAGES_KEY,
  loadLearningLanguages,
  normalizeLearningLanguages,
  saveLearningLanguages,
} from '@/shared/learningLanguages';

const stub = (stored: Record<string, unknown> = {}) => {
  const set = vi.fn(async () => undefined);
  vi.stubGlobal('chrome', {
    storage: { local: { get: vi.fn(async () => stored), set } },
  });
  return set;
};

describe('learning languages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to Japanese when nothing is stored', async () => {
    stub();
    await expect(loadLearningLanguages()).resolves.toEqual(['ja']);
  });

  it('migrates the old single content language', async () => {
    stub({ [LEGACY_CONTENT_LANGUAGE_KEY]: 'en' });
    await expect(loadLearningLanguages()).resolves.toEqual(['en']);
  });

  it('ignores an unknown legacy value', async () => {
    stub({ [LEGACY_CONTENT_LANGUAGE_KEY]: 'xx' });
    await expect(loadLearningLanguages()).resolves.toEqual(['ja']);
  });

  it('drops unknown ids and duplicates from the saved set', async () => {
    stub({ [LEARNING_LANGUAGES_KEY]: ['en', 'xx', 'en', 'ja', 42] });
    await expect(loadLearningLanguages()).resolves.toEqual(['en', 'ja']);
  });

  it('prefers the saved set over the legacy key', async () => {
    stub({ [LEARNING_LANGUAGES_KEY]: ['th'], [LEGACY_CONTENT_LANGUAGE_KEY]: 'en' });
    await expect(loadLearningLanguages()).resolves.toEqual(['th']);
  });

  it('never writes an empty set', async () => {
    const set = stub();
    await saveLearningLanguages([]);
    expect(set).toHaveBeenCalledWith({ [LEARNING_LANGUAGES_KEY]: ['ja'] });
  });

  it('writes the normalized set', async () => {
    const set = stub();
    await saveLearningLanguages(['en', 'en', 'nope', 'ja']);
    expect(set).toHaveBeenCalledWith({ [LEARNING_LANGUAGES_KEY]: ['en', 'ja'] });
  });

  it('treats a non-array as empty', () => {
    expect(normalizeLearningLanguages('ja')).toEqual([]);
    expect(normalizeLearningLanguages(null)).toEqual([]);
  });
});
