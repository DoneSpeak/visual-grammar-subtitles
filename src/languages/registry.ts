import type { FeatureRegistry } from '@/shared/studyFeatures';

import { th } from './th';
import { en } from './en';
import { ja } from './ja';
import { plain } from './plain';
import type { LanguageId, LanguagePack } from './types';

export type { LanguageId, LanguagePack } from './types';
export { en } from './en';
export { ja } from './ja';
export { plain } from './plain';

/** Packs that can annotate text. `plain` is a fallback, not a choice the UI offers. */
export const LANGUAGE_PACKS: Record<LanguageId, LanguagePack> = { ja, en, th };

/** Languages the panel offers for a layer. `plain` deliberately stays out of this list. */
export const SELECTABLE_LANGUAGES: readonly LanguagePack[] = Object.values(LANGUAGE_PACKS);

/** Study-layer registries, one per annotatable language; used to seed and validate presets. */
export const FEATURE_REGISTRIES: Record<LanguageId, FeatureRegistry> = {
  ...Object.fromEntries(
    Object.entries(LANGUAGE_PACKS)
      .filter(([, pack]) => pack.features)
      .map(([id, pack]) => [id, pack.features as FeatureRegistry]),
  ),
  // Every valid language id owns a preset bucket, including the degradation pack. `plain` has
  // an empty registry, so it still resolves to its single "plain" mode.
  plain: plain.features as FeatureRegistry,
};

/** Below this the text is treated as unannotatable rather than guessed. */
export const DETECTION_THRESHOLD = 0.5;

export const DEFAULT_LANGUAGE: LanguageId = 'ja';

/** A stored or requested id; unknown ids degrade to the plain pack, not to Japanese. */
export const resolveLanguage = (id: LanguageId | undefined): LanguagePack =>
  (id && LANGUAGE_PACKS[id]) || plain;

/** A language's study registry; unknown ids get the empty one so the UI still renders. */
export const featuresFor = (id: LanguageId | undefined): FeatureRegistry =>
  (id && FEATURE_REGISTRIES[id]) || (plain.features as FeatureRegistry);

/** Highest-scoring pack, or `plain` when nothing is confident enough to annotate. */
export const detectLanguage = (text: string): LanguagePack => {
  let best: LanguagePack = plain;
  let bestScore = DETECTION_THRESHOLD;
  for (const pack of Object.values(LANGUAGE_PACKS)) {
    const score = pack.detect(text);
    if (score > bestScore) {
      best = pack;
      bestScore = score;
    }
  }
  return best;
};

/** The id to store on a subtitle source: a real pack, or `plain` below the threshold. */
export const detectLanguageId = (text: string): LanguageId => detectLanguage(text).id;

/**
 * Detection with a hint from the source that produced the text.
 *
 * A pack's declared language is authoritative when the text itself is too short or too neutral to
 * detect; a confident detection still wins, so a mislabelled pack corrects itself on load.
 */
export const resolveLanguageHint = (text: string, hint?: LanguageId): LanguageId => {
  const detected = detectLanguageId(text);
  if (detected !== 'plain') return detected;
  return hint && isSelectableLanguage(hint) ? hint : detected;
};

/** True for packs the panel may offer; `plain` and unknown ids are not selectable. */
export const isSelectableLanguage = (id: LanguageId | undefined): boolean =>
  !!id && Object.hasOwn(LANGUAGE_PACKS, id);
