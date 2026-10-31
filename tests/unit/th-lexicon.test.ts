import { describe, expect, it } from 'vitest';

import { ThLexicon } from '@/languages/th/lexicon';
import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

const entry = (w: string, extra: Partial<DictEntry> = {}): DictEntry => ({
  w,
  r: '',
  lv: 0,
  p: ['VERB'],
  g: [w],
  x: [],
  id: `th:${w}`,
  z: [w],
  lang: 'th',
  ...extra,
});

const token = (surface: string, baseForm = surface): Token => ({
  surface,
  pos: 'VERB',
  baseForm,
});

describe('ThLexicon', () => {
  it('matches the written form exactly', () => {
    const lexicon = new ThLexicon([entry('กิน')]);
    expect(lexicon.find(token('กิน'))).toBe(0);
  });

  it('trims the token before matching', () => {
    const lexicon = new ThLexicon([entry('กิน')]);
    expect(lexicon.find(token(' กิน '))).toBe(0);
  });

  it('tries the base form before the surface', () => {
    const lexicon = new ThLexicon([entry('กิน'), entry('กินข้าว')]);
    expect(lexicon.find(token('กินข้าว', 'กิน'))).toBe(0);
  });

  it('keeps the first entry for a duplicated headword', () => {
    const lexicon = new ThLexicon([entry('คืน', { id: 'th:คืน:1' }), entry('คืน', { id: 'th:คืน:2' })]);
    expect(lexicon.find(token('คืน'))).toBe(0);
  });

  it('returns undefined for unknown words and exposes entries by index', () => {
    const lexicon = new ThLexicon([entry('กิน')]);
    expect(lexicon.find(token('ไม่รู้จัก'))).toBeUndefined();
    expect(lexicon.entry(0).w).toBe('กิน');
  });
});
