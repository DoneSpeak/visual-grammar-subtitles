import { ja } from '@/languages/ja';
import type { DictEntry } from '@/shared/dictionary';
import type { FeatureId } from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';

/**
 * Local annotations, dispatched through the language pack.
 *
 * Until the layer carries its own language (P4), every subtitle is Japanese; the call sites keep
 * their current shape so switching to `pack.annotators.local` is a parameter change, not a move.
 */

export const annotateChunks = (tokens: Token[]): Token[] => ja.annotators.chunks(tokens);

export const annotateExpressions = (tokens: Token[]): Token[] => ja.annotators.expressions(tokens);

export const annotateLevels = (
  tokens: Token[],
  entries: DictEntry[],
  levels: Record<number, boolean>,
): Token[] => ja.annotators.levels(tokens, entries, levels);

export const annotateLocal = (
  tokens: Token[],
  entries: DictEntry[],
  levels: Record<number, boolean>,
  features: FeatureId[],
): Token[] => ja.annotators.local(tokens, entries, levels, features);
