export type Language = 'zh-CN' | 'en-GB';

export type MessageParams = Record<string, string | number | undefined>;

/** One or two grammatical forms; `count` picks between them through Intl.PluralRules. */
export type PluralMessage = { one: string; other: string };

export type Message = string | PluralMessage;
