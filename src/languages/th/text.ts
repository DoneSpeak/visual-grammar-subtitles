import type { BreakHints } from '@/languages/types';

/** Never split a combining sequence, including when word segmentation is unavailable. */
export const segment = (text: string): string[] => {
  if (!text) return [];
  try {
    const boundaries = new Set([text.length, ...Array.from(
      new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text), p => p.index,
    )]);
    const result: string[] = [];
    let pending = '';
    let end = 0;
    for (const part of new Intl.Segmenter('th', { granularity: 'word' }).segment(text)) {
      pending += part.segment;
      end += part.segment.length;
      if (boundaries.has(end)) { result.push(pending); pending = ''; }
    }
    if (result.join('') === text) return result;
  } catch { /* Older browsers retain whole runs rather than guessing Thai boundaries. */ }
  return text.match(/\S+|\s+/gu) ?? [text];
};

export const classifyBreak = (text: string): BreakHints => ({
  noLineStart: /^[\p{M}.,;:!?…)\]}ฯๆ]/u.test(text),
  noLineEnd: /[([{]$/.test(text),
});
