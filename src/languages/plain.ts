import type { LanguagePack } from './types';

/**
 * The degradation path: an unrecognised script is rendered as plain text, never tokenized.
 *
 * Feeding Han-only text to the Japanese tokenizer would produce confident-looking garbage, which
 * is worse than no annotation at all. The pack keeps every renderer path valid — identity
 * annotators, no elements, no ruby — so the overlay can treat "unknown language" as normal input.
 */
export const plain: LanguagePack = {
  id: 'plain',
  shortLabel: '',
  displayName: 'Plain',
  detect: () => 0,
  posGroup: () => 'other',
  isInflected: () => false,
  functionWords: new Set(),
  lookupKeys: () => [],
  annotators: {
    chunks: (tokens) => tokens,
    expressions: (tokens) => tokens,
    levels: (tokens) => tokens,
    local: (tokens) => tokens,
  },
  text: {
    locale: '',
    segment: (text) => text.match(/\S+|\s+/g) ?? [text],
    classifyBreak: () => ({}),
  },
  presentation: {
    reading: { layout: 'hidden', align: () => null },
  },
};
