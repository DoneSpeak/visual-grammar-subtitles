import type { DictEntry } from '@/shared/dictionary';
import type { MessageKey } from '@/shared/i18n';
import type { FeatureId, FeatureRegistry } from '@/shared/studyFeatures';
import type { Pos, PosGroup, Token } from '@/shared/types';

/**
 * The language seam.
 *
 * Everything below `Cue` parsing, timing, overlay geometry, element-style merging and caching is
 * language-neutral; a pack is the only place a language's own rules live. Packs are plain objects
 * with no chrome/React/kuromoji imports, so the registry can be imported from any context.
 */

export type LanguageId = string;

/**
 * Index over a language's bundled dictionary entries.
 *
 * `find` returns an index into the same entries array the pack was built from; `entry` returns
 * that entry unchanged. Packs own both the lookup keys and the ranking, so the core never needs
 * to know how a language writes its headwords.
 */
export type Lexicon = { find(token: Token): number | undefined; entry(index: number): DictEntry };

/** Minimal line-tokenizer contract; heavy dependencies stay inside `<lang>/tokenizer.ts`. */
export type Tokenizer = { tokenize(text: string): Token[] };

/** Reading split for ruby: `prefix`/`suffix` stay plain text, `base` gets `ruby` above it. */
export type RubySplit = { prefix: string; base: string; ruby: string; suffix: string };

export type BreakHints = { noLineStart?: boolean; noLineEnd?: boolean };

/** Which bands are switched on. Keys are band ids, so a language can use any vocabulary. */
export type BandSelection = Record<string, boolean>;

export type BandDefinition = {
  /** Persisted in dictionary settings; Japanese uses `'1'..'5'`, English uses its exam tags. */
  id: string;
  /** Shown in the options page and popup. Exam tags read the same in every UI locale. */
  label: string;
};

/**
 * A language's dictionary bands.
 *
 * Japanese has one band per entry (JLPT level); English entries carry several tags at once, so
 * membership is a list. An entry with no bands is never filtered out and never tagged as a study
 * word — the two call sites use `entryHasBands` / `entryInBands` to keep that distinction.
 */
export type BandDeclaration = {
  definitions: readonly BandDefinition[];
  bandsOf(entry: DictEntry): readonly string[];
};

/** Line-breaking rules: segmenter locale and what may not start or end a line. */
export type TextRules = {
  locale: string;
  /** Split a string into unbreakable units when no tokenized line is available. */
  segment(text: string): string[];
  classifyBreak(text: string): BreakHints;
};

export type Presentation = {
  reading: {
    /** How the pack shows pronunciation: ruby above the word, inline, or not at all. */
    layout: 'ruby' | 'inline' | 'hidden';
    /** Null when this token has nothing to show above the base text. */
    align(surface: string, reading: string): RubySplit | null;
  };
};

/** Local annotations shared by the renderer: chunk groups, fixed expressions, study bands. */
export type Annotators = {
  chunks(tokens: Token[]): Token[];
  expressions(tokens: Token[]): Token[];
  levels(tokens: Token[], entries: DictEntry[], bands: BandSelection): Token[];
  /** Applies the annotators the given features ask for. */
  local(
    tokens: Token[],
    entries: DictEntry[],
    bands: BandSelection,
    features: FeatureId[],
  ): Token[];
};

export type LanguagePack = {
  id: LanguageId;
  /** Short code shown next to the layer's subtitle name. */
  shortLabel: string;
  displayName: string;
  /** 0..1 script-based confidence; the registry picks the highest score above its threshold. */
  detect(text: string): number;
  /** The tokenizer's native tag → the shared POS skeleton. */
  toPos(raw: string): Pos;
  posGroup(token: Token): PosGroup;
  isInflected(token: Token): boolean;
  /** POS values that carry no dictionary meaning (particles, auxiliaries, punctuation). */
  functionWords: ReadonlySet<string>;
  /** Dictionary lookup candidates for a token, highest priority first. */
  lookupKeys(token: Token): string[];
  annotators: Annotators;
  text: TextRules;
  presentation: Presentation;
  /** Study layers this language can produce, plus its built-in modes. Absent for `plain`. */
  features?: FeatureRegistry;
  /** Dictionary bands the UI may filter by. Absent when the language has none (or no lexicon). */
  bands?: BandDeclaration;
  /**
   * Where this language's word list comes from, shown under the bands page. A message key, not
   * text: the pack declares its sources but never its copy. Absent when there is no lexicon.
   */
  dictAttribution?: MessageKey;
};
