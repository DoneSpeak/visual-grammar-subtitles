import { describe, expect, it } from 'vitest';

import {
  DETECTION_THRESHOLD,
  LANGUAGE_PACKS,
  detectLanguage,
  plain,
  resolveLanguage,
} from '@/languages/registry';
import type { LanguagePack } from '@/languages/types';
import type { Pos, Token } from '@/shared/types';

const token = (surface: string, pos: Pos): Token => ({
  surface,
  pos,
  baseForm: '',
});

const packs: LanguagePack[] = [...Object.values(LANGUAGE_PACKS), plain];

describe('language packs', () => {
  it.each(packs)('$id implements every capability the renderer calls', (pack) => {
    expect(typeof pack.detect).toBe('function');
    expect(typeof pack.toPos).toBe('function');
    expect(typeof pack.posGroup).toBe('function');
    expect(typeof pack.isInflected).toBe('function');
    expect(pack.functionWords).toBeInstanceOf(Set);
    expect(typeof pack.lookupKeys).toBe('function');
    for (const method of ['chunks', 'expressions', 'levels', 'local'] as const) {
      expect(typeof pack.annotators[method]).toBe('function');
    }
    expect(typeof pack.text.segment).toBe('function');
    expect(typeof pack.text.classifyBreak).toBe('function');
    expect(typeof pack.presentation.reading.align).toBe('function');
  });

  it.each(packs)('$id keeps detection inside 0..1', (pack) => {
    for (const sample of ['', 'こんにちは', 'hello world', '漢字だけ', '1234']) {
      const score = pack.detect(sample);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe('language detection', () => {
  it('picks Japanese when kana is present', () => {
    expect(detectLanguage('私は彼のことを全然知らない。').id).toBe('ja');
  });

  it('falls back to plain for text no pack can annotate', () => {
    expect(detectLanguage('我想陪你走过春夏秋冬').id).toBe('plain');
    expect(detectLanguage('').id).toBe('plain');
  });

  it('uses a threshold, not the argmax', () => {
    expect(DETECTION_THRESHOLD).toBeGreaterThan(0);
    expect(plain.detect('漢字')).toBeLessThan(DETECTION_THRESHOLD);
  });
});

describe('language resolution', () => {
  it('degrades an unknown id to plain instead of Japanese', () => {
    expect(resolveLanguage('xx').id).toBe('plain');
    expect(resolveLanguage(undefined).id).toBe('plain');
  });

  it('keeps plain annotations as identity so every renderer path stays valid', () => {
    const tokens = [token('hello', 'X'), token('world', 'X')];
    expect(plain.annotators.local(tokens, [], {}, [])).toEqual(tokens);
    expect(plain.annotators.chunks(tokens)).toEqual(tokens);
    expect(plain.lookupKeys(tokens[0])).toEqual([]);
    expect(plain.presentation.reading.align('hello', 'həˈloʊ')).toBeNull();
  });
});
