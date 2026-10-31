import { sections } from './messages/sections';
import type { Message } from './types';

export const enGB = {
  ...sections.common.en,
  ...sections.meta.en,
  ...sections.sentinels.en,
  ...sections.errors.en,
  ...sections.pos.en,
  ...sections.popup.en,
  ...sections.optionsNav.en,
  ...sections.optionsPacks.en,
  ...sections.optionsRules.en,
  ...sections.optionsBinds.en,
  ...sections.optionsCards.en,
  ...sections.optionsDict.en,
  ...sections.optionsVocab.en,
  ...sections.optionsKeys.en,
  ...sections.optionsModes.en,
  ...sections.overlay.en,
  ...sections.content.en,
};

export type MessageKey = keyof typeof enGB;

export const zhCN: Record<MessageKey, Message> = {
  ...sections.common.zh,
  ...sections.meta.zh,
  ...sections.sentinels.zh,
  ...sections.errors.zh,
  ...sections.pos.zh,
  ...sections.popup.zh,
  ...sections.optionsNav.zh,
  ...sections.optionsPacks.zh,
  ...sections.optionsRules.zh,
  ...sections.optionsBinds.zh,
  ...sections.optionsCards.zh,
  ...sections.optionsDict.zh,
  ...sections.optionsVocab.zh,
  ...sections.optionsKeys.zh,
  ...sections.optionsModes.zh,
  ...sections.overlay.zh,
  ...sections.content.zh,
};
