/**
 * "Theater mode": lift the player out of the page flow and pin it to the viewport.
 *
 * The video itself is rarely enough — sites render their control bar, gradients and overlays as
 * siblings inside a player wrapper. So every element in the contiguous chain that shares the
 * video's box is lifted: the player wrapper and the video together. Marking the whole chain is
 * deliberate; one element being overridden by the site's own !important rules must not defeat
 * the mode.
 *
 * Implemented as an injected style sheet keyed by data attributes rather than inline styles:
 * SPA players rewrite `element.style` on every render, and inline values lose that race.
 *
 * Framed players (doodstream/filemoon-style embeds) cannot fill the page from inside their own
 * document; the frame asks the top window to lift the `<iframe>` itself.
 */

const ROOT_ATTR = 'data-jp-theater-root';
const ANCESTOR_ATTR = 'data-jp-theater-el';
const SCROLL_ATTR = 'data-jp-theater-scroll';
const STYLE_ID = 'jp-theater-style';
const FRAME_MESSAGE = 'jp-sub-theater';

/** Above page content, below the subtitle overlay host (2147483646). */
const LAYER_Z = 2147483645;

/** Sub-pixel layout differences between the video and its wrapper are normal. */
const RECT_TOLERANCE = 2;

const CSS = `
[${ROOT_ATTR}] {
  position: fixed !important;
  inset: 0 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  z-index: ${LAYER_Z} !important;
  background: #000 !important;
  object-fit: contain !important;
  /* A transform/filter on the lifted node would offset or scale it away from the viewport. */
  transform: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  perspective: none !important;
  will-change: auto !important;
  contain: none !important;
  isolation: auto !important;
}
[${ROOT_ATTR}] video {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: contain !important;
}
/* These properties turn an ancestor into the containing block for fixed descendants (or clip
   them), which would keep the lifted player inside its old box instead of the viewport. */
[${ANCESTOR_ATTR}] {
  transform: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  perspective: none !important;
  will-change: auto !important;
  contain: none !important;
  isolation: auto !important;
}
html[${SCROLL_ATTR}], body[${SCROLL_ATTR}] {
  overflow: hidden !important;
  transform: none !important;
  filter: none !important;
  contain: none !important;
}
`;

const sameBox = (a: DOMRect, b: DOMRect): boolean =>
  a.width > 0 &&
  a.height > 0 &&
  Math.abs(a.left - b.left) <= RECT_TOLERANCE &&
  Math.abs(a.top - b.top) <= RECT_TOLERANCE &&
  Math.abs(a.width - b.width) <= RECT_TOLERANCE &&
  Math.abs(a.height - b.height) <= RECT_TOLERANCE;

/** The video plus every contiguous ancestor that currently shares its box. */
const sameBoxChain = (video: HTMLVideoElement): HTMLElement[] => {
  const box = video.getBoundingClientRect();
  const chain: HTMLElement[] = [video];
  for (
    let node = video.parentElement;
    node && node !== document.body && node !== document.documentElement;
    node = node.parentElement
  ) {
    if (!sameBox(node.getBoundingClientRect(), box)) break;
    chain.push(node);
  }
  return chain;
};

const isFramed = (): boolean => {
  try {
    return window.top !== null && window.top !== window;
  } catch {
    return true;
  }
};

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.documentElement.appendChild(style);
};

const lockScroll = (): void => {
  document.documentElement.setAttribute(SCROLL_ATTR, '');
  document.body?.setAttribute(SCROLL_ATTR, '');
};

const unlockScrollIfUnused = (): void => {
  if (document.querySelector(`[${ROOT_ATTR}]`)) return;
  document.documentElement.removeAttribute(SCROLL_ATTR);
  document.body?.removeAttribute(SCROLL_ATTR);
};

/** Shared sheet: the frame bridge and a local player can be active in the same document. */
const removeStyleIfUnused = (): void => {
  if (document.querySelector(`[${ROOT_ATTR}]`)) return;
  document.getElementById(STYLE_ID)?.remove();
};

export class Theater {
  private roots: HTMLElement[] = [];
  private ancestors: HTMLElement[] = [];
  private on = false;

  constructor(private readonly video: HTMLVideoElement) {}

  active(): boolean {
    return this.on;
  }

  toggle(): boolean {
    if (this.on) this.exit();
    else this.enter();
    return this.on;
  }

  enter(): void {
    if (this.on || !this.video.isConnected) return;
    const chain = sameBoxChain(this.video);
    ensureStyle();

    for (const node of chain) {
      node.setAttribute(ROOT_ATTR, '');
      this.roots.push(node);
    }
    const top = chain[chain.length - 1];
    for (let node = top.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      node.setAttribute(ANCESTOR_ATTR, '');
      this.ancestors.push(node);
    }
    lockScroll();

    this.on = true;
    // Lifting the iframe is the top window's job; inside it we can only fill our own viewport.
    if (isFramed()) this.postToTop(true);
  }

  exit(): void {
    if (!this.on) return;
    for (const node of this.roots) node.removeAttribute(ROOT_ATTR);
    for (const node of this.ancestors) node.removeAttribute(ANCESTOR_ATTR);
    unlockScrollIfUnused();
    removeStyleIfUnused();
    this.roots = [];
    this.ancestors = [];
    this.on = false;
    if (isFramed()) this.postToTop(false);
  }

  destroy(): void {
    this.exit();
  }

  /**
   * Players rebuild their DOM on resize (the mode itself changes the size), which would strip
   * the marker from the moved nodes and leave an "active" toggle with nothing pinned. Cheap
   * enough to check every playback frame.
   */
  sync(): void {
    if (!this.on) return;
    if (!this.video.isConnected) {
      this.exit();
      return;
    }
    if (this.video.hasAttribute(ROOT_ATTR)) return;
    this.exit();
    this.enter();
  }

  diagnose(): Record<string, unknown> {
    const rect = this.video.getBoundingClientRect();
    return {
      active: this.on,
      framed: isFramed(),
      roots: this.roots.map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`),
      video: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
      viewport: [window.innerWidth, window.innerHeight],
    };
  }

  private postToTop(active: boolean): void {
    try {
      window.top?.postMessage({ type: FRAME_MESSAGE, active }, '*');
    } catch {
      // Cross-origin isolation can reject the call; the local expansion already applied.
    }
  }
}

/**
 * Top-window half of the framed player: a frame that enters theater asks its host to lift the
 * `<iframe>` element to the viewport. Runs in every content-script frame; the host page's
 * documents without frames simply never receive the message.
 */
export const installFrameTheater = (): (() => void) => {
  const lifted = new Set<HTMLIFrameElement>();

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { type?: string; active?: boolean } | null;
    if (!data || data.type !== FRAME_MESSAGE) return;
    const frame = [...document.querySelectorAll('iframe')].find((item) => item.contentWindow === event.source);
    if (!frame) return;

    if (data.active) {
      ensureStyle();
      frame.setAttribute(ROOT_ATTR, '');
      lockScroll();
      lifted.add(frame);
      return;
    }

    frame.removeAttribute(ROOT_ATTR);
    lifted.delete(frame);
    unlockScrollIfUnused();
    removeStyleIfUnused();
  };

  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('message', onMessage);
    for (const frame of lifted) frame.removeAttribute(ROOT_ATTR);
    lifted.clear();
    removeStyleIfUnused();
  };
};
