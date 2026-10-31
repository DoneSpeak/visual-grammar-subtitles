import { common } from './common';
import { content } from './content';
import { errors } from './errors';
import { meta } from './meta';
import { optionsBinds } from './options-binds';
import { optionsCards } from './options-cards';
import { optionsDict } from './options-dict';
import { optionsKeys } from './options-keys';
import { optionsModes } from './options-modes';
import { optionsNav } from './options-nav';
import { optionsPacks } from './options-packs';
import { optionsRules } from './options-rules';
import { optionsVocab } from './options-vocab';
import { overlay } from './overlay';
import { popup } from './popup';
import { pos } from './pos';
import { sentinels } from './sentinels';

/** Ordered list; the unit test walks it to reject duplicate keys and placeholder drift. */
export const sections = {
  common,
  meta,
  sentinels,
  errors,
  pos,
  popup,
  optionsNav,
  optionsPacks,
  optionsRules,
  optionsBinds,
  optionsCards,
  optionsDict,
  optionsVocab,
  optionsKeys,
  optionsModes,
  overlay,
  content,
} as const;
