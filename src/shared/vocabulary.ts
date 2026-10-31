import type { LanguageId } from '@/languages/types';

import type { DictEntry } from './dictionary';
import type { Pos } from './types';

/**
 * Visual cue for a dictionary entry, keyed by the entry's JMdict id in
 * `public/dict/vocabulary.json`. Built by `scripts/build-vocabulary.ts` from
 * `python/vocabulary/dist/vocabulary.ja.yaml`, which only publishes entries a
 * human has reviewed.
 */
export type VocabularyImage = {
  /** OpenMoji hexcode; the SVG lives at `vocab/openmoji/<hexcode>.svg`. */
  i: string;
  /** Simplified-Chinese gloss for the pictured sense. */
  z?: string;
  /** Headword, reading and JLPT level: the options gallery's only source of them. */
  w?: string;
  r?: string;
  lv?: number;
  /** UPOS of the pictured sense; the gallery groups tiles by it. */
  p?: Pos;
};

/** `language` is the subtitle language the index was built for; old files omit it (Japanese). */
export type VocabularyFile = { v: number; language?: LanguageId; images: Record<string, VocabularyImage> };

/** One tile in the options gallery. */
export type VocabularyGalleryItem = {
  id: string;
  img: string;
  word: string;
  reading: string;
  gloss?: string;
  level?: number;
  pos?: Pos;
  language?: LanguageId;
};

/** Attach image cues to the JSON dictionary without mutating the parsed file. */
export const hydrateVocabulary = (entries: DictEntry[], file: VocabularyFile | null): DictEntry[] => {
  if (!file) return entries;
  return entries.map((entry) => {
    const image = file.images[entry.id];
    if (!image) return entry;
    return { ...entry, img: image.i, z: image.z ? [image.z] : entry.z };
  });
};

/** One index per gallery language; English and Thai share the Japanese concept → image mapping. */
export const VOCABULARY_FILES = [
  'vocabulary.json',
  'vocabulary.en.json',
  'vocabulary.th.json',
] as const;

/** Flatten the picture index for display, easiest level first. */
export const vocabularyGallery = (file: VocabularyFile | null): VocabularyGalleryItem[] => {
  if (!file) return [];
  const language = file.language ?? 'ja';
  return Object.entries(file.images)
    .filter(([, image]) => image.w)
    .map(([id, image]) => ({
      id,
      img: image.i,
      word: image.w!,
      reading: image.r ?? '',
      gloss: image.z,
      level: image.lv,
      pos: image.p,
      language: file.language,
    }))
    .sort(
      (a, b) =>
        (b.level ?? 0) - (a.level ?? 0) ||
        (a.reading || a.word).localeCompare(b.reading || b.word, language) ||
        a.word.localeCompare(b.word, language),
    );
};

/** Read one picture index; null when the build shipped without it. */
export const loadVocabularyFile = async (
  name: string = VOCABULARY_FILES[0],
): Promise<VocabularyFile | null> => {
  const res = await fetch(chrome.runtime.getURL(`dict/${name}`));
  return res.ok ? (res.json() as Promise<VocabularyFile>) : null;
};
