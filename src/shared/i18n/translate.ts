import { enGB, zhCN, type MessageKey } from './catalog';
import type { Language, Message, MessageParams } from './types';

const catalogs: Record<Language, Record<MessageKey, Message>> = {
  'zh-CN': zhCN,
  'en-GB': enGB,
};

const pluralRules: Record<Language, Intl.PluralRules> = {
  'zh-CN': new Intl.PluralRules('zh-CN'),
  'en-GB': new Intl.PluralRules('en-GB'),
};

const interpolate = (template: string, params?: MessageParams): string =>
  template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    return value === undefined ? `{${name}}` : String(value);
  });

export const translateFor = (
  language: Language,
  key: MessageKey,
  params?: MessageParams,
): string => {
  const message = catalogs[language][key];
  if (message === undefined) return key;
  if (typeof message === 'string') return interpolate(message, params);
  const count = params?.count;
  const form =
    typeof count === 'number' && pluralRules[language].select(count) === 'one'
      ? message.one
      : message.other;
  return interpolate(form, params);
};
