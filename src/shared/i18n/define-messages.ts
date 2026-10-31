import type { Message } from './types';

/**
 * Pairs the two catalogs so a missing or extra Chinese key is a compile error.
 * The English object keeps its literal keys, which become the `MessageKey` union.
 */
export const defineMessages = <const E extends Record<string, Message>>(
  en: E,
  zh: Record<keyof E, Message>,
): { en: E; zh: Record<keyof E, Message> } => ({ en, zh });
