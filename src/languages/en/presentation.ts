import type { Presentation } from '@/languages/types';

/**
 * English has no ruby channel. IPA stays on the dictionary entry for the word card; the overlay
 * shows the line as-is rather than painting pronunciation above every word.
 */
export const reading: Presentation['reading'] = {
  layout: 'hidden',
  align: () => null,
};
