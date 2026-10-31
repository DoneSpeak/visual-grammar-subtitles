import { plain } from '@/languages/plain';
import type { LanguagePack } from '@/languages/types';
import { thFeatures } from './features';
import { segment, classifyBreak } from './text';

export const th: LanguagePack = {
  ...plain,
  id: 'th', shortLabel: 'TH', displayName: 'ไทย (Thai)',
  detect: text => {
    const letters = text.match(/\p{L}/gu) ?? [];
    const thai = letters.filter(c => /\p{Script=Thai}/u.test(c)).length;
    return thai ? thai / letters.length : 0;
  },
  lookupKeys: token => [token.baseForm || token.surface],
  functionWords: new Set(['ADP', 'PART', 'AUX', 'CCONJ', 'SCONJ', 'PUNCT', 'SYM']),
  text: { locale: 'th', segment, classifyBreak },
  features: thFeatures,
};
