import { plain } from '@/languages/plain';
import type { LanguagePack } from '@/languages/types';
import { chunks, expressions, levels, local } from './annotators';
import { thFeatures } from './features';
import { lookupKeys } from './lexicon';
import { reading } from './presentation';
import { classifyBreak, segment } from './text';

export const th: LanguagePack = {
  ...plain,
  id: 'th', shortLabel: 'TH', displayName: 'ไทย (Thai)',
  detect: text => {
    const letters = text.match(/\p{L}/gu) ?? [];
    const thai = letters.filter(c => /\p{Script=Thai}/u.test(c)).length;
    return thai ? thai / letters.length : 0;
  },
  lookupKeys,
  functionWords: new Set(['ADP', 'PART', 'AUX', 'CCONJ', 'SCONJ', 'PUNCT', 'SYM']),
  annotators: { chunks, expressions, levels, local },
  text: { locale: 'th', segment, classifyBreak },
  presentation: { reading },
  features: thFeatures,
  dictAttribution: 'dict.footnote.th',
};
