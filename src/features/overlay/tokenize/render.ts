import type { DictEntry } from '@/shared/dictionary';
import type { PosColors } from '@/shared/posColors';
import type { Token } from '@/shared/types';
import { colorFor, isInflected, posGroupOf } from './colors';

const KANJI = /[㐀-䶿一-鿿豈-﫿]/;
const KANA = /[ぁ-ゖァ-ヺ]/;

const toHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Trim okurigana shared by surface and reading so ruby only covers the kanji stem. */
const alignRuby = (
  surface: string,
  reading: string,
): { prefix: string; base: string; ruby: string; suffix: string } | null => {
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

export type DictRender = {
  entries: DictEntry[];
  enabled: boolean;
  levels: Record<number, boolean>;
};

export type RenderOpts = { colorize: boolean; furigana: boolean; colors?: PosColors; dict?: DictRender };

export const renderTokens = (container: HTMLElement, tokens: Token[], opts: RenderOpts): void => {
  container.textContent = '';
  for (const token of tokens) {
    if (!token.surface) continue;
    if (!/\S/.test(token.surface)) {
      container.appendChild(document.createTextNode(token.surface));
      continue;
    }
    const group = posGroupOf(token);
    const span = document.createElement('span');
    span.style.color = colorFor(group, opts.colorize, opts.colors);
    if (opts.colorize && group === 'verb' && isInflected(token)) {
      span.style.opacity = '0.78';
      span.style.textDecoration = 'underline';
      span.style.textDecorationThickness = '1px';
      span.style.textUnderlineOffset = '3px';
    }
    const ruby = opts.furigana && token.reading ? alignRuby(token.surface, token.reading) : null;
    if (ruby) {
      const r = document.createElement('ruby');
      r.appendChild(document.createTextNode(ruby.base));
      const rt = document.createElement('rt');
      rt.textContent = ruby.ruby;
      r.appendChild(rt);
      span.append(document.createTextNode(ruby.prefix), r, document.createTextNode(ruby.suffix));
    } else {
      span.textContent = token.surface;
    }
    const dict = opts.dict;
    const entry = dict && token.dictIdx !== undefined ? dict.entries[token.dictIdx] : undefined;
    if (dict?.enabled && entry && dict.levels[entry.lv]) {
      span.classList.add('dict-word');
      span.dataset.dictIdx = String(token.dictIdx);
    }
    container.appendChild(span);
  }
};

export const renderPlain = (container: HTMLElement, text: string): void => {
  container.textContent = text;
};

export const plainToken = (text: string): Token[] => [
  { surface: text, pos: '', posDetail1: '', conjType: '', conjForm: '', baseForm: '', reading: '' },
];