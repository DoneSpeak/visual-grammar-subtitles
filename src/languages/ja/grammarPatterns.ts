/**
 * Fixed grammatical expressions the local (and remote) analyser marks in subtitle text.
 *
 * These are plain surface patterns, so the extension can mark them without any grammar service.
 * `python/server/analyzer.py` matches the same list; keep both in sync.
 */

export const EXPRESSION_SOURCES: string[] = [
  'なければならない',
  'なければいけない',
  'てもいい',
  'てはいけない',
  'ことができる',
  'かもしれない',
];
