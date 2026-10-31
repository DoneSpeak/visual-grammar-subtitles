import type { Cue } from '@/shared/types';

export class Timeline {
  cues: Cue[] = [];

  setCues(cues: Cue[]): void {
    this.cues = cues;
  }

  /** The cue covering t, or null. Cues may overlap; the latest-started covering cue wins. */
  cueAt(t: number): Cue | null {
    let i = this.indexAt(t);
    while (i >= 0 && this.cues[i].end < t) i--;
    return i >= 0 ? this.cues[i] : null;
  }

  /** Index of the last cue starting at or before t, or -1. */
  private indexAt(t: number): number {
    const { cues } = this;
    let lo = 0;
    let hi = cues.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }
}