import {
  clampNumber,
  DEFAULT_BASE,
  normalizeBaseStyle,
  normalizeElementStyle,
  normalizeStyleColor,
  type BaseStyle,
  type ElementStyle,
} from './elementStyle';
import type { MessageKey } from './i18n';
import { normalizePosColor, POS_GROUPS } from './posColors';
import {
  CHUNK_ELEMENTS,
  defaultElementsFor,
  featuresRequireRemote,
  isFeatureId,
  localFeatures,
  POS_ELEMENT,
  resolveFeatures,
  ROLE_ELEMENTS,
  type FeatureId,
} from './studyFeatures';

/**
 * Study presets: named feature combinations plus their element palette.
 *
 * A preset is not an NLP parameter — switching presets never re-runs analysis. Built-in presets
 * seed the list; editing one marks it `customized` so the UI can offer a reset, and users can add
 * their own.
 */

export const SUBTITLE_STYLE_KEY = 'ui:subtitleStyle';
/** Pre-v3 single palette, migrated into `pos-basic` on first load. */
export const LEGACY_POS_COLORS_KEY = 'ui:posColors';

export type { BaseStyle, ElementStyle, Underline, UnderlineStyle } from './elementStyle';
export { normalizeElementStyle } from './elementStyle';
export { POS_ELEMENT, ROLE_ELEMENTS, type FeatureId } from './studyFeatures';

export type ElementId = string;

/** Built-in presets are labelled through i18n; user presets carry their own name. */
export const BUILT_IN_PRESET_LABEL_KEY: Record<BuiltInPresetId, MessageKey> = {
  plain: 'modes.mode.plain',
  'pos-basic': 'modes.mode.pos-basic',
  'syntax-focus': 'modes.mode.syntax-focus',
  'chunk-focus': 'modes.mode.chunk-focus',
  'expression-focus': 'modes.mode.expression-focus',
  'reading-assist': 'modes.mode.reading-assist',
};

export const BUILT_IN_PRESET_DETAIL_KEY: Record<BuiltInPresetId, MessageKey> = {
  plain: 'modes.modeDetail.plain',
  'pos-basic': 'modes.modeDetail.pos-basic',
  'syntax-focus': 'modes.modeDetail.syntax-focus',
  'chunk-focus': 'modes.modeDetail.chunk-focus',
  'expression-focus': 'modes.modeDetail.expression-focus',
  'reading-assist': 'modes.modeDetail.reading-assist',
};

export type BuiltInPresetId =
  | 'plain'
  | 'pos-basic'
  | 'syntax-focus'
  | 'chunk-focus'
  | 'expression-focus'
  | 'reading-assist';

export const BUILT_IN_PRESET_IDS: BuiltInPresetId[] = [
  'plain',
  'pos-basic',
  'syntax-focus',
  'chunk-focus',
  'expression-focus',
  'reading-assist',
];

/**
 * `chunk-focus` uses the local rule-based grouping: it works with no grammar service, and the
 * remote GiNZA bunsetsu stays available as a separate feature.
 */
export const BUILT_IN_PRESET_FEATURES: Record<BuiltInPresetId, FeatureId[]> = {
  plain: [],
  'pos-basic': ['pos'],
  'syntax-focus': ['syntax'],
  'chunk-focus': ['chunk-rule'],
  'expression-focus': ['expression'],
  'reading-assist': ['reading'],
};

export type StudyPreset = {
  /** Built-in id, or `custom:<uuid>` for user-created presets. */
  id: string;
  /** Only set for user-created or renamed presets; built-ins use i18n labels. */
  name?: string;
  features: FeatureId[];
  base: BaseStyle;
  /** Per-mode box overrides; each absent field falls back to the global `SubtitleStyle.box`. */
  box?: BoxStyle;
  /** User overrides only; defaults come from `defaultElementsFor(features)`. */
  elements: Record<ElementId, ElementStyle>;
  /** A built-in preset the user has edited. */
  customized?: boolean;
};

/** The box behind every subtitle, shared by all presets: colour and its own opacity. */
export type BoxStyle = {
  /** Absent means no box. */
  backgroundColor?: string;
  backgroundOpacity: number;
};

export const DEFAULT_BOX: BoxStyle = { backgroundOpacity: 1 };

export const normalizeBoxStyle = (value: unknown): BoxStyle => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const box: BoxStyle = {
    backgroundOpacity:
      typeof raw.backgroundOpacity === 'number' && Number.isFinite(raw.backgroundOpacity)
        ? clampNumber(raw.backgroundOpacity, 0, 1)
        : DEFAULT_BOX.backgroundOpacity,
  };
  const backgroundColor = normalizeStyleColor(raw.backgroundColor);
  if (backgroundColor) box.backgroundColor = backgroundColor;
  return box;
};

export type SubtitleStyle = {
  version: 3;
  activePresetId: string;
  /** Global, not per preset: one box style for every mode. */
  box: BoxStyle;
  presets: Record<string, StudyPreset>;
};

export const isBuiltInPresetId = (value: unknown): value is BuiltInPresetId =>
  typeof value === 'string' && (BUILT_IN_PRESET_IDS as string[]).includes(value);

export const isCustomPresetId = (value: string): boolean => value.startsWith('custom:');

/** Dimming everything but the focus element is what makes "show only nouns" visible. */
export const baseForFeatures = (features: FeatureId[]): BaseStyle =>
  features.includes('nouns')
    ? { dimOpacity: 0.35, focusElement: POS_ELEMENT.noun }
    : { ...DEFAULT_BASE };

export const defaultPreset = (id: BuiltInPresetId): StudyPreset => {
  const features = resolveFeatures(BUILT_IN_PRESET_FEATURES[id]);
  return { id, features, base: baseForFeatures(features), elements: {} };
};

export const defaultSubtitleStyle = (): SubtitleStyle => ({
  version: 3,
  activePresetId: 'pos-basic',
  box: { ...DEFAULT_BOX },
  presets: Object.fromEntries(BUILT_IN_PRESET_IDS.map((id) => [id, defaultPreset(id)])),
});

/** Underline is the only nested object in an element style; cloning it keeps copies independent. */
const cloneElementStyle = (style: ElementStyle): ElementStyle =>
  style.underline ? { ...style, underline: { ...style.underline } } : { ...style };

/**
 * A duplicate starts identical to its source: same features, same base, same overrides. It is
 * always a user preset, so copying a built-in lets the user edit without marking it `customized`.
 */
export const copyPreset = (source: StudyPreset, id: string, name?: string): StudyPreset => {
  const trimmed = name?.trim().slice(0, 40);
  return {
    id,
    ...(trimmed ? { name: trimmed } : {}),
    features: [...source.features],
    base: { ...source.base },
    ...(source.box ? { box: { ...source.box } } : {}),
    elements: Object.fromEntries(
      Object.entries(source.elements).map(([elementId, style]) => [elementId, cloneElementStyle(style)]),
    ),
  };
};

const normalizeFeatures = (value: unknown): FeatureId[] =>
  Array.isArray(value) ? resolveFeatures(value.filter(isFeatureId)) : [];

const normalizeElements = (value: unknown): Record<ElementId, ElementStyle> => {
  if (!value || typeof value !== 'object') return {};
  const elements: Record<ElementId, ElementStyle> = {};
  for (const [id, style] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeElementStyle(style);
    if (Object.keys(normalized).length) elements[id] = normalized;
  }
  return elements;
};

const normalizePreset = (
  value: unknown,
  fallbackId: string,
  fallbackFeatures: FeatureId[] = [],
): StudyPreset | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  const features =
    raw.features === undefined ? resolveFeatures(fallbackFeatures) : normalizeFeatures(raw.features);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : undefined;
  return {
    id,
    ...(name ? { name } : {}),
    features,
    base: raw.base ? normalizeBaseStyle(raw.base) : baseForFeatures(features),
    ...(raw.box ? { box: normalizeBoxStyle(raw.box) } : {}),
    elements: normalizeElements(raw.elements),
    ...(raw.customized === true ? { customized: true } : {}),
  };
};

/** v2 kept one profile per built-in mode; its element overrides carry over verbatim. */
const migrateV2 = (raw: Record<string, unknown>): SubtitleStyle => {
  const profiles = (raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {}) as Record<
    string,
    unknown
  >;
  const presets: Record<string, StudyPreset> = {};
  for (const id of BUILT_IN_PRESET_IDS) {
    const profile = profiles[id] as { elements?: Record<string, unknown> } | undefined;
    const elements = normalizeElements(profile?.elements);
    // `chunk.bunsetsu:all` was the single chunk element before positions existed.
    const legacyChunk = elements['chunk.bunsetsu:all'];
    if (legacyChunk) {
      delete elements['chunk.bunsetsu:all'];
      for (const chunkId of CHUNK_ELEMENTS) elements[chunkId] = { ...legacyChunk };
    }
    const preset = defaultPreset(id);
    const customized = Object.keys(elements).length > 0;
    presets[id] = { ...preset, elements, ...(customized ? { customized: true } : {}) };
  }
  const active = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : '';
  return {
    version: 3,
    activePresetId: presets[active] ? active : 'pos-basic',
    box: { ...DEFAULT_BOX },
    presets,
  };
};

export const normalizeSubtitleStyle = (value: unknown): SubtitleStyle => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (raw.version !== 3) return migrateV2(raw);

  const saved = (raw.presets && typeof raw.presets === 'object' ? raw.presets : {}) as Record<
    string,
    unknown
  >;
  const presets: Record<string, StudyPreset> = {};
  for (const id of BUILT_IN_PRESET_IDS) {
    presets[id] = normalizePreset(saved[id], id, BUILT_IN_PRESET_FEATURES[id]) ?? defaultPreset(id);
  }
  for (const [id, preset] of Object.entries(saved)) {
    if (presets[id]) continue;
    const normalized = normalizePreset(preset, id);
    if (normalized) presets[id] = normalized;
  }
  const active = typeof raw.activePresetId === 'string' ? raw.activePresetId : '';
  return {
    version: 3,
    activePresetId: presets[active] ? active : 'pos-basic',
    box: normalizeBoxStyle(raw.box),
    presets,
  };
};

export const activePreset = (style: SubtitleStyle): StudyPreset =>
  style.presets[style.activePresetId] ?? defaultPreset('pos-basic');

/**
 * Fields resolve one by one, so a mode that only owns an opacity still shows the global colour.
 * A mode turns its box off by setting an explicitly transparent colour (`#00000000`); an empty
 * override never silently hides the global box.
 */
export const effectiveBox = (style: SubtitleStyle, preset: StudyPreset): BoxStyle => {
  const own = preset.box;
  const backgroundColor = own?.backgroundColor ?? style.box.backgroundColor;
  return {
    ...(backgroundColor ? { backgroundColor } : {}),
    backgroundOpacity: own?.backgroundOpacity ?? style.box.backgroundOpacity,
  };
};

/** Defaults merged with the preset's overrides — what the renderer actually uses. */
export const presetElements = (preset: StudyPreset): Record<ElementId, ElementStyle> => {
  const elements = defaultElementsFor(preset.features);
  for (const [id, style] of Object.entries(preset.elements)) {
    elements[id] = { ...(elements[id] ?? {}), ...style };
  }
  return elements;
};

export const presetRequiresRemote = (preset: StudyPreset): boolean =>
  featuresRequireRemote(preset.features);

/** Drops features that need the grammar service, keeping everything that works locally. */
export const localOnlyPreset = (preset: StudyPreset): StudyPreset => {
  if (!presetRequiresRemote(preset)) return preset;
  const features = localFeatures(resolveFeatures(preset.features));
  return { ...preset, features, base: baseForFeatures(features) };
};

export const presetLabelKey = (preset: StudyPreset): MessageKey | null =>
  isBuiltInPresetId(preset.id) ? BUILT_IN_PRESET_LABEL_KEY[preset.id] : null;

/** i18n label for built-ins, the stored name for user presets. */
export const presetDisplayName = (preset: StudyPreset, label: (key: MessageKey) => string): string => {
  const key = presetLabelKey(preset);
  return key ? label(key) : (preset.name ?? preset.id);
};

export const presetOrder = (style: SubtitleStyle): string[] => {
  const builtIn = BUILT_IN_PRESET_IDS.filter((id) => style.presets[id]);
  const custom = Object.keys(style.presets).filter((id) => !isBuiltInPresetId(id));
  return [...builtIn, ...custom];
};

export const isSubtitleStyleKey = (key: string): boolean => key === SUBTITLE_STYLE_KEY;

export const loadSubtitleStyle = async (): Promise<SubtitleStyle> => {
  const raw = await chrome.storage.local.get([SUBTITLE_STYLE_KEY, LEGACY_POS_COLORS_KEY]);
  const stored = raw[SUBTITLE_STYLE_KEY];
  if (stored) return normalizeSubtitleStyle(stored);
  const base = defaultSubtitleStyle();
  // Migrate the pre-v3 palette verbatim; do not reset colours a user already chose.
  const legacy = raw[LEGACY_POS_COLORS_KEY] as Record<string, unknown> | undefined;
  if (legacy) {
    const preset = base.presets['pos-basic'];
    for (const group of POS_GROUPS) {
      const color = normalizePosColor(legacy[group]);
      if (color) preset.elements[POS_ELEMENT[group]] = { color };
    }
    preset.customized = true;
  }
  return base;
};

export const saveSubtitleStyle = async (style: SubtitleStyle): Promise<void> => {
  await chrome.storage.local.set({ [SUBTITLE_STYLE_KEY]: normalizeSubtitleStyle(style) });
};
