import type { BreakHints } from '@/languages/types';

/** Closing punctuation must not begin a rendered line; opening punctuation must not end one. */
const NO_LINE_START = /^[.,;:!?…)\]}%]/;
const NO_LINE_END = /[([{]$/;

export const classifyBreak = (text: string): BreakHints => ({
  noLineStart: NO_LINE_START.test(text),
  noLineEnd: NO_LINE_END.test(text),
});

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' },
) => { segment(input: string): Iterable<{ segment: string }> };

/** Splits plain text into break units without a dictionary. */
export const segment = (text: string): string[] => {
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Ctor) {
    const parts = [...new Ctor('en', { granularity: 'word' }).segment(text)]
      .map((part) => part.segment)
      .filter((part) => part.length > 0);
    if (parts.length) return parts;
  }
  return text.match(/\S+|\s+/g) ?? [text];
};
