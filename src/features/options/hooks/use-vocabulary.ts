import * as React from 'react';

import {
  loadVocabularyFile,
  vocabularyGallery,
  VOCABULARY_FILES,
  type VocabularyGalleryItem,
} from '@/shared/vocabulary';

export type VocabularyController = {
  items: VocabularyGalleryItem[];
  loading: boolean;
  failed: boolean;
};

/** Read the build-time picture index once; it never changes while the page is open. */
export const useVocabulary = (): VocabularyController => {
  const [items, setItems] = React.useState<VocabularyGalleryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void Promise.all(VOCABULARY_FILES.map((name) => loadVocabularyFile(name)))
      .then((files) => {
        if (alive) setItems(files.flatMap((file) => vocabularyGallery(file)));
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { items, loading, failed };
};
