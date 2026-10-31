import * as React from 'react';

import { DEFAULT_LANGUAGE, isSelectableLanguage } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';
import {
  loadLearningLanguages,
  saveLearningLanguages,
} from '@/shared/learningLanguages';

export type LearningLanguagesController = {
  languages: LanguageId[];
  /** False until the stored set has been read; routing waits for it. */
  ready: boolean;
  add: (language: LanguageId) => void;
  /** No-op when it would leave the set empty. */
  remove: (language: LanguageId) => void;
};

/** The options page's learning-language set. Only this page writes it. */
export const useLearningLanguages = (): LearningLanguagesController => {
  const [languages, setLanguages] = React.useState<LanguageId[]>([DEFAULT_LANGUAGE]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void loadLearningLanguages().then((stored) => {
      if (!alive) return;
      setLanguages(stored);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const add = React.useCallback((language: LanguageId) => {
    if (!isSelectableLanguage(language)) return;
    setLanguages((previous) => {
      if (previous.includes(language)) return previous;
      const next = [...previous, language];
      void saveLearningLanguages(next);
      return next;
    });
  }, []);

  const remove = React.useCallback((language: LanguageId) => {
    setLanguages((previous) => {
      if (previous.length <= 1 || !previous.includes(language)) return previous;
      const next = previous.filter((id) => id !== language);
      void saveLearningLanguages(next);
      return next;
    });
  }, []);

  return { languages, ready, add, remove };
};
