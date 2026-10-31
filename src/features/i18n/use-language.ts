import * as React from 'react';

import { applyDocumentI18n, getLanguage, watchLanguage, type Language, type MessageKey } from '@/shared/i18n';

/**
 * Re-renders the tree when the language changes and, on extension pages, keeps
 * `<html lang>` and `<title>` in sync. Content scripts must not call this.
 */
export const useLanguage = (titleKey?: MessageKey): Language => {
  const [language, setLanguageState] = React.useState<Language>(getLanguage);

  React.useEffect(() => watchLanguage(setLanguageState), []);

  React.useEffect(() => {
    if (titleKey) applyDocumentI18n(language, titleKey);
  }, [language, titleKey]);

  return language;
};
