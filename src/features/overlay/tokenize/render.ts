import type { DictEntry } from '@/shared/dictionary';
import { underlineOffset, type ElementStyle } from '@/shared/elementStyle';
import { READING_ELEMENT } from '@/shared/studyFeatures';
import type { StudyPreset } from '@/shared/subtitleStyle';
import type { Token } from '@/shared/types';
import { tokenStyle } from './style';

const KANJI = /[㐀-䶿一-鿿豈-﫿]/;
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

export type RenderStyle = { preset: StudyPreset; elements: Record<string, ElementStyle> };

export type RenderOpts = { colorize: boolean; furigana: boolean; style: RenderStyle; dict?: DictRender };

/** Rounds only the outer corners of a chunk block, so adjacent tokens meet flush. */
const applyRadius = (el: HTMLElement, style: ElementStyle): void => {
  if (!style.radiusPx || !style.backgroundColor) return;
  const r = `${style.radiusPx}px`;
  const sides = style.radiusSides ?? 'all';
  el.style.borderStartStartRadius = sides === 'end' ? '0' : r;
  el.style.borderEndStartRadius = sides === 'end' ? '0' : r;
  el.style.borderStartEndRadius = sides === 'start' ? '0' : r;
  el.style.borderEndEndRadius = sides === 'start' ? '0' : r;
};

const applyStyle = (el: HTMLElement, style: ElementStyle | undefined): void => {
  if (!style) return;
  if (style.color) el.style.color = style.color;
  if (style.backgroundColor) el.style.backgroundColor = style.backgroundColor;
  if (style.opacity !== undefined) el.style.opacity = String(style.opacity);
  if (style.fontScale && style.fontScale !== 1) el.style.fontSize = `${style.fontScale}em`;
  applyRadius(el, style);
  const underline = style.underline;
  if (!underline) return;
  el.style.textDecoration = underline.enabled ? 'underline' : 'none';
  if (!underline.enabled) return;
  el.style.textDecorationStyle = underline.style ?? 'solid';
  if (underline.color) el.style.textDecorationColor = underline.color;
  if (underline.thicknessPx) el.style.textDecorationThickness = `${underline.thicknessPx}px`;
  el.style.textUnderlineOffset = `${underlineOffset(underline)}px`;
};

/** Ruby keeps its 0.48em base from the stylesheet; fontScale multiplies that, not the parent. */
const applyRubyStyle = (rt: HTMLElement, style: ElementStyle | undefined): void => {
  if (!style) return;
  if (style.color) rt.style.color = style.color;
  if (style.opacity !== undefined) rt.style.opacity = String(style.opacity);
  if (style.fontScale) rt.style.fontSize = `${0.48 * style.fontScale}em`;
};

export const renderTokens = (container: HTMLElement, tokens: Token[], opts: RenderOpts): void => {
  container.textContent = '';
  const { preset, elements } = opts.style;
  const reading = preset.features.includes('reading') ? elements[READING_ELEMENT] : undefined;
  // Switching the furigana element off hides the ruby entirely; its style carries nothing else.
  const readingOff = elements[READING_ELEMENT]?.enabled === false;
  tokens.forEach((token, index) => {
    if (!token.surface) return;
    if (!/\S/.test(token.surface)) {
      container.appendChild(document.createTextNode(token.surface));
      return;
    }
    const span = document.createElement('span');
    if (opts.colorize) applyStyle(span, tokenStyle(tokens, index, preset, elements));
    if (token.grammar?.length) span.title = token.grammar.join(' · ');
    const ruby =
      !readingOff && opts.furigana && token.reading ? alignRuby(token.surface, token.reading) : null;
    if (ruby) {
      const r = document.createElement('ruby');
      r.appendChild(document.createTextNode(ruby.base));
      const rt = document.createElement('rt');
      rt.textContent = ruby.ruby;
      if (opts.colorize && reading) applyRubyStyle(rt, reading);
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
  });
};

export const renderPlain = (container: HTMLElement, text: string): void => {
  container.textContent = text;
};

export const plainToken = (text: string): Token[] => [
  { surface: text, pos: '', posDetail1: '', conjType: '', conjForm: '', baseForm: '', reading: '' },
];
