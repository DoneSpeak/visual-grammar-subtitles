import type { BandDeclaration } from '@/languages/types';

/**
 * Exam-vocabulary bands, one id per list a bundled entry is tagged with.
 *
 * `DECLARED` is the filter: a tag that is not listed here never becomes a band, so it neither
 * appears in the options page nor affects filtering. Add a tag here when the lexicon starts
 * carrying it.
 */
const DECLARED = ['cet4', 'cet6', 'kaoyan', 'ielts', 'toefl'] as const;

const DECLARED_SET = new Set<string>(DECLARED);

/** Literal labels: exam names are not translated in either UI locale. */
const LABELS: Record<(typeof DECLARED)[number], string> = {
  cet4: 'CET-4',
  cet6: 'CET-6',
  kaoyan: '考研',
  ielts: 'IELTS',
  toefl: 'TOEFL',
};

export const EN_BANDS: BandDeclaration = {
  definitions: DECLARED.map((id) => ({ id, label: LABELS[id] })),
  bandsOf: (entry) => (entry.tags ?? []).filter((tag) => DECLARED_SET.has(tag)),
};
