/**
 * Split layout math for the transcript: the player is pinned to one side of the viewport and the
 * transcript takes the rest. Kept pure so the clamps are testable without a browser.
 *
 * The video element must stay above `isCandidate`'s floor (see video.ts), otherwise `watchVideos`
 * decides the player is gone and tears the whole session down — a split that is one pixel too wide
 * would therefore close the subtitles it was opened for.
 */

import { MIN_HEIGHT, MIN_WIDTH } from './video';

export type SplitMode = 'side' | 'bottom';

/** A readable transcript column; matches the overlay drawer's old width. */
const SIDE_DEFAULT = 380;
/** Share of the viewport the transcript takes when split along the bottom. */
const BOTTOM_RATIO = 0.38;

const MIN_STRIP: Record<SplitMode, number> = { side: 240, bottom: 120 };

export const defaultSplitSize = (mode: SplitMode, _viewportWidth: number, viewportHeight: number): number =>
  mode === 'side' ? SIDE_DEFAULT : Math.round(viewportHeight * BOTTOM_RATIO);

/** Largest strip that still leaves a candidate-sized video element. */
export const maxSplitSize = (mode: SplitMode, viewportWidth: number, viewportHeight: number): number =>
  mode === 'side' ? viewportWidth - MIN_WIDTH : viewportHeight - MIN_HEIGHT;

/** False when the viewport cannot hold both a candidate-sized video and a usable strip. */
export const canSplit = (mode: SplitMode, viewportWidth: number, viewportHeight: number): boolean =>
  maxSplitSize(mode, viewportWidth, viewportHeight) >= MIN_STRIP[mode];

/** Clamps a dragged size into `[MIN_STRIP, maxSplitSize]`; callers check `canSplit` first. */
export const clampSplitSize = (
  mode: SplitMode,
  size: number,
  viewportWidth: number,
  viewportHeight: number,
): number =>
  Math.round(
    Math.min(maxSplitSize(mode, viewportWidth, viewportHeight), Math.max(MIN_STRIP[mode], size)),
  );
