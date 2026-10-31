import { describe, expect, it } from 'vitest';

import {
  SUBTITLE_LANGUAGES,
  subtitleLanguage,
  subtitleLanguageLabel,
  subtitleLanguageShortLabel,
} from '@/shared/subtitleLanguages';

describe('subtitle languages', () => {
  it('declares unique ids with non-empty labels', () => {
    const ids = SUBTITLE_LANGUAGES.map((language) => language.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const language of SUBTITLE_LANGUAGES) {
      expect(language.displayName).not.toBe('');
      expect(language.shortLabel).not.toBe('');
    }
  });

  it('labels both Chinese scripts distinctly', () => {
    expect(subtitleLanguageLabel('zh-Hans')).toBe('简体中文');
    expect(subtitleLanguageLabel('zh-Hant')).toBe('繁體中文');
  });

  it('round-trips an unknown id instead of guessing a language', () => {
    expect(subtitleLanguage('xx')).toBeUndefined();
    expect(subtitleLanguageLabel('xx')).toBe('xx');
    expect(subtitleLanguageShortLabel('xx')).toBe('xx');
  });
});
