export type LayerId = 'a' | 'b';

export type Cue = { start: number; end: number; text: string };

export type PosGroup = 'noun' | 'verb' | 'adj' | 'particle' | 'adverb' | 'conjunction' | 'other' | 'symbol';

/** Shared POS skeleton (Universal Dependencies). Language details live in `posRaw`/`posDetail1`. */
export type Pos =
  | 'NOUN'
  | 'PROPN'
  | 'PRON'
  | 'VERB'
  | 'AUX'
  | 'ADJ'
  | 'ADV'
  | 'ADP'
  | 'PART'
  | 'SCONJ'
  | 'CCONJ'
  | 'DET'
  | 'NUM'
  | 'INTJ'
  | 'PUNCT'
  | 'SYM'
  | 'X';

const POS_VALUES = new Set<string>([
  'NOUN', 'PROPN', 'PRON', 'VERB', 'AUX', 'ADJ', 'ADV', 'ADP', 'PART',
  'SCONJ', 'CCONJ', 'DET', 'NUM', 'INTJ', 'PUNCT', 'SYM', 'X',
]);

export const isPos = (value: unknown): value is Pos => typeof value === 'string' && POS_VALUES.has(value);

/** Anything a provider sends that the core does not model degrades to `X`, never to a guess. */
export const normalizePos = (value: unknown): Pos => (isPos(value) ? value : 'X');

export type Token = {
  surface: string;
  pos: Pos;
  /** The tokenizer's own part-of-speech tag; only the language pack reads it. */
  posRaw?: string;
  /** Fine-grained Japanese POS (形容動詞語幹, 非自立…) or the pack's own subclass. */
  posDetail1?: string;
  conjType?: string;
  /** Japanese conjugation form; English keeps tense/voice in `morph` instead. */
  conjForm?: string;
  /** Universal Dependencies morphology: `Tense=Past`, `Voice=Pass`, `Polarity=Neg`… */
  morph?: Record<string, string>;
  /** Lemma. */
  baseForm: string;
  /** Kana reading / IPA, when the language has one to show. */
  reading?: string;
  /** Index into the dictionary entries returned alongside the tokenized line. */
  dictIdx?: number;
  grammar?: string[];
  /** Annotation layer → annotation id. Adjacent tokens share an id when they share a chunk. */
  groups?: Record<string, string>;
  studyProfile?: string;
};

export type LayerCfg = {
  enabled: boolean;
  displayCapMs: number; // 0 = full cue duration
  /** Anchor for `displayCapMs`: false = counts from cue start (look, then listen); true = the cue
   *  stays hidden until its last `displayCapMs` (listen, then look). */
  displayCapFromEnd: boolean;
  // Rendered font size as a fraction of picture height. Fixed output: every cue paints at this
  // size; a resize drag computes it once and writes it back here.
  fontScale: number;
  maxWidth: number; // container width as a fraction of picture width; text wraps inside it
  colorize: boolean;
  furigana: boolean;
  anchorX: number; // 0..1 of picture width
  anchorY: number; // 0..1 of picture height
  opacity: number;
};

export type SubSource = { name: string; text: string };

/** A baked-in ad insertion: `at` is on the subtitle timeline, `duration` the seconds it occupies. */
export type AdSlot = { at: number; duration: number };

/** Built-in resolvers for sites whose URL alone does not identify the series or episode. */
export type SiteAdapterId = 'bilibili';

export type SiteRule = {
  id: string;
  name: string;
  enabled: boolean;
  // e.g. "https://*" + "/cid/<id>-<season>-<episode>.html"; "*" matches any run of non-separator chars.
  urlTemplate: string;
  // Optional subtitle file-name template, e.g. "* - <episode> [*]"; empty = builtin heuristics.
  fileTemplate: string;
  /** Per-series ad slots, keyed by the `<id>` capture; derived from the episodes' own marks. */
  seriesAdSlots: Record<string, AdSlot[]>;
  /** Per-episode ad slots, keyed by `adEpisodeKey`; replaces the series defaults. */
  episodeAdSlots: Record<string, AdSlot[]>;
  /** Per-series seconds the skip shortcut adds and records; missing = `DEFAULT_AD_DURATION`. */
  seriesAdDuration: Record<string, number>;
  /** Enabled on built-in rules only: fills in series id / title / episode the URL does not carry. */
  adapter?: SiteAdapterId;
};

export type SiteRules = {
  /** 1 = URL templates only; 2 adds the built-in bilibili adapter rule. */
  version: 2;
  rules: SiteRule[];
  /** `<ruleId>#<seriesId>` (or `#*`) → library pack id. */
  binds: Record<string, string>;
};

export type UrlParts = { id: string | null; season: string | null; episode: number | null };

export type PageCfg = {
  offset: number; // seconds; subtitles are scheduled at videoTime - offset (positive = subtitles later)
  subs: { a: SubSource; b: SubSource };
  layers: { a: LayerCfg; b: LayerCfg };
  /** How the transcript was last shown: floating over the picture, or a split strip. */
  transcriptSplit?: 'overlay' | 'side' | 'bottom';
  /** Divider size in CSS px (width for `side`, height for `bottom`), per direction. */
  transcriptSide?: number;
  transcriptBottom?: number;
};

export const defaultLayer = (overrides: Partial<LayerCfg> = {}): LayerCfg => ({
  enabled: true,
  displayCapMs: 0,
  displayCapFromEnd: false,
  fontScale: 0.038,
  maxWidth: 0.92,
  colorize: true,
  furigana: true,
  anchorX: 0.5,
  anchorY: 0.9,
  opacity: 1,
  ...overrides,
});

export const defaultPageCfg = (): PageCfg => ({
  offset: 0,
  subs: { a: { name: '', text: '' }, b: { name: '', text: '' } },
  layers: {
    a: defaultLayer(),
    b: defaultLayer({ enabled: false, displayCapMs: 500, colorize: false, furigana: false, anchorY: 0.82 }),
  },
});