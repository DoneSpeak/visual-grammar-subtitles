import type { MessageKey } from './catalog';
import { translateFor } from './translate';
import type { Language } from './types';

/** Extension pages only: the content script must never mutate the host page's document. */
export const applyDocumentI18n = (language: Language, titleKey: MessageKey): void => {
  document.documentElement.lang = language;
  document.title = translateFor(language, titleKey);
};
