import { describe, expect, it } from 'vitest';

import { canSplit, clampSplitSize, defaultSplitSize } from '@/features/overlay/split';

describe('transcript split math', () => {
  it('defaults to a readable column and a share of the viewport height', () => {
    expect(defaultSplitSize('side', 1280, 720)).toBe(380);
    expect(defaultSplitSize('bottom', 1280, 720)).toBe(274);
  });

  it('never shrinks the video below the player-candidate floor', () => {
    // 320px wide / 180px tall is what video.ts needs to keep recognising the player.
    expect(clampSplitSize('side', 5000, 1280, 720)).toBe(960);
    expect(clampSplitSize('bottom', 5000, 1280, 720)).toBe(540);
    expect(clampSplitSize('side', 10, 1280, 720)).toBe(240);
    expect(clampSplitSize('bottom', 10, 1280, 720)).toBe(120);
  });

  it('refuses a split the viewport cannot hold', () => {
    expect(canSplit('side', 1280, 720)).toBe(true);
    expect(canSplit('side', 500, 720)).toBe(false);
    expect(canSplit('bottom', 1280, 280)).toBe(false);
    expect(canSplit('bottom', 1280, 300)).toBe(true);
  });
});
