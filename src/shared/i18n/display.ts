import {
  BILIBILI_RULE_NAME,
  DEFAULT_RULE_NAME,
  FOLDER_NOTE_PREFIX,
  LEGACY_ORIGIN_NOTE,
  LOCAL_IMPORT_TITLE,
  UNFILED_TITLE,
} from '../persistedText';
import type { MessageKey } from './catalog';
import type { MessageParams } from './types';

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Canonical storage values keep their identity; only their presentation is translated. */
export const packTitleForDisplay = (title: string, t: Translate): string => {
  if (title === UNFILED_TITLE) return t('sentinel.unfiled');
  if (title === LOCAL_IMPORT_TITLE) return t('sentinel.localImport');
  return title;
};

export const ruleNameForDisplay = (name: string, t: Translate): string => {
  if (name === BILIBILI_RULE_NAME) return t('sentinel.bilibiliRuleName');
  if (name === DEFAULT_RULE_NAME) return t('sentinel.newRuleName');
  return name;
};

export const originNoteForDisplay = (note: string, t: Translate): string => {
  if (note === LEGACY_ORIGIN_NOTE) return t('sentinel.legacyOrigin');
  if (note.startsWith(FOLDER_NOTE_PREFIX)) {
    return t('sentinel.folderNote', { folder: note.slice(FOLDER_NOTE_PREFIX.length) });
  }
  return note;
};
