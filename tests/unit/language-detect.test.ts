import { describe, expect, it } from 'vitest';

import {
  DETECTION_THRESHOLD,
  SELECTABLE_LANGUAGES,
  detectLanguage,
  detectLanguageId,
  isSelectableLanguage,
  resolveLanguage,
} from '@/languages/registry';

describe('language detection routing', () => {
  it('returns the pack id, not the pack object', () => {
    expect(detectLanguageId('私は彼のことを全然知らない。')).toBe('ja');
    expect(detectLanguage('私は彼のことを全然知らない。').id).toBe('ja');
  });

  it('degrades below the threshold to plain instead of guessing', () => {
    expect(detectLanguageId('')).toBe('plain');
    expect(detectLanguageId('我想陪你走过春夏秋冬')).toBe('plain');
    expect(detectLanguage('我想陪你走过春夏秋冬').id).toBe('plain');
    expect(DETECTION_THRESHOLD).toBeGreaterThan(0);
  });

  it('recognises spaced Latin text as English, and kana still wins over stray Latin words', () => {
    expect(detectLanguageId('I have never really understood how this works.')).toBe('en');
    expect(detectLanguageId('これは cookie という意味です。')).toBe('ja');
    // A single short token is not enough evidence to annotate English.
    expect(detectLanguageId('ok')).toBe('plain');
  });

  it('treats an unknown stored id as plain', () => {
    expect(resolveLanguage('xx').id).toBe('plain');
    expect(resolveLanguage(undefined).id).toBe('plain');
  });

  it('offers only annotatable packs in the panel, never plain', () => {
    const ids = SELECTABLE_LANGUAGES.map((pack) => pack.id);
    expect(ids).toContain('ja');
    expect(ids).toContain('en');
    expect(ids).not.toContain('plain');
    expect(isSelectableLanguage('ja')).toBe(true);
    expect(isSelectableLanguage('en')).toBe(true);
    expect(isSelectableLanguage('plain')).toBe(false);
    expect(isSelectableLanguage('xx')).toBe(false);
    expect(isSelectableLanguage(undefined)).toBe(false);
  });
});
