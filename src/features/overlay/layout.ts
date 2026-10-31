/**
 * Adaptive text layout for a subtitle box.
 *
 * Given a rectangle `(W, H)` and a paragraph of unbreakable units, choose `θ = (f, B, l, s)`
 * — font size, line breaks, line height, letter spacing — that fills the box:
 *
 *   max  α·U(θ) − β·P_balance(θ) − γ·P_readability(θ)
 *   s.t. line widths ≤ W, rendered height ≤ H, f ≥ f_min
 *
 * The search mirrors the structure of the problem: line count is the discrete variable, so we
 * enumerate it; for each line count a bottleneck DP gives the smallest possible line width,
 * which (because glyph widths scale linearly with the font) yields the largest font that fits;
 * a second DP then picks the break positions with the best raggedness/kinsoku trade-off. Every
 * candidate layout is scored, and the best one wins.
 *
 * Pure module: unit widths are supplied by the caller (canvas measurement lives in overlay.ts),
 * so the whole optimizer runs in jsdom.
 */

/** One unbreakable piece of text: a token, a Latin word, or a single CJK character. */
export type LayoutUnit = {
  text: string;
  /** Width in CSS pixels at font-size 1px. Glyph widths scale linearly with the font. */
  width: number;
  /** The cue line ends here: the next unit belongs to another cue line. */
  hardBreak?: boolean;
  /** Starts with a character that may not begin a line (、。」 etc. — kinsoku). */
  noLineStart?: boolean;
  /** Ends with a character that may not end a line (「（ etc. — kinsoku). */
  noLineEnd?: boolean;
  /** A particle/auxiliary: a line that starts or ends with it reads poorly. */
  particle?: boolean;
};

export type OptimizeInput = {
  /** Cue lines; a break between paragraphs is mandatory. */
  paragraphs: LayoutUnit[][];
  /** Available width in CSS pixels. */
  width: number;
  /** Available height in CSS pixels. */
  height: number;
  minFont: number;
  /** Growth ceiling: the box may enlarge the text up to this size. */
  maxFont: number;
  /** The user's slider value: a soft lower bound. Shrinking below it is penalised; growing above
   *  it is nearly free, because filling the box is the point of the box. */
  preferredFont?: number;
  /** A hard output size: every cue paints at this font, whatever the box or cue length says.
   *  The optimizer still chooses line breaks and line height around it. */
  fixedFont?: number;
  /** Per-line height multiplier for ruby/furigana, which sits above the base glyphs. */
  rubyFactor?: number;
  minLineHeight?: number;
  maxLineHeight?: number;
  /** Upper bound for tracking, in em. Beyond this the line is "spaced out", not "full". */
  maxLetterEm?: number;
};

export type OptimizeResult = {
  fontPx: number;
  lineHeight: number;
  letterSpacingEm: number;
  /** Per paragraph: unit index where each rendered line starts. Always starts with 0. */
  lineStarts: number[][];
  /** Objective value, for diagnostics/tests. */
  score: number;
  /** 2-D utilisation of the box, 0..1. */
  fill: number;
};

const DEFAULT_MIN_LINE_HEIGHT = 1.2;
const DEFAULT_MAX_LINE_HEIGHT = 1.5;
const DEFAULT_MAX_LETTER_EM = 0.05;
/** Subtitles stop being readable as subtitles past a handful of lines. */
const MAX_LINES = 6;
/** The DP is O(lines·units²); a cue this long is pathological and gets the cheap fallback. */
const MAX_UNITS = 240;
/** Below this size, reading Japanese on a moving picture gets uncomfortable. */
const COMFORT_FONT_PX = 16;

const ALPHA = 1;
const BETA = 0.35;
const GAMMA = 0.6;

const NO_LINE_START = /^[、。，．,.:;!?！？)）】」』〉》\]｝｠ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ々]/u;
const NO_LINE_END = /[「『（【〈《\[｛｠]$/u;

export const classifyBreak = (text: string): Pick<LayoutUnit, 'noLineStart' | 'noLineEnd'> => ({
  noLineStart: NO_LINE_START.test(text),
  noLineEnd: NO_LINE_END.test(text),
});

/** Break costs, in the same units as a normalised raggedness term (~0..1 per line). */
const PENALTY_NO_LINE_START = 0.6;
const PENALTY_NO_LINE_END = 0.6;
const PENALTY_PARTICLE_START = 0.3;
const PENALTY_PARTICLE_END = 0.1;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Splits plain text into break units without a dictionary. */
export const segmentPlain = (text: string): string[] => {
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

const breakPenalty = (prev: LayoutUnit, next: LayoutUnit): number => {
  if (prev.hardBreak) return 0;
  let penalty = 0;
  if (next.noLineStart) penalty += PENALTY_NO_LINE_START;
  if (prev.noLineEnd) penalty += PENALTY_NO_LINE_END;
  if (next.particle) penalty += PENALTY_PARTICLE_START;
  if (prev.particle) penalty += PENALTY_PARTICLE_END;
  return penalty;
};

/** Line raggedness: penalise short non-final lines, not the natural short last line. */
const lineCost = (width: number, target: number, isLast: boolean): number => {
  const slack = Math.max(0, (target - width) / target);
  return (isLast ? 0.15 : 1) * 4 * slack * slack;
};

const identityPlan = (paragraphs: LayoutUnit[][]): number[][] => paragraphs.map(() => [0]);

const fallback = (input: OptimizeInput, maxLineWidth: number, paragraphs: number): OptimizeResult => {
  const { width, height } = input;
  const ruby = input.rubyFactor ?? 1;
  const minLh = input.minLineHeight ?? DEFAULT_MIN_LINE_HEIGHT;
  // Keep one line per paragraph: breaking more would be arbitrary without the optimizer, and
  // shrinking below 1px is still better than painting past the box edges. A fixed output size
  // is authoritative: it may overflow rather than shrink.
  const fontPx = input.fixedFont
    ? input.fixedFont
    : Math.max(
        0.01,
        Math.min(
          input.maxFont,
          maxLineWidth > 0 ? width / maxLineWidth : input.maxFont,
          height / Math.max(1, paragraphs * minLh * ruby),
        ),
      );
  const lineHeight = clamp(height / Math.max(1, paragraphs * fontPx * ruby), minLh, input.maxLineHeight ?? DEFAULT_MAX_LINE_HEIGHT);
  return {
    fontPx,
    lineHeight,
    letterSpacingEm: 0,
    lineStarts: identityPlan(input.paragraphs),
    score: Number.NEGATIVE_INFINITY,
    fill: 0,
  };
};

/**
 * @returns the best layout for the box, or the largest font that keeps one line per paragraph
 * when nothing fits the legibility floor (overflow would be worse than a small font).
 */
export const optimizeLayout = (input: OptimizeInput): OptimizeResult => {
  const { width, height, minFont, maxFont } = input;
  const paragraphs = input.paragraphs;
  // Empty cue lines are kept in place so line indices still match the painted paragraphs.
  const shown = paragraphs.filter((para) => para.length > 0).length;
  if (!shown || width < 1 || height < 1) {
    return {
      fontPx: input.fixedFont ?? Math.max(1, Math.min(maxFont, minFont)),
      lineHeight: input.minLineHeight ?? DEFAULT_MIN_LINE_HEIGHT,
      letterSpacingEm: 0,
      lineStarts: identityPlan(input.paragraphs),
      score: 0,
      fill: 0,
    };
  }

  const ruby = input.rubyFactor ?? 1;
  const minLh = input.minLineHeight ?? DEFAULT_MIN_LINE_HEIGHT;
  const maxLh = input.maxLineHeight ?? DEFAULT_MAX_LINE_HEIGHT;
  const maxLetterEm = input.maxLetterEm ?? DEFAULT_MAX_LETTER_EM;
  const fixedFont = input.fixedFont && input.fixedFont > 0 ? input.fixedFont : null;
  const preferred = input.preferredFont ?? fixedFont ?? (minFont + maxFont) / 2;

  // Flatten paragraphs; remember each unit's local index so break offsets map back.
  const flat: LayoutUnit[] = [];
  const flatPara: number[] = [];
  const flatLocal: number[] = [];
  const paraWidth: number[] = [];
  paragraphs.forEach((para, p) => {
    paraWidth[p] = 0;
    para.forEach((unit, local) => {
      // Copy: a paragraph boundary mutates the last unit, and callers reuse their unit arrays.
      flat.push({ ...unit });
      flatPara.push(p);
      flatLocal.push(local);
      paraWidth[p] += unit.width;
    });
    if (para.length) flat[flat.length - 1].hardBreak = true;
  });

  const n = flat.length;
  const prefix = new Float64Array(n + 1);
  const chars = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + flat[i].width;
    chars[i + 1] = chars[i] + [...flat[i].text].length;
  }

  // A line may not run past the first hard break at or after its start.
  const firstHard = new Int32Array(n);
  let hard = n;
  for (let i = n - 1; i >= 0; i--) {
    if (flat[i].hardBreak) hard = i;
    firstHard[i] = hard;
  }
  const lineLimit = (j: number): number => Math.min(n, firstHard[j] + 1);

  const maxLineWidth = Math.max(...paraWidth);
  if (n > MAX_UNITS) return fallback(input, maxLineWidth, shown);
  const lineFloor = Math.max(1, minFont);

  /** Smallest achievable max line width (px at font-size 1) when using exactly `lines` lines. */
  const bottleneck = (lines: number): number | null => {
    let prev = new Float64Array(n + 1).fill(Infinity);
    prev[0] = 0;
    for (let k = 1; k <= lines; k++) {
      const cur = new Float64Array(n + 1).fill(Infinity);
      for (let i = 1; i <= n; i++) {
        for (let j = 0; j < i; j++) {
          if (!Number.isFinite(prev[j]) || i > lineLimit(j)) continue;
          const value = Math.max(prev[j], prefix[i] - prefix[j]);
          if (value < cur[i]) cur[i] = value;
        }
      }
      prev = cur;
      if (k === lines) break;
    }
    const value = prev[n];
    return Number.isFinite(value) ? value : null;
  };

  /** Break positions for exactly `lines` lines at font size `font`, with soft costs. */
  const solve = (lines: number, font: number): number[] | null => {
    const cost = Array.from({ length: lines + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const from = Array.from({ length: lines + 1 }, () => new Int32Array(n + 1).fill(-1));
    cost[0][0] = 0;
    for (let k = 1; k <= lines; k++) {
      for (let i = 1; i <= n; i++) {
        for (let j = 0; j < i; j++) {
          if (!Number.isFinite(cost[k - 1][j]) || i > lineLimit(j)) continue;
          const w = (prefix[i] - prefix[j]) * font;
          if (w > width + 0.5) continue;
          const isLast = i === n && k === lines;
          const penalty = j > 0 ? breakPenalty(flat[j - 1], flat[j]) : 0;
          const total = cost[k - 1][j] + lineCost(w, width, isLast) + penalty;
          if (total < cost[k][i]) {
            cost[k][i] = total;
            from[k][i] = j;
          }
        }
      }
    }
    if (!Number.isFinite(cost[lines][n])) return null;
    const ends: number[] = [];
    let at = n;
    for (let k = lines; k > 0; k--) {
      ends.push(at);
      at = from[k][at];
      if (at < 0) return null;
    }
    return ends.reverse();
  };

  const startsOf = (ends: number[]): number[][] => {
    const starts: number[][] = paragraphs.map(() => []);
    let begin = 0;
    for (const end of ends) {
      starts[flatPara[begin]].push(flatLocal[begin]);
      begin = end;
    }
    // Guard against a DP result that skips a paragraph; every non-empty paragraph must show a line.
    paragraphs.forEach((para, p) => {
      if (para.length && !starts[p].length) starts[p].push(0);
    });
    return starts;
  };

  const evaluate = (lines: number, ends: number[], font: number, lineHeight: number): OptimizeResult => {
    const starts = startsOf(ends);
    const widths: number[] = [];
    const lineChars: number[] = [];
    let begin = 0;
    let penalty = 0;
    for (const end of ends) {
      widths.push((prefix[end] - prefix[begin]) * font);
      lineChars.push(chars[end] - chars[begin]);
      if (begin > 0) penalty += breakPenalty(flat[begin - 1], flat[begin]);
      begin = end;
    }
    // Uniform tracking can only fill up to the widest line; the cap and the widest line bound it.
    let letterPx = Infinity;
    for (let i = 0; i < widths.length; i++) {
      if (lineChars[i] > 0) letterPx = Math.min(letterPx, (width - widths[i]) / lineChars[i]);
    }
    letterPx = clamp(Number.isFinite(letterPx) ? letterPx : 0, 0, maxLetterEm * font);
    const tracked = widths.map((w, i) => w + letterPx * lineChars[i]);
    const maxW = Math.max(...tracked);
    const mean = tracked.reduce((sum, w) => sum + w, 0) / tracked.length;
    const balance = tracked.reduce((sum, w) => sum + Math.abs(w - mean), 0) / tracked.length / width;
    const usedH = lines * font * lineHeight * ruby;
    const fill = clamp(maxW / width, 0, 1) * clamp(usedH / height, 0, 1);
    const comfort = Math.max(0, (COMFORT_FONT_PX - font) / COMFORT_FONT_PX);
    const tooManyLines = Math.max(0, lines - 2) * 0.05;
    // The slider is a floor the user chose: dropping under it costs more than overshooting it.
    const reference = Math.max(1, preferred);
    const prefer =
      (Math.max(0, preferred - font) / reference) * 1.2 + (Math.max(0, font - preferred) / reference) * 0.02;
    const readability = comfort * 0.8 + tooManyLines + penalty + prefer;
    return {
      fontPx: font,
      lineHeight,
      letterSpacingEm: letterPx / font,
      lineStarts: starts,
      score: ALPHA * fill - BETA * balance - GAMMA * readability,
      fill,
    };
  };

  // Line count is the discrete variable: each count yields its own maximum feasible font.
  let best: OptimizeResult | null = null;
  const maxLines = Math.min(MAX_LINES, n);
  for (let lines = Math.max(1, shown); lines <= maxLines; lines++) {
    const required = bottleneck(lines);
    if (required === null) continue;
    const fitted = Math.min(maxFont, width / Math.max(required, 1e-6), height / (lines * minLh * ruby));
    // A fixed output size only drives the break search; it is never shrunk to fit the box.
    const font = fixedFont ?? fitted;
    if (!fixedFont && font < lineFloor) continue;
    const ends = solve(lines, font);
    if (!ends) continue;
    const lineHeight = clamp(height / (lines * font * ruby), minLh, maxLh);
    const candidate = evaluate(lines, ends, font, lineHeight);
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best ?? fallback(input, maxLineWidth, shown);
};
