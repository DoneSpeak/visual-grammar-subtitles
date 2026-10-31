import { afterEach, describe, expect, it, vi } from 'vitest';

import { Theater } from '@/features/overlay/theater';

const box = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const setup = (videoBox: DOMRect, wrapperBox: DOMRect, outerBox: DOMRect) => {
  const outer = document.createElement('div');
  const wrapper = document.createElement('div');
  const video = document.createElement('video');
  wrapper.appendChild(video);
  outer.appendChild(wrapper);
  document.body.appendChild(outer);

  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(videoBox);
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(wrapperBox);
  vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue(outerBox);
  return { outer, wrapper, video };
};

afterEach(() => {
  document.getElementById('jp-theater-style')?.remove();
  document.documentElement.removeAttribute('data-jp-theater-scroll');
  document.documentElement.style.removeProperty('--jp-split-size');
  document.body.replaceChildren();
  document.body.removeAttribute('data-jp-theater-el');
  document.body.removeAttribute('data-jp-theater-scroll');
});

describe('Theater', () => {
  it('lifts the matching player wrapper, not the bare video', () => {
    const { outer, wrapper, video } = setup(box(0, 0, 800, 450), box(0, 0, 800, 450), box(0, 0, 800, 600));
    const theater = new Theater(video);

    expect(theater.toggle()).toBe(true);
    // The whole same-box chain is pinned, so one overridden node cannot defeat the mode.
    expect(wrapper.hasAttribute('data-jp-theater-root')).toBe(true);
    expect(video.hasAttribute('data-jp-theater-root')).toBe(true);
    // Ancestors that could become the containing block for the fixed player are neutralised.
    expect(outer.hasAttribute('data-jp-theater-el')).toBe(true);
    expect(document.documentElement.hasAttribute('data-jp-theater-scroll')).toBe(true);
    expect(document.getElementById('jp-theater-style')).not.toBeNull();

    theater.destroy();
  });

  it('falls back to the video when no ancestor shares its box', () => {
    const { video } = setup(box(0, 0, 800, 450), box(0, 0, 800, 600), box(0, 0, 1000, 900));
    const theater = new Theater(video);

    theater.enter();
    expect(video.hasAttribute('data-jp-theater-root')).toBe(true);

    theater.exit();
  });

  it('restores everything on exit and is idempotent', () => {
    const { outer, wrapper, video } = setup(box(0, 0, 800, 450), box(0, 0, 800, 450), box(0, 0, 800, 600));
    const theater = new Theater(video);

    theater.enter();
    theater.enter();
    expect(document.querySelectorAll('#jp-theater-style')).toHaveLength(1);

    expect(theater.toggle()).toBe(false);
    expect(document.getElementById('jp-theater-style')).toBeNull();
    expect(wrapper.hasAttribute('data-jp-theater-root')).toBe(false);
    expect(video.hasAttribute('data-jp-theater-root')).toBe(false);
    expect(outer.hasAttribute('data-jp-theater-el')).toBe(false);
    expect(document.documentElement.hasAttribute('data-jp-theater-scroll')).toBe(false);

    theater.exit();
    expect(theater.active()).toBe(false);
  });

  it('reserves a transcript strip and survives a re-enter', () => {
    const { wrapper, video } = setup(box(0, 0, 800, 450), box(0, 0, 800, 450), box(0, 0, 800, 600));
    const theater = new Theater(video);

    theater.enter();
    theater.setSplit('side', 380);
    // The video is itself a pinned root; the strip must shrink it, not just its wrapper.
    expect(wrapper.getAttribute('data-jp-theater-split')).toBe('side');
    expect(video.getAttribute('data-jp-theater-split')).toBe('side');
    expect(document.documentElement.style.getPropertyValue('--jp-split-size')).toBe('380px');

    theater.setSplitSize(420);
    expect(document.documentElement.style.getPropertyValue('--jp-split-size')).toBe('420px');

    // sync() exits and re-enters when the player rebuilds; the desired split must come back.
    theater.exit();
    expect(video.hasAttribute('data-jp-theater-split')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--jp-split-size')).toBe('');
    theater.enter();
    expect(video.getAttribute('data-jp-theater-split')).toBe('side');
    expect(document.documentElement.style.getPropertyValue('--jp-split-size')).toBe('420px');

    theater.setSplit(null);
    expect(video.hasAttribute('data-jp-theater-split')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--jp-split-size')).toBe('');

    theater.destroy();
  });
});
