import { getLanguage } from './language';
import { translateFor } from './translate';
import type { MessageKey } from './catalog';
import type { MessageParams } from './types';

export { applyDocumentI18n } from './document';
export {
  packTitleForDisplay,
  originNoteForDisplay,
  ruleNameForDisplay,
  type Translate,
} from './display';
export {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  applyLanguage,
  getLanguage,
  initI18n,
  loadLanguage,
  normalizeLanguage,
  resolveBrowserLanguage,
  setLanguage,
  watchLanguage,
} from './language';
export type { Language, Message, MessageParams, PluralMessage } from './types';
export type { MessageKey } from './catalog';

/** Translate for the current language. Re-renders come from `useLanguage`. */
export const t = (key: MessageKey, params?: MessageParams): string =>
  translateFor(getLanguage(), key, params);
