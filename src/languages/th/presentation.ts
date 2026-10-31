import type { Presentation } from '@/languages/types';

/**
 * Thai has no kana/kanji split, so the ruby channel carries the analyzer's romanisation of the
 * whole word. When no trusted reading exists the token stays plain — the overlay never guesses.
 */
export const reading: Presentation['reading'] = {
  layout: 'ruby',
  align: (surface, value) => (value ? { prefix: '', base: surface, ruby: value, suffix: '' } : null),
};
