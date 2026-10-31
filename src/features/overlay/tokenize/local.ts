import { DEFAULT_LANGUAGE, resolveLanguage } from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import type { FeatureId } from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';

/**
 * Local annotations, dispatched through the layer's language pack.
 *
 * Language defaults to Japanese so existing callers (and the golden tests) keep their shape; the
 * content script passes the layer's own language so two layers can annotate different languages.
 */

export const annotateChunks = (tokens: Token[], language: LanguageId = DEFAULT_LANGUAGE): Token[] =>
  resolveLanguage(language).annotators.chunks(tokens);

export const annotateExpressions = (tokens: Token[], language: LanguageId = DEFAULT_LANGUAGE): Token[] =>
  resolveLanguage(language).annotators.expressions(tokens);

export const annotateLevels = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
  language: LanguageId = DEFAULT_LANGUAGE,
): Token[] => resolveLanguage(language).annotators.levels(tokens, entries, bands);

export const annotateLocal = (
  tokens: Token[],
  entries: DictEntry[],
  bands: BandSelection,
  features: FeatureId[],
  language: LanguageId = DEFAULT_LANGUAGE,
): Token[] => resolveLanguage(language).annotators.local(tokens, entries, bands, features);
