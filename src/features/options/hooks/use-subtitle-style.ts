import * as React from 'react';

import { DEFAULT_LANGUAGE, featuresFor } from '@/languages/registry';
import type { ElementStyle } from '@/shared/elementStyle';
import {
  resolveFeatures,
  toggleFeatureIn,
  type FeatureId,
  type FeatureRegistry,
} from '@/shared/studyFeatures';
import {
  baseForFeatures,
  copyPreset,
  defaultPreset,
  defaultSubtitleStyle,
  isBuiltInPresetId,
  loadSubtitleStyle,
  normalizeBoxStyle,
  normalizeElementStyle,
  saveSubtitleStyle,
  type BoxStyle,
  type ElementId,
  type StudyPreset,
  type SubtitleStyle,
} from '@/shared/subtitleStyle';

export type SubtitleStyleController = {
  style: SubtitleStyle;
  setPreset: (id: string) => void;
  createPreset: (name?: string) => string;
  duplicatePreset: (sourceId: string, name?: string) => string | null;
  deletePreset: (id: string) => void;
  resetPreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  toggleFeature: (presetId: string, featureId: FeatureId) => void;
  updateElement: (presetId: string, id: ElementId, patch: Partial<ElementStyle>) => void;
  resetElement: (presetId: string, id: ElementId) => void;
  /** Global box, used by every mode that does not override it. */
  updateBox: (patch: Partial<BoxStyle>) => void;
  /** Turns the mode's own box on or off; off falls back to the global box. */
  setPresetBoxEnabled: (presetId: string, enabled: boolean, seed?: BoxStyle) => void;
  updatePresetBox: (presetId: string, patch: Partial<BoxStyle>) => void;
};

/** Range inputs fire continuously; persist shortly after the user stops moving. */
const SAVE_DELAY_MS = 150;

/**
 * Editing a built-in preset flags it as customized so the UI can offer a reset. The flag is
 * recomputed from the actual state, so undoing every edit clears it again.
 */
const withCustomization = (registry: FeatureRegistry, preset: StudyPreset): StudyPreset => {
  if (!isBuiltInPresetId(registry, preset.id)) return preset;
  const defaults = defaultPreset(registry, preset.id);
  const features = resolveFeatures(registry, preset.features);
  const edited =
    features.join() !== defaults.features.join() ||
    Object.keys(preset.elements).length > 0 ||
    preset.box !== undefined;
  if (!edited) {
    const { customized: _ignored, ...rest } = preset;
    return rest;
  }
  return { ...preset, features, customized: true };
};

const updatePreset = (
  style: SubtitleStyle,
  language: string,
  id: string,
  update: (preset: StudyPreset) => StudyPreset,
): SubtitleStyle => {
  const bucket = style.presets[language] ?? {};
  const preset = bucket[id];
  if (!preset) return style;
  return {
    ...style,
    presets: { ...style.presets, [language]: { ...bucket, [id]: update(preset) } },
  };
};

/**
 * Edits the preset list of one language. Two layers can show different languages, so every
 * mode list and its active id live in that language's bucket.
 */
export const useSubtitleStyle = (language: string = DEFAULT_LANGUAGE): SubtitleStyleController => {
  const [style, setStyle] = React.useState<SubtitleStyle>(() => defaultSubtitleStyle());
  const styleRef = React.useRef(style);
  const timer = React.useRef<number | undefined>(undefined);
  const registry = React.useMemo(() => featuresFor(language), [language]);

  React.useEffect(() => {
    void loadSubtitleStyle().then((loaded) => {
      styleRef.current = loaded;
      setStyle(loaded);
    });
    return () => window.clearTimeout(timer.current);
  }, []);

  const commit = React.useCallback((next: SubtitleStyle) => {
    styleRef.current = next;
    setStyle(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveSubtitleStyle(next), SAVE_DELAY_MS);
  }, []);

  /** Applies an edit to one preset and marks a built-in as customized when it now differs. */
  const editPreset = React.useCallback(
    (id: string, update: (preset: StudyPreset) => StudyPreset) => {
      commit(
        updatePreset(styleRef.current, language, id, (preset) =>
          withCustomization(registry, update(preset)),
        ),
      );
    },
    [commit, language, registry],
  );

  const setPreset = React.useCallback(
    (id: string) => {
      const current = styleRef.current;
      commit({ ...current, activePresetId: { ...current.activePresetId, [language]: id } });
    },
    [commit, language],
  );

  const createPreset = React.useCallback(
    (name?: string) => {
      const id = `custom:${crypto.randomUUID()}`;
      const features = resolveFeatures(
        registry,
        registry.builtIns.find((seed) => seed.features.length > 0)?.features ?? [],
      );
      const trimmed = name?.trim().slice(0, 40);
      const preset: StudyPreset = {
        id,
        ...(trimmed ? { name: trimmed } : {}),
        features,
        base: baseForFeatures(features),
        elements: {},
      };
      const current = styleRef.current;
      commit({
        ...current,
        activePresetId: { ...current.activePresetId, [language]: id },
        presets: { ...current.presets, [language]: { ...current.presets[language], [id]: preset } },
      });
      return id;
    },
    [commit, language, registry],
  );

  const duplicatePreset = React.useCallback(
    (sourceId: string, name?: string) => {
      const current = styleRef.current;
      const bucket = current.presets[language] ?? {};
      const source = bucket[sourceId];
      if (!source) return null;
      const id = `custom:${crypto.randomUUID()}`;
      commit({
        ...current,
        activePresetId: { ...current.activePresetId, [language]: id },
        presets: { ...current.presets, [language]: { ...bucket, [id]: copyPreset(source, id, name) } },
      });
      return id;
    },
    [commit, language],
  );

  const deletePreset = React.useCallback(
    (id: string) => {
      const current = styleRef.current;
      const bucket = current.presets[language] ?? {};
      if (isBuiltInPresetId(registry, id) || !bucket[id]) return;
      const { [id]: _removed, ...presets } = bucket;
      const active = current.activePresetId[language];
      commit({
        ...current,
        presets: { ...current.presets, [language]: presets },
        activePresetId: {
          ...current.activePresetId,
          [language]: active === id ? registry.defaultPresetId : active,
        },
      });
    },
    [commit, language, registry],
  );

  const resetPreset = React.useCallback(
    (id: string) => {
      commit(
        updatePreset(styleRef.current, language, id, (preset) => {
          if (isBuiltInPresetId(registry, id)) return defaultPreset(registry, id);
          const features = resolveFeatures(registry, preset.features);
          const { box: _box, ...rest } = preset;
          return { ...rest, features, base: baseForFeatures(features), elements: {} };
        }),
      );
    },
    [commit, language, registry],
  );

  const renamePreset = React.useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 40);
      editPreset(id, (preset) => {
        const { name: _old, ...rest } = preset;
        return trimmed ? { ...rest, name: trimmed } : rest;
      });
    },
    [editPreset],
  );

  const toggleFeature = React.useCallback(
    (presetId: string, featureId: FeatureId) => {
      editPreset(presetId, (preset) => {
        const features = toggleFeatureIn(registry, preset.features, featureId);
        return { ...preset, features, base: baseForFeatures(features) };
      });
    },
    [editPreset, registry],
  );

  const updateElement = React.useCallback(
    (presetId: string, id: ElementId, patch: Partial<ElementStyle>) => {
      editPreset(presetId, (preset) => {
        // Normalizing drops values that mean "default", so undoing an edit clears the override.
        const merged = normalizeElementStyle({ ...preset.elements[id], ...patch });
        const elements = { ...preset.elements };
        if (Object.keys(merged).length) elements[id] = merged;
        else delete elements[id];
        return { ...preset, elements };
      });
    },
    [editPreset],
  );

  const resetElement = React.useCallback(
    (presetId: string, id: ElementId) => {
      editPreset(presetId, (preset) => {
        const elements = { ...preset.elements };
        delete elements[id];
        return { ...preset, elements };
      });
    },
    [editPreset],
  );

  /** An empty colour clears the box, so normalizing is how "no box" gets stored. */
  const updateBox = React.useCallback(
    (patch: Partial<BoxStyle>) => {
      const current = styleRef.current;
      commit({ ...current, box: normalizeBoxStyle({ ...current.box, ...patch }) });
    },
    [commit],
  );

  /** Off deletes the override, so the preset falls back to the global box again. */
  const setPresetBoxEnabled = React.useCallback(
    (presetId: string, enabled: boolean, seed?: BoxStyle) => {
      editPreset(presetId, (preset) => {
        const { box: _old, ...rest } = preset;
        return enabled ? { ...rest, box: normalizeBoxStyle(seed ?? preset.box) } : rest;
      });
    },
    [editPreset],
  );

  const updatePresetBox = React.useCallback(
    (presetId: string, patch: Partial<BoxStyle>) => {
      editPreset(presetId, (preset) => ({
        ...preset,
        box: normalizeBoxStyle({ ...preset.box, ...patch }),
      }));
    },
    [editPreset],
  );

  return {
    style,
    setPreset,
    createPreset,
    duplicatePreset,
    deletePreset,
    resetPreset,
    renamePreset,
    toggleFeature,
    updateElement,
    resetElement,
    updateBox,
    setPresetBoxEnabled,
    updatePresetBox,
  };
};
