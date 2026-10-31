import type { BreakHints } from '@/languages/types';

const NO_LINE_START = /^[、。，．,.:;!?！？)）】」』〉》\]｝｠ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ々]/u;
const NO_LINE_END = /[「『（【〈《\[｛｠]$/u;

/** Kinsoku: which characters may not begin or end a rendered line. */
export const classifyBreak = (text: string): BreakHints => ({
  noLineStart: NO_LINE_START.test(text),
  noLineEnd: NO_LINE_END.test(text),
});

/** Splits plain text into break units without a dictionary. */
export const segment = (text: string): string[] => {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string, opts: { granularity: 'word' }) => {
      segment: (input: string) => Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (Segmenter) {
    const segments = [...new Segmenter('ja', { granularity: 'word' }).segment(text)]
      .map((part) => part.segment)
      .filter((part) => part.length > 0);
    if (segments.length) return segments;
  }
  const CHUNK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|\s+/gu;
  return text.match(CHUNK) ?? [text];
};
