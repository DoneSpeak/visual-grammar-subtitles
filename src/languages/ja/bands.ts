import type { BandDeclaration } from '@/languages/types';

/**
 * JLPT bands. One band per entry, so `bandsOf` returns the level as a decimal string — the same
 * runtime lookup the old numeric `levels[entry.lv]` performed. Entries without a level (`lv: 0`,
 * names and loanwords) are never study-plan words.
 */
export const JA_BANDS: BandDeclaration = {
  definitions: [1, 2, 3, 4, 5].map((level) => ({ id: String(level), label: `N${level}` })),
  bandsOf: (entry) => (entry.lv > 0 ? [String(entry.lv)] : []),
};
