import type { DictEntry } from '@/shared/dictionary';

import type { BandDeclaration, BandSelection } from './types';

/**
 * Dictionary-band helpers.
 *
 * Two questions are asked of a band declaration and they are deliberately not the same:
 *
 * - Is this entry a banded study word? (`entryInBands`) Annotations only ever mark banded words.
 * - May this entry still be looked up? (`entryAllowed`) An entry outside every band stays
 *   interactive — English entries without exam tags, and Japanese words without a JLPT level,
 *   are ordinary words rather than filtered-out ones.
 */

/** Every declared band on, or `{}` for a language that declares none. */
export const defaultBandSelection = (decl?: BandDeclaration): BandSelection =>
  Object.fromEntries((decl?.definitions ?? []).map((band) => [band.id, true]));

/** True when the entry carries at least one band and that band is switched on. */
export const entryInBands = (
  decl: BandDeclaration | undefined,
  entry: DictEntry,
  selection: BandSelection,
): boolean => {
  const ids = decl?.bandsOf(entry) ?? [];
  return ids.length > 0 && ids.some((id) => selection[id] === true);
};

/** True when the entry has no bands at all, or one of its bands is switched on. */
export const entryAllowed = (
  decl: BandDeclaration | undefined,
  entry: DictEntry,
  selection: BandSelection,
): boolean => {
  const ids = decl?.bandsOf(entry) ?? [];
  return ids.length === 0 || ids.some((id) => selection[id] === true);
};
