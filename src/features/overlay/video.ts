export type PictureRect = { left: number; top: number; width: number; height: number };

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 180;
/** Ancestor levels searched for a wrapping link; feed cards nest the preview this deep. */
const LINK_DEPTH = 8;

/** A video inside a link is a feed/thumbnail preview the user has not opened, not a player. */
const insideLink = (video: HTMLVideoElement): boolean => {
  let node: HTMLElement | null = video.parentElement;
  for (let depth = 0; node && depth < LINK_DEPTH; depth += 1, node = node.parentElement) {
    if (node.tagName === 'A') return true;
  }
  return false;
};

export const isCandidate = (video: HTMLVideoElement): boolean => {
  const rect = video.getBoundingClientRect();
  if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return false;
  const style = getComputedStyle(video);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return !insideLink(video);
};

export const videoArea = (video: HTMLVideoElement): number => {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
};

/** Rect of the actual picture inside the element (strips letterbox bars when object-fit is contain). */
export const pictureRect = (video: HTMLVideoElement): PictureRect => {
  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const fit = getComputedStyle(video).objectFit;
  if (!vw || !vh || fit === 'cover' || fit === 'fill') {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const width = vw * scale;
  const height = vh * scale;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
};

export const findBestVideo = (): HTMLVideoElement | null => {
  const candidates = [...document.querySelectorAll('video')].filter(isCandidate);
  if (!candidates.length) return null;
  return candidates.reduce((best, v) => (videoArea(v) > videoArea(best) ? v : best));
};

export const watchVideos = (onChange: (video: HTMLVideoElement | null) => void): () => void => {
  let last: HTMLVideoElement | null = null;
  let timer: number | undefined;
  const check = () => {
    timer = undefined;
    const best = findBestVideo();
    if (best === last) return;
    // A player plus a competing preview swap size order as they play; without hysteresis the
    // overlay would be torn down and rebuilt (panel state lost) on every tick.
    if (best && last && last.isConnected && isCandidate(last) && videoArea(best) < videoArea(last) * 1.25) return;
    last = best;
    onChange(best);
  };
  const queue = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(check, 250);
  };
  const observer = new MutationObserver(queue);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const interval = setInterval(check, 1500);
  const onResize = queue;
  window.addEventListener('resize', onResize);
  check();
  return () => {
    observer.disconnect();
    clearInterval(interval);
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('resize', onResize);
  };
};