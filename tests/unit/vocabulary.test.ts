import { describe, expect, it } from 'vitest';
import type { DictEntry } from '@/shared/dictionary';
import { hydrateVocabulary, vocabularyGallery } from '@/shared/vocabulary';

const entry = (overrides: Partial<DictEntry> = {}): DictEntry => ({
  w: '林檎',
  r: 'りんご',
  lv: 5,
  p: ['名'],
  g: ['apple'],
  x: [],
  id: '1',
  ...overrides,
});

describe('hydrateVocabulary', () => {
  it('attaches the image and Chinese gloss', () => {
    const [row] = hydrateVocabulary([entry()], { v: 1, images: { '1': { i: '1F34E', z: '苹果' } } });
    expect(row.img).toBe('1F34E');
    expect(row.z).toEqual(['苹果']);
  });

  it('leaves entries without a mapped image untouched', () => {
    const source = entry({ id: '2' });
    const [row] = hydrateVocabulary([source], { v: 1, images: { '1': { i: '1F34E' } } });
    expect(row).toBe(source);
    expect(row.img).toBeUndefined();
  });

  it('returns the entries unchanged when the vocabulary file is absent', () => {
    const entries = [entry()];
    expect(hydrateVocabulary(entries, null)).toBe(entries);
  });

  it('keeps an existing Chinese gloss when the image has none', () => {
    const [row] = hydrateVocabulary([entry({ z: ['苹果'] })], { v: 1, images: { '1': { i: '1F34E' } } });
    expect(row.z).toEqual(['苹果']);
  });
});

describe('vocabularyGallery', () => {
  it('flattens the index, easiest level first, and skips image-only records', () => {
    const gallery = vocabularyGallery({
      v: 1,
      images: {
        1: { i: '1F34E', z: '苹果', w: '林檎', r: 'りんご', lv: 5 },
        2: { i: '1F525', w: '火', r: 'ひ', lv: 4 },
        3: { i: '1F600' },
      },
    });
    expect(gallery.map((item) => item.word)).toEqual(['林檎', '火']);
    expect(gallery[0]).toMatchObject({
      id: '1',
      img: '1F34E',
      reading: 'りんご',
      gloss: '苹果',
      level: 5,
    });
  });

  it('carries the POS and language so the gallery can group and filter', () => {
    const [item] = vocabularyGallery({
      v: 1,
      language: 'ja',
      images: { 1: { i: '1F34E', w: '林檎', r: 'りんご', lv: 5, p: 'NOUN' } },
    });
    expect(item.pos).toBe('NOUN');
    expect(item.language).toBe('ja');
  });

  it('sorts a translated index by word when there is no reading or level', () => {
    const gallery = vocabularyGallery({
      v: 1,
      language: 'th',
      images: {
        'animals.dog': { i: '1F415', w: 'สุนัข', p: 'NOUN' },
        'animals.cat': { i: '1F408', w: 'แมว', p: 'NOUN' },
      },
    });
    expect(gallery.map((item) => item.word)).toEqual(['แมว', 'สุนัข']);
    expect(gallery[0]).toMatchObject({ language: 'th', reading: '', pos: 'NOUN' });
  });

  it('returns an empty list when the vocabulary file is absent', () => {
    expect(vocabularyGallery(null)).toEqual([]);
  });
});
