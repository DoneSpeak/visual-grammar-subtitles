/**
 * Languages a subtitle track can be written in.
 *
 * This is deliberately separate from the annotation language packs (`src/languages/`): a learner
 * watching Thai with Chinese translation subtitles needs the Chinese pack to be labelled and
 * grouped correctly, but it has no tokenizer or dictionary of its own. Ids are stored verbatim in
 * `LibraryPack.language`, so unknown ids must round-trip rather than degrade to a default.
 */

export type SubtitleLanguageId = string;

export type SubtitleLanguage = {
  id: SubtitleLanguageId;
  /** Language names stay in their own language, as language pickers conventionally do. */
  displayName: string;
  shortLabel: string;
};

export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = [
  { id: 'ja', displayName: '日本語', shortLabel: 'JA' },
  { id: 'en', displayName: 'English', shortLabel: 'EN' },
  { id: 'th', displayName: 'ไทย', shortLabel: 'TH' },
  { id: 'zh-Hans', displayName: '简体中文', shortLabel: '简' },
  { id: 'zh-Hant', displayName: '繁體中文', shortLabel: '繁' },
];

const BY_ID = new Map(SUBTITLE_LANGUAGES.map((language) => [language.id, language]));

export const subtitleLanguage = (id: SubtitleLanguageId | undefined): SubtitleLanguage | undefined =>
  id ? BY_ID.get(id) : undefined;

/** Display name for a stored id; unknown ids show as themselves instead of a wrong language. */
export const subtitleLanguageLabel = (id: SubtitleLanguageId): string =>
  subtitleLanguage(id)?.displayName ?? id;

export const subtitleLanguageShortLabel = (id: SubtitleLanguageId): string =>
  subtitleLanguage(id)?.shortLabel ?? id;
