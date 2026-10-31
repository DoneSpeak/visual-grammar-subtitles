import { ja } from './ja';
import { plain } from './plain';
import type { LanguageId, LanguagePack } from './types';

export type { LanguageId, LanguagePack } from './types';
export { ja } from './ja';
export { plain } from './plain';

/** Packs that can annotate text. `plain` is a fallback, not a choice the UI offers. */
export const LANGUAGE_PACKS: Record<LanguageId, LanguagePack> = { ja };

/** Below this the text is treated as unannotatable rather than guessed. */
export const DETECTION_THRESHOLD = 0.5;

export const DEFAULT_LANGUAGE: LanguageId = 'ja';

/** A stored or requested id; unknown ids degrade to the plain pack, not to Japanese. */
export const resolveLanguage = (id: LanguageId | undefined): LanguagePack =>
  (id && LANGUAGE_PACKS[id]) || plain;

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
