/**
 * Element-level styling, shared by the options palette and the overlay renderer.
 *
 * An element is one selectable, individually-configurable slice of subtitle text. Every visual
 * property is a single value: when several elements match one fragment, the resolver picks one
 * winner per property instead of multiplying or stacking them.
 */

export type UnderlineStyle = 'solid' | 'dashed' | 'dotted' | 'wavy';

export type Underline = {
  enabled: boolean;
  style?: UnderlineStyle;
  color?: string;
  thicknessPx?: number;
  /** Gap between the text baseline and the underline, in px. */
  offsetPx?: number;
};

/** How an element conveys itself: recolour the text, or mark it with the underline only. */
export type TextColorMode = 'color' | 'underline-only';

/** Which corners a background block rounds; chunks round only their outer edges. */
export type RadiusSides = 'all' | 'start' | 'end';

export type ElementStyle = {
  /** `false` switches the element off: it contributes nothing and the text keeps the base look. */
  enabled?: boolean;
  color?: string;
  opacity?: number;
  fontScale?: number;
  underline?: Underline;
  backgroundColor?: string;
  /** Background corner radius. Inline title/subtitle blocks round only where they end. */
  radiusPx?: number;
  radiusSides?: RadiusSides;
  /** `underline-only` keeps the base text colour and draws the underline alone. */
  textColorMode?: TextColorMode;
};

/** Fallback styling for tokens no element matched. */
export type BaseStyle = {
  /** Opacity applied to tokens outside `focusElement`. 1 disables dimming. */
  dimOpacity: number;
  /** When set, only tokens matching this element stay fully opaque. */
  focusElement: string | null;
};

export const DEFAULT_BASE: BaseStyle = { dimOpacity: 1, focusElement: null };

export const UNDERLINE_STYLES: UnderlineStyle[] = ['solid', 'dashed', 'dotted', 'wavy'];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#RGB`, `#RRGGBB` and `#RRGGBBAA`, upper-cased; null for anything else. */
export const normalizeStyleColor = (value: unknown): string | null => {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return null;
  const digits = value.trim().slice(1);
  if (digits.length === 3) return `#${[...digits].map((c) => c + c).join('').toUpperCase()}`;
  return `#${digits.toUpperCase()}`;
};

export const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeUnderline = (value: unknown): Underline | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<Underline>;
  const style: UnderlineStyle =
    raw.style === 'dashed' || raw.style === 'dotted' || raw.style === 'wavy' ? raw.style : 'solid';
  const underline: Underline = { enabled: raw.enabled !== false, style };
  const color = normalizeStyleColor(raw.color);
  if (color) underline.color = color;
  if (typeof raw.thicknessPx === 'number' && Number.isFinite(raw.thicknessPx)) {
    underline.thicknessPx = clampNumber(Math.round(raw.thicknessPx), 1, 6);
  }
  if (typeof raw.offsetPx === 'number' && Number.isFinite(raw.offsetPx)) {
    underline.offsetPx = clampNumber(Math.round(raw.offsetPx), 0, 12);
  }
  return underline;
};

const normalizeRadiusSides = (value: unknown): RadiusSides | undefined =>
  value === 'start' || value === 'end' ? value : value === 'all' ? 'all' : undefined;

export const normalizeElementStyle = (value: unknown): ElementStyle => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const style: ElementStyle = {};
  // Enabled is the default, so only the off state is worth storing.
  if (raw.enabled === false) style.enabled = false;
  const color = normalizeStyleColor(raw.color);
  if (color) style.color = color;
  const backgroundColor = normalizeStyleColor(raw.backgroundColor);
  if (backgroundColor) style.backgroundColor = backgroundColor;
  if (typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)) {
    style.opacity = clampNumber(raw.opacity, 0, 1);
  }
  if (typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale)) {
    style.fontScale = clampNumber(raw.fontScale, 0.5, 2);
  }
  if (typeof raw.radiusPx === 'number' && Number.isFinite(raw.radiusPx)) {
    style.radiusPx = clampNumber(Math.round(raw.radiusPx), 0, 16);
  }
  const radiusSides = normalizeRadiusSides(raw.radiusSides);
  if (radiusSides) style.radiusSides = radiusSides;
  if (raw.textColorMode === 'underline-only') style.textColorMode = 'underline-only';
  const underline = normalizeUnderline(raw.underline);
  if (underline) style.underline = underline;
  return style;
};

export const normalizeBaseStyle = (value: unknown): BaseStyle => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BASE };
  const raw = value as Partial<BaseStyle>;
  return {
    dimOpacity:
      typeof raw.dimOpacity === 'number' && Number.isFinite(raw.dimOpacity)
        ? clampNumber(raw.dimOpacity, 0, 1)
        : DEFAULT_BASE.dimOpacity,
    focusElement: typeof raw.focusElement === 'string' ? raw.focusElement : null,
  };
};

/** `#RRGGBB`/`#RRGGBBAA` plus a 0–1 multiplier, as an `rgba()` string with the combined alpha. */
export const withAlpha = (color: string, opacity: number): string => {
  const normalized = normalizeStyleColor(color);
  if (!normalized) return color;
  const digits = normalized.slice(1);
  const channel = (offset: number) => Number.parseInt(digits.slice(offset, offset + 2), 16);
  const alpha = (digits.length === 8 ? channel(6) / 255 : 1) * clampNumber(opacity, 0, 1);
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${Number(alpha.toFixed(3))})`;
};

export const underlineOffset = (underline: Underline | undefined): number => underline?.offsetPx ?? 3;
