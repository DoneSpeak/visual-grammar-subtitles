import { FEATURE_REGISTRIES, featuresFor } from '@/languages/registry';

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
  defaultElementsFor,
  featuresUseRemote,
  isFeatureId,
  localFeatures,
  POS_ELEMENT,
  resolveFeatures,
  ROLE_ELEMENTS,
  sourcesForFeatures,
  type FeatureId,
  type FeatureRegistry,
  type FeatureSource,
} from './studyFeatures';

/**
 * Study presets: named feature combinations plus their element palette.
 *
 * A preset is not an NLP parameter — switching presets never re-runs analysis. Built-in presets
 * seed the list; editing one marks it `customized` so the UI can offer a reset, and users can add
 * their own.
 *
 * v4 keys presets and the active preset by language, because two subtitle layers can show
 * different languages at once and each needs its own mode list. The box style stays global.
 */

export const SUBTITLE_STYLE_KEY = 'ui:subtitleStyle';
/** Pre-v3 single palette, migrated into `pos-basic` on first load. */
export const LEGACY_POS_COLORS_KEY = 'ui:posColors';
/** One-shot copy of the v3 document, written before the first v4 save. */
export const SUBTITLE_STYLE_V3_BACKUP_KEY = 'ui:subtitleStyle.v3backup';

export type { BaseStyle, ElementStyle, Underline, UnderlineStyle } from './elementStyle';
export { normalizeElementStyle } from './elementStyle';
export { POS_ELEMENT, ROLE_ELEMENTS, type FeatureId } from './studyFeatures';

export type ElementId = string;
export type LanguageId = string;

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
  version: 4;
  /** Per language: the mode currently in effect for that language's layer. */
  activePresetId: Record<LanguageId, string>;
  /** Global, not per preset: one box style for every mode. */
  box: BoxStyle;
  presets: Record<LanguageId, Record<string, StudyPreset>>;
};

export const isBuiltInPresetId = (registry: FeatureRegistry, value: unknown): value is string =>
  typeof value === 'string' && registry.builtIns.some((seed) => seed.id === value);

export const isCustomPresetId = (value: string): boolean => value.startsWith('custom:');

/** Dimming everything but the focus element is what makes "show only nouns" visible. */
export const baseForFeatures = (features: FeatureId[]): BaseStyle =>
  features.includes('nouns')
    ? { dimOpacity: 0.35, focusElement: POS_ELEMENT.noun }
    : { ...DEFAULT_BASE };

export const defaultPreset = (registry: FeatureRegistry, id: string): StudyPreset => {
  const seed = registry.builtIns.find((candidate) => candidate.id === id);
  const features = resolveFeatures(registry, seed?.features ?? []);
  return { id: seed?.id ?? registry.defaultPresetId, features, base: baseForFeatures(features), elements: {} };
};

export const defaultPresets = (registry: FeatureRegistry): Record<string, StudyPreset> =>
  Object.fromEntries(registry.builtIns.map((seed) => [seed.id, defaultPreset(registry, seed.id)]));

export const defaultSubtitleStyle = (): SubtitleStyle => {
  const presets: SubtitleStyle['presets'] = {};
  const activePresetId: SubtitleStyle['activePresetId'] = {};
  for (const [language, registry] of Object.entries(FEATURE_REGISTRIES)) {
    presets[language] = defaultPresets(registry);
    activePresetId[language] = registry.defaultPresetId;
  }
  return { version: 4, activePresetId, box: { ...DEFAULT_BOX }, presets };
};

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

const normalizeFeatures = (registry: FeatureRegistry, value: unknown): FeatureId[] =>
  Array.isArray(value) ? resolveFeatures(registry, value.filter((id) => isFeatureId(registry, id))) : [];

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
  registry: FeatureRegistry,
  value: unknown,
  fallbackId: string,
  fallbackFeatures: FeatureId[] = [],
): StudyPreset | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  const features =
    raw.features === undefined
      ? resolveFeatures(registry, fallbackFeatures)
      : normalizeFeatures(registry, raw.features);
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

/**
 * Normalizes one language's preset map: built-ins are always present with their seed features
 * when absent, user presets are kept, and unknown feature ids are dropped.
 */
const normalizePresetMap = (
  registry: FeatureRegistry,
  saved: unknown,
  legacyElements?: Record<string, unknown>,
): Record<string, StudyPreset> => {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const presets: Record<string, StudyPreset> = {};
  for (const seed of registry.builtIns) {
    presets[seed.id] =
      normalizePreset(registry, raw[seed.id], seed.id, seed.features) ?? defaultPreset(registry, seed.id);
  }
  for (const [id, preset] of Object.entries(raw)) {
    if (presets[id]) continue;
    // Anything that is neither a current built-in nor a `custom:` preset was a built-in of an
    // older pack (English `phrase-focus`). Keeping it would resurrect it as a nameless mode the
    // user cannot delete, so drop it; `activeIdFor` falls back to the default.
    if (!isCustomPresetId(id)) continue;
    const normalized = normalizePreset(registry, preset, id);
    if (normalized) presets[id] = normalized;
  }
  if (legacyElements) {
    const elements = normalizeElements(legacyElements);
    if (Object.keys(elements).length) {
      const target = presets['pos-basic'] ?? defaultPreset(registry, registry.builtIns[0]?.id ?? 'plain');
      presets[target.id] = { ...target, elements, customized: true };
    }
  }
  return presets;
};

const activeIdFor = (
  registry: FeatureRegistry,
  preselected: unknown,
  presets: Record<string, StudyPreset>,
): string => {
  const id = typeof preselected === 'string' ? preselected : '';
  return presets[id] ? id : registry.defaultPresetId;
};

/** v2 kept one profile per built-in mode; its element overrides carry over verbatim. */
const migrateV2Presets = (registry: FeatureRegistry, raw: Record<string, unknown>): Record<string, StudyPreset> => {
  const profiles = (raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {}) as Record<
    string,
    unknown
  >;
  const presets: Record<string, StudyPreset> = {};
  for (const seed of registry.builtIns) {
    const profile = profiles[seed.id] as { elements?: Record<string, unknown> } | undefined;
    const elements = normalizeElements(profile?.elements);
    // `chunk.bunsetsu:all` was the single chunk element before positions existed.
    const legacyChunk = elements['chunk.bunsetsu:all'];
    if (legacyChunk) {
      delete elements['chunk.bunsetsu:all'];
      for (const position of ['first', 'middle', 'last', 'only']) {
        elements[`chunk.bunsetsu:${position}`] = { ...legacyChunk };
      }
    }
    const preset = defaultPreset(registry, seed.id);
    const customized = Object.keys(elements).length > 0;
    presets[seed.id] = { ...preset, elements, ...(customized ? { customized: true } : {}) };
  }
  return presets;
};

/**
 * v3 stored one preset map for Japanese only. It moves into the `ja` bucket untouched; every
 * other language is seeded with its defaults. The caller backs up the v3 document first.
 */
const migrateV3 = (raw: Record<string, unknown>): SubtitleStyle => {
  const presets: SubtitleStyle['presets'] = {};
  const activePresetId: SubtitleStyle['activePresetId'] = {};
  const savedJa = raw.presets;
  for (const [language, registry] of Object.entries(FEATURE_REGISTRIES)) {
    presets[language] = normalizePresetMap(registry, language === 'ja' ? savedJa : undefined);
    activePresetId[language] = activeIdFor(
      registry,
      language === 'ja' ? raw.activePresetId : undefined,
      presets[language],
    );
  }
  return { version: 4, activePresetId, box: normalizeBoxStyle(raw.box), presets };
};

export const normalizeSubtitleStyle = (value: unknown): SubtitleStyle => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  if (raw.version === 2 || (raw.version !== 3 && raw.version !== 4)) {
    const presets: SubtitleStyle['presets'] = {};
    const activePresetId: SubtitleStyle['activePresetId'] = {};
    for (const [language, registry] of Object.entries(FEATURE_REGISTRIES)) {
      presets[language] = migrateV2Presets(registry, language === 'ja' ? raw : {});
      activePresetId[language] = activeIdFor(
        registry,
        language === 'ja' ? raw.activeProfileId : undefined,
        presets[language],
      );
    }
    return { version: 4, activePresetId, box: { ...DEFAULT_BOX }, presets };
  }

  if (raw.version === 3) return migrateV3(raw);

  const saved = (raw.presets && typeof raw.presets === 'object' ? raw.presets : {}) as Record<
    string,
    unknown
  >;
  const savedActive = (raw.activePresetId && typeof raw.activePresetId === 'object'
    ? raw.activePresetId
    : {}) as Record<string, unknown>;
  const presets: SubtitleStyle['presets'] = {};
  const activePresetId: SubtitleStyle['activePresetId'] = {};
  for (const [language, registry] of Object.entries(FEATURE_REGISTRIES)) {
    presets[language] = normalizePresetMap(registry, saved[language]);
    activePresetId[language] = activeIdFor(registry, savedActive[language], presets[language]);
  }
  return { version: 4, activePresetId, box: normalizeBoxStyle(raw.box), presets };
};

export const activePreset = (style: SubtitleStyle, language: LanguageId): StudyPreset => {
  const registry = featuresFor(language);
  const bucket = style.presets[language];
  const id = style.activePresetId[language];
  return bucket?.[id] ?? Object.values(bucket ?? {})[0] ?? defaultPreset(registry, registry.defaultPresetId);
};

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
export const presetElements = (
  registry: FeatureRegistry,
  preset: StudyPreset,
): Record<ElementId, ElementStyle> => {
  const elements = defaultElementsFor(registry, preset.features);
  for (const [id, style] of Object.entries(preset.elements)) {
    elements[id] = { ...(elements[id] ?? {}), ...style };
  }
  return elements;
};

/** True when any feature can use the grammar service, even if it also works locally. */
export const presetUsesRemote = (registry: FeatureRegistry, preset: StudyPreset): boolean =>
  featuresUseRemote(registry, preset.features);

/** Where a preset's data comes from; drives the mode card's capability badge. */
export const presetSources = (registry: FeatureRegistry, preset: StudyPreset): FeatureSource[] =>
  sourcesForFeatures(registry, preset.features);

/** Drops features only the grammar service can produce, keeping everything else. */
export const localOnlyPreset = (registry: FeatureRegistry, preset: StudyPreset): StudyPreset => {
  if (!presetUsesRemote(registry, preset)) return preset;
  const features = localFeatures(registry, resolveFeatures(registry, preset.features));
  return { ...preset, features, base: baseForFeatures(features) };
};

export const presetLabelKey = (registry: FeatureRegistry, preset: StudyPreset): MessageKey | null =>
  registry.builtIns.find((seed) => seed.id === preset.id)?.labelKey ?? null;

export const presetDetailKey = (registry: FeatureRegistry, preset: StudyPreset): MessageKey | null =>
  registry.builtIns.find((seed) => seed.id === preset.id)?.detailKey ?? null;

/** i18n label for built-ins, the stored name for user presets. */
export const presetDisplayName = (
  registry: FeatureRegistry,
  preset: StudyPreset,
  label: (key: MessageKey) => string,
): string => {
  const key = presetLabelKey(registry, preset);
  return key ? label(key) : (preset.name ?? preset.id);
};

export const presetOrder = (
  registry: FeatureRegistry,
  style: SubtitleStyle,
  language: LanguageId,
): string[] => {
  const presets = style.presets[language];
  // A language can be selectable before its bucket has been written (first run after adding a
  // pack). Show the registry's own built-ins rather than an empty mode list.
  if (!presets) return registry.builtIns.map((seed) => seed.id);
  const builtIn = registry.builtIns.map((seed) => seed.id).filter((id) => presets[id]);
  const custom = Object.keys(presets).filter((id) => !isBuiltInPresetId(registry, id));
  return [...builtIn, ...custom];
};

export const isSubtitleStyleKey = (key: string): boolean => key === SUBTITLE_STYLE_KEY;

export const loadSubtitleStyle = async (): Promise<SubtitleStyle> => {
  const raw = await chrome.storage.local.get([
    SUBTITLE_STYLE_KEY,
    LEGACY_POS_COLORS_KEY,
    SUBTITLE_STYLE_V3_BACKUP_KEY,
  ]);
  const stored = raw[SUBTITLE_STYLE_KEY];
  if (stored) {
    const version = (stored as { version?: unknown }).version;
    // Keep one copy of the pre-v4 document before the first v4 save overwrites it.
    if ((version === 2 || version === 3) && !raw[SUBTITLE_STYLE_V3_BACKUP_KEY]) {
      await chrome.storage.local.set({ [SUBTITLE_STYLE_V3_BACKUP_KEY]: stored });
    }
    return normalizeSubtitleStyle(stored);
  }
  const base = defaultSubtitleStyle();
  // Migrate the pre-v3 palette verbatim; do not reset colours a user already chose.
  const legacy = raw[LEGACY_POS_COLORS_KEY] as Record<string, unknown> | undefined;
  if (legacy) {
    const preset = base.presets.ja?.['pos-basic'];
    if (preset) {
      for (const group of POS_GROUPS) {
        const color = normalizePosColor(legacy[group]);
        if (color) preset.elements[POS_ELEMENT[group]] = { color };
      }
      preset.customized = true;
    }
  }
  return base;
};

export const saveSubtitleStyle = async (style: SubtitleStyle): Promise<void> => {
  await chrome.storage.local.set({ [SUBTITLE_STYLE_KEY]: normalizeSubtitleStyle(style) });
};
