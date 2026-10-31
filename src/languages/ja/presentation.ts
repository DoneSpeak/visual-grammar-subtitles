import type { RubySplit } from '@/languages/types';
import { toHiragana } from '@/shared/dictionary';

const KANJI = /[㐀-䶿一-鿿豈-﫿]/;
const KANA = /[ぁ-ゖァ-ヺ]/;

/** Trim okurigana shared by surface and reading so ruby only covers the kanji stem. */
export const alignRuby = (surface: string, reading: string): RubySplit | null => {
  const kana = toHiragana(reading);
  let si = surface.length - 1;
  let ri = kana.length - 1;
  while (si >= 0 && ri >= 0 && KANA.test(surface[si]) && surface[si] === kana[ri]) {
    si--;
    ri--;
  }
  let sp = 0;
  let rp = 0;
  while (sp <= si && rp <= ri && KANA.test(surface[sp]) && surface[sp] === kana[rp]) {
    sp++;
    rp++;
  }
  const base = surface.slice(sp, si + 1);
  const ruby = kana.slice(rp, ri + 1);
  if (!base || !ruby || !KANJI.test(base)) return null;
  return {
    prefix: surface.slice(0, sp),
    base,
    ruby,
    suffix: surface.slice(si + 1),
  };
};
