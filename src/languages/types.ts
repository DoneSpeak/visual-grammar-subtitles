import type { DictEntry } from '@/shared/dictionary';
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

/** Reading split for ruby: `prefix`/`suffix` stay plain text, `base` gets `ruby` above it. */
export type RubySplit = { prefix: string; base: string; ruby: string; suffix: string };

export type BreakHints = { noLineStart?: boolean; noLineEnd?: boolean };

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
  levels(tokens: Token[], entries: DictEntry[], levels: Record<number, boolean>): Token[];
  /** Applies the annotators the given features ask for. */
  local(
    tokens: Token[],
    entries: DictEntry[],
    levels: Record<number, boolean>,
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
};
