import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { enGB, zhCN, type MessageKey } from '@/shared/i18n/catalog';
import {
  originNoteForDisplay,
  packTitleForDisplay,
  ruleNameForDisplay,
} from '@/shared/i18n/display';
import { applyLanguage, getLanguage, resolveBrowserLanguage } from '@/shared/i18n/language';
import { sections } from '@/shared/i18n/messages/sections';
import { translateFor } from '@/shared/i18n/translate';
import type { Language, Message, MessageParams } from '@/shared/i18n/types';
import {
  BILIBILI_RULE_NAME,
  DEFAULT_RULE_NAME,
  FOLDER_NOTE_PREFIX,
  LEGACY_ORIGIN_NOTE,
  LOCAL_IMPORT_TITLE,
  UNFILED_TITLE,
} from '@/shared/persistedText';

const initialLanguage = getLanguage();

afterEach(() => {
  applyLanguage(initialLanguage);
  vi.unstubAllGlobals();
});

const resolveWith = (languages: string[], uiLanguage?: string): Language => {
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  vi.stubGlobal('chrome', uiLanguage ? { i18n: { getUILanguage: () => uiLanguage } } : undefined);
  return resolveBrowserLanguage();
};

const placeholders = (message: Message): string[] => {
  const text = typeof message === 'string' ? message : `${message.one} ${message.other}`;
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
};

describe('browser language resolution', () => {
  it('keeps Chinese variants on zh-CN and English variants on en-GB', () => {
    expect(resolveWith(['zh-TW'])).toBe('zh-CN');
    expect(resolveWith(['en-US'])).toBe('en-GB');
  });

  it('prefers chrome.i18n over the navigator list', () => {
    expect(resolveWith(['en-US'], 'zh-CN')).toBe('zh-CN');
  });

  it('falls back through the preference list, then to zh-CN', () => {
    expect(resolveWith(['fr-FR', 'zh-CN'])).toBe('zh-CN');
    expect(resolveWith(['fr-FR', 'ja-JP'])).toBe('zh-CN');
  });
});

describe('translation', () => {
  it('interpolates named placeholders', () => {
    expect(translateFor('en-GB', 'popup.status.subtitle', { name: 'Monster 01.srt' })).toBe(
      'Current subtitles: Monster 01.srt',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translateFor('en-GB', 'popup.status.subtitle', {})).toBe('Current subtitles: {name}');
  });

  it('selects the English plural form', () => {
    const cue = (count: number) => translateFor('en-GB', 'popup.entry.cueCount', { count });
    expect([cue(0), cue(1), cue(2)]).toEqual(['0 cues', '1 cue', '2 cues']);
  });

  it('uses the single Chinese form for every count', () => {
    expect(translateFor('zh-CN', 'popup.entry.cueCount', { count: 0 })).toBe('0 条');
    expect(translateFor('zh-CN', 'popup.entry.cueCount', { count: 2 })).toBe('2 条');
  });

  it('changing the language changes t() output', () => {
    applyLanguage('zh-CN');
    expect(getLanguage()).toBe('zh-CN');
    expect(translateFor(getLanguage(), 'common.cancel')).toBe('取消');
  });
});

describe('catalog integrity', () => {
  it('has no key defined in two sections (TS does not catch spread collisions)', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const section of Object.values(sections)) {
      for (const key of Object.keys(section.en)) {
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('has identical keys and placeholders in both languages', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enGB).sort());
    for (const key of Object.keys(enGB) as MessageKey[]) {
      expect(placeholders(zhCN[key]), key).toEqual(placeholders(enGB[key]));
    }
  });
});

describe('persisted sentinels', () => {
  const en = (key: MessageKey, params?: MessageParams) => translateFor('en-GB', key, params);
  const zh = (key: MessageKey, params?: MessageParams) => translateFor('zh-CN', key, params);

  it('translates pack titles for display but keeps the stored value', () => {
    expect(packTitleForDisplay(UNFILED_TITLE, en)).toBe(en('sentinel.unfiled'));
    expect(packTitleForDisplay(LOCAL_IMPORT_TITLE, zh)).toBe(zh('sentinel.localImport'));
    expect(packTitleForDisplay('Monster', en)).toBe('Monster');
    expect(UNFILED_TITLE).toBe('未归类');
  });

  it('translates rule names for display', () => {
    expect(ruleNameForDisplay(DEFAULT_RULE_NAME, en)).toBe(en('sentinel.newRuleName'));
    expect(ruleNameForDisplay(BILIBILI_RULE_NAME, en)).toBe(en('sentinel.bilibiliRuleName'));
    expect(ruleNameForDisplay('My rule', en)).toBe('My rule');
  });

  it('translates legacy and folder origin notes', () => {
    expect(originNoteForDisplay(LEGACY_ORIGIN_NOTE, en)).toBe(en('sentinel.legacyOrigin'));
    expect(originNoteForDisplay(`${FOLDER_NOTE_PREFIX}Monster`, en)).toBe('Folder: Monster');
    expect(originNoteForDisplay('custom', en)).toBe('custom');
  });
});

describe('manifest locales', () => {
  const read = (locale: string) =>
    JSON.parse(
      readFileSync(resolve(process.cwd(), `public/_locales/${locale}/messages.json`), 'utf8'),
    ) as Record<string, { message: string }>;

  it('defines the same keys for en_GB and zh_CN', () => {
    expect(Object.keys(read('zh_CN')).sort()).toEqual(Object.keys(read('en_GB')).sort());
  });

  it('fills every manifest string in both locales', () => {
    for (const locale of ['en_GB', 'zh_CN']) {
      for (const [key, entry] of Object.entries(read(locale))) {
        expect(entry.message.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });
});
