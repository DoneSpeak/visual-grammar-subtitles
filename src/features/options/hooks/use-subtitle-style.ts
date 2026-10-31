import * as React from 'react';

import type { ElementStyle } from '@/shared/elementStyle';
import { resolveFeatures, toggleFeatureIn, type FeatureId } from '@/shared/studyFeatures';
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
const withCustomization = (preset: StudyPreset): StudyPreset => {
  if (!isBuiltInPresetId(preset.id)) return preset;
  const defaults = defaultPreset(preset.id);
  const features = resolveFeatures(preset.features);
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
  id: string,
  update: (preset: StudyPreset) => StudyPreset,
): SubtitleStyle => {
  const preset = style.presets[id];
  if (!preset) return style;
  return { ...style, presets: { ...style.presets, [id]: update(preset) } };
};

export const useSubtitleStyle = (): SubtitleStyleController => {
  const [style, setStyle] = React.useState<SubtitleStyle>(() => defaultSubtitleStyle());
  const styleRef = React.useRef(style);
  const timer = React.useRef<number | undefined>(undefined);

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
      commit(updatePreset(styleRef.current, id, (preset) => withCustomization(update(preset))));
    },
    [commit],
  );

  const setPreset = React.useCallback(
    (id: string) => commit({ ...styleRef.current, activePresetId: id }),
    [commit],
  );

  const createPreset = React.useCallback(
    (name?: string) => {
      const id = `custom:${crypto.randomUUID()}`;
      const features: FeatureId[] = ['pos'];
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
        activePresetId: id,
        presets: { ...current.presets, [id]: preset },
      });
      return id;
    },
    [commit],
  );

  const duplicatePreset = React.useCallback(
    (sourceId: string, name?: string) => {
      const current = styleRef.current;
      const source = current.presets[sourceId];
      if (!source) return null;
      const id = `custom:${crypto.randomUUID()}`;
      commit({
        ...current,
        activePresetId: id,
        presets: { ...current.presets, [id]: copyPreset(source, id, name) },
      });
      return id;
    },
    [commit],
  );

  const deletePreset = React.useCallback(
    (id: string) => {
      const current = styleRef.current;
      if (isBuiltInPresetId(id) || !current.presets[id]) return;
      const { [id]: _removed, ...presets } = current.presets;
      commit({
        ...current,
        presets,
        activePresetId: current.activePresetId === id ? 'pos-basic' : current.activePresetId,
      });
    },
    [commit],
  );

  const resetPreset = React.useCallback(
    (id: string) => {
      commit(
        updatePreset(styleRef.current, id, (preset) => {
          if (isBuiltInPresetId(id)) return defaultPreset(id);
          const features = resolveFeatures(preset.features);
          const { box: _box, ...rest } = preset;
          return { ...rest, features, base: baseForFeatures(features), elements: {} };
        }),
      );
    },
    [commit],
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
        const features = toggleFeatureIn(preset.features, featureId);
        return { ...preset, features, base: baseForFeatures(features) };
      });
    },
    [editPreset],
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
