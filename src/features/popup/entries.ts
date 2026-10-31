import type { LibraryEntry } from '@/shared/library';
import { describeSubtitles } from '@/shared/subtitleLabel';

export type LabelledEntry = { entry: LibraryEntry; label: string; ep: number };

/**
 * Episode order first, then natural filename order. Labels come from the pack as a
 * whole because affix trimming and episode padding depend on its sibling files.
 */
export const orderEntries = (entries: LibraryEntry[]): LabelledEntry[] => {
  const labels = describeSubtitles(entries.map((entry) => entry.name));
  return entries
    .map((entry) => {
      const parsed = labels.get(entry.name);
      return {
        entry,
        label: parsed?.label ?? entry.name,
        ep: parsed?.ep ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.ep - b.ep || a.entry.name.localeCompare(b.entry.name, undefined, { numeric: true }));
};
