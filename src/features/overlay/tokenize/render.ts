import { entryAllowed } from '@/languages/bands';
import { DEFAULT_LANGUAGE, resolveLanguage } from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import { underlineOffset, type ElementStyle } from '@/shared/elementStyle';
import { READING_ELEMENT, type FeatureRegistry } from '@/shared/studyFeatures';
import type { StudyPreset } from '@/shared/subtitleStyle';
import type { Token } from '@/shared/types';
import { tokenStyle } from './style';

export type DictRender = {
  entries: DictEntry[];
  enabled: boolean;
  /** Band selection per language; the layer's own language picks the slice. */
  bands: Record<LanguageId, BandSelection>;
};

export type RenderStyle = {
  preset: StudyPreset;
  elements: Record<string, ElementStyle>;
  registry: FeatureRegistry;
  /** Which pack's reading presentation applies; absent means the default language. */
  language?: string;
};

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
  const { preset, elements, registry } = opts.style;
  const languageId = opts.style.language ?? DEFAULT_LANGUAGE;
  const pack = resolveLanguage(languageId);
  const align = pack.presentation.reading.align;
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
    if (opts.colorize) applyStyle(span, tokenStyle(registry, tokens, index, preset, elements));
    const tooltip = [...(token.grammar ?? []), ...(token.notes ?? [])];
    if (tooltip.length) span.title = tooltip.join(' · ');
    const ruby = !readingOff && opts.furigana && token.reading ? align(token.surface, token.reading) : null;
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
    // Bands are declared by the language pack: JLPT levels for Japanese, exam tags for English.
    // An entry outside every band stays lookup-able — the filter only hides words it classifies.
    if (dict?.enabled && entry && entryAllowed(pack.bands, entry, dict.bands[languageId] ?? {})) {
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
  { surface: text, pos: 'X', baseForm: '' },
];
