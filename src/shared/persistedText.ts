/**
 * Values written to `chrome.storage` that are also shown to the user. They stay canonical in
 * storage; `i18n/display.ts` translates them at render time.
 */
export const UNFILED_TITLE = '未归类';
export const LOCAL_IMPORT_TITLE = '本地导入';
export const DEFAULT_RULE_NAME = '新规则';
export const BILIBILI_RULE_NAME = 'bilibili 番剧';
export const LEGACY_ORIGIN_NOTE = '旧版本导入，来源未记录';
export const FOLDER_NOTE_PREFIX = '文件夹：';

export const folderNote = (folder: string): string => `${FOLDER_NOTE_PREFIX}${folder}`;
