import { describe, expect, it } from 'vitest';

import { EnLexicon } from '@/languages/en/lexicon';
import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

const entry = (w: string, extra: Partial<DictEntry> = {}): DictEntry => ({
  w,
  r: '',
  lv: 0,
  p: ['VERB'],
  g: [w],
  x: [],
  id: `en:${w}`,
  lang: 'en',
  ...extra,
});

const token = (surface: string, pos: Token['pos'] = 'VERB', baseForm = surface): Token => ({
  surface,
  pos,
  baseForm,
});

describe('EnLexicon', () => {
  it('matches headwords case-insensitively', () => {
    const lexicon = new EnLexicon([entry('run')]);
    expect(lexicon.find(token('Run'))).toBe(0);
    expect(lexicon.find(token('RUN'))).toBe(0);
  });

  it('folds curly apostrophes before matching', () => {
    const lexicon = new EnLexicon([entry("don't")]);
    expect(lexicon.find(token('don’t'))).toBe(0);
  });

  it('falls back to inflected forms when no headword matches', () => {
    const lexicon = new EnLexicon([entry('go', { forms: ['went', 'gone'] })]);
    expect(lexicon.find(token('went'))).toBe(0);
    expect(lexicon.find(token('gone'))).toBe(0);
  });

  it('prefers a real headword over another entry’s inflected form', () => {
    const lexicon = new EnLexicon([entry('go', { forms: ['went'] }), entry('went', { forms: [] })]);
    expect(lexicon.find(token('went'))).toBe(1);
  });

  it('keeps the first entry for a duplicated headword', () => {
    const lexicon = new EnLexicon([entry('lead', { id: 'en:lead:1' }), entry('lead', { id: 'en:lead:2' })]);
    expect(lexicon.find(token('lead'))).toBe(0);
  });

  it('does not look up function words', () => {
    const lexicon = new EnLexicon([entry('to', { p: ['ADP'] })]);
    expect(lexicon.find(token('to', 'ADP'))).toBeUndefined();
  });

  it('returns undefined for unknown words and the `*` placeholder', () => {
    const lexicon = new EnLexicon([entry('run')]);
    expect(lexicon.find(token('xyzzy'))).toBeUndefined();
    expect(lexicon.find(token('*'))).toBeUndefined();
  });
});
