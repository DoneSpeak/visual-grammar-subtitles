import { describe, expect, it } from 'vitest';

import {
  classifyBreak,
  optimizeLayout,
  segmentPlain,
  type LayoutUnit,
  type OptimizeInput,
  type OptimizeResult,
} from '@/features/overlay/layout';

const unit = (text: string, width = [...text].length, extra: Partial<LayoutUnit> = {}): LayoutUnit => ({
  text,
  width,
  ...classifyBreak(text),
  ...extra,
});

/** One unit per character: width equals the character count, so f px per char reads clearly. */
const chars = (text: string): LayoutUnit[] => [...text].map((char) => unit(char, 1));

const run = (input: Partial<OptimizeInput> & Pick<OptimizeInput, 'paragraphs' | 'width' | 'height'>): OptimizeResult =>
  optimizeLayout({
    minFont: 10,
    maxFont: 200,
    minLineHeight: 1.2,
    maxLineHeight: 1.5,
    ...input,
  });

/** Recomputes what the plan paints, so overflow assertions do not trust the optimizer's own math. */
const measure = (result: OptimizeResult, paragraphs: LayoutUnit[][]) => {
  const widths: number[] = [];
  const heights: number[] = [];
  result.lineStarts.forEach((starts, p) => {
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : paragraphs[p].length;
      const slice = paragraphs[p].slice(start, end);
      const chars = slice.reduce((sum, u) => sum + [...u.text].length, 0);
      const width = slice.reduce((sum, u) => sum + u.width, 0) * result.fontPx;
      widths.push(width + result.letterSpacingEm * result.fontPx * chars);
      heights.push(result.fontPx * result.lineHeight);
    });
  });
  return { widths, heights, lines: widths.length };
};

describe('optimizeLayout', () => {
  it('fills a wide box with one large line', () => {
    const paragraphs = [chars('春夏秋冬')];
    const result = run({ paragraphs, width: 800, height: 200 });

    expect(result.lineStarts).toEqual([[0]]);
    // Height-limited: one line at line-height 1.2 fills the 200 px box.
    expect(result.fontPx).toBeCloseTo(200 / 1.2, 0);
    expect(result.lineHeight).toBeCloseTo(1.2, 5);
  });

  it('adds lines and shrinks the font as the box narrows', () => {
    const paragraphs = [chars('我想陪你走过春夏秋冬')];
    const wide = run({ paragraphs, width: 900, height: 200 });
    const narrow = run({ paragraphs, width: 200, height: 200 });

    expect(wide.lineStarts[0].length).toBeLessThan(narrow.lineStarts[0].length);
    expect(narrow.fontPx).toBeLessThan(wide.fontPx);
  });

  it('never paints past the box', () => {
    const paragraphs = [chars('我想陪你走过每个春夏秋冬，一直到世界的尽头')];
    for (const width of [80, 140, 260, 600]) {
      for (const height of [60, 120, 300]) {
        const result = run({ paragraphs, width, height });
        const { widths, heights } = measure(result, paragraphs);
        for (const w of widths) expect(w).toBeLessThanOrEqual(width + 0.5);
        expect(heights.reduce((sum, h) => sum + h, 0)).toBeLessThanOrEqual(height + 0.5);
      }
    }
  });

  it('keeps cue lines separate even when they would fit on one line', () => {
    const paragraphs = [chars('我想陪你走过'), chars('每个春夏秋冬')];
    const result = run({ paragraphs, width: 2000, height: 400 });

    expect(result.lineStarts).toEqual([[0], [0]]);
  });

  it('avoids a break before a particle when another split is equally full', () => {
    // The zero-width unit makes both two-line splits identical in width, so only the particle
    // penalty can separate them: splitting after it would start the next line with a particle.
    const paragraphs = [
      [unit('ab', 2), unit('cd', 2), unit('', 0), unit('は', 2, { particle: true })],
    ];
    const result = run({ paragraphs, width: 4, height: 2.4, minFont: 1, maxFont: 1 });

    expect(result.lineStarts).toEqual([[0, 2]]);
  });

  it('keeps empty cue lines aligned with the painted paragraphs', () => {
    const paragraphs = [chars('春夏'), [], chars('秋冬')];
    const result = run({ paragraphs, width: 1000, height: 100 });

    expect(result.lineStarts).toHaveLength(3);
    expect(result.lineStarts[1]).toEqual([]);
  });

  it('applies tracking only within the legibility cap', () => {
    const paragraphs = [chars('短い')];
    const result = run({ paragraphs, width: 1000, height: 100, maxFont: 20 });

    expect(result.fontPx).toBe(20);
    expect(result.letterSpacingEm).toBeGreaterThan(0);
    expect(result.letterSpacingEm).toBeLessThanOrEqual(0.05);
  });

  it('shrinks instead of overflowing when even the legibility floor is too large', () => {
    const paragraphs = [[unit('supercalifragilistic', 500)]];
    const result = run({ paragraphs, width: 100, height: 100, minFont: 10, maxFont: 200 });

    expect(result.fontPx).toBeLessThan(10);
    const { widths } = measure(result, paragraphs);
    expect(widths[0]).toBeLessThanOrEqual(100.5);
  });

  it('accounts for ruby in the line height', () => {
    const paragraphs = [chars('春夏秋冬')];
    const plain = run({ paragraphs, width: 1000, height: 200 });
    const ruby = run({ paragraphs, width: 1000, height: 200, rubyFactor: 1.28 });

    expect(ruby.fontPx).toBeLessThan(plain.fontPx);
  });

  it('paints every cue at the fixed font, reflowing only the lines', () => {
    const long = [chars('我想陪你走过每个春夏秋冬')];
    const short = [chars('短い')];
    const longResult = run({ paragraphs: long, width: 200, height: 200, fixedFont: 40 });
    const shortResult = run({ paragraphs: short, width: 200, height: 200, fixedFont: 40 });

    expect(longResult.fontPx).toBe(40);
    expect(shortResult.fontPx).toBe(40);
    const { widths } = measure(longResult, long);
    for (const w of widths) expect(w).toBeLessThanOrEqual(200.5);
  });

  it('never shrinks a fixed font below the requested size to fit the box', () => {
    const paragraphs = [[unit('supercalifragilistic', 500)]];
    const free = run({ paragraphs, width: 100, height: 100, minFont: 10, maxFont: 200 });
    const fixed = run({ paragraphs, width: 100, height: 100, minFont: 10, maxFont: 200, fixedFont: 10 });

    expect(free.fontPx).toBeLessThan(10);
    expect(fixed.fontPx).toBe(10);
    expect(fixed.lineStarts).toEqual([[0]]);
  });
});

describe('segmentPlain', () => {
  it('splits Japanese into word-sized units', () => {
    const segments = segmentPlain('我想陪你走过春夏秋冬');
    expect(segments.join('')).toBe('我想陪你走过春夏秋冬');
    expect(segments.length).toBeGreaterThan(1);
  });

  it('keeps spaces as their own units so they can be retained at a break', () => {
    const segments = segmentPlain('hello world');
    expect(segments.join('')).toBe('hello world');
  });
});
