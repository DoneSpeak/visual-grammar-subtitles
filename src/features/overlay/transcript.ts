import { featuresFor } from '@/languages/registry';
import type { DictEntry, DictLine } from '@/shared/dictionary';
import { createIcon, type IconName } from '@/shared/icons';
import { t, type MessageKey } from '@/shared/i18n';
import { presetElements, type StudyPreset } from '@/shared/subtitleStyle';
import type { Cue } from '@/shared/types';
import { clampSplitSize, type SplitMode } from './split';
import { renderTokens, type DictRender } from './tokenize/render';

/** `overlay` keeps the drawer on top of the picture; the split modes give it its own strip. */
export type TranscriptLayout = 'overlay' | SplitMode;

/** Header buttons, in the order they are shown. */
const TRANSCRIPT_MODES: readonly { layout: TranscriptLayout; icon: IconName; label: MessageKey }[] = [
  { layout: 'overlay', icon: 'layers', label: 'overlay.transcript.modeOverlay' },
  { layout: 'side', icon: 'columns', label: 'overlay.transcript.modeSide' },
  { layout: 'bottom', icon: 'rows', label: 'overlay.transcript.modeBottom' },
];

/** One cue, ready to paint. `tokensReady` / `dictReady` tell the panel whether a re-render is pending. */
export type TranscriptRender = {
  lines: string[];
  rows: (DictLine | null)[];
  preset: StudyPreset;
  tokensReady: boolean;
  dictReady: boolean;
};

export type TranscriptOptions = {
  colorize: boolean;
  furigana: boolean;
  dict: DictRender;
  /** Language of layer A, since the transcript mirrors that layer. */
  language: string;
};

export type TranscriptSource = {
  render(cue: Cue): TranscriptRender;
  /** Resolve whatever `render` is missing; `done` fires when a repeat call would be complete. */
  prime(cue: Cue, done: () => void): void;
  options(): TranscriptOptions;
};

export type TranscriptHooks = {
  onSeek: (cue: Cue) => void;
  /** Let the overlay resolve `data-dict-idx` on this line's word spans. */
  onLine: (line: HTMLElement, entries: DictEntry[]) => void;
  onClose: () => void;
  /** The header's layout buttons; `layout` is the one the user picked. */
  onLayout: (layout: TranscriptLayout) => void;
  /** Divider drag in progress; the host shrinks the player to match. */
  onResize: (size: number) => void;
  /** Divider released; persist the size. */
  onResizeEnd: (size: number) => void;
};

export const TRANSCRIPT_CSS = `
.transcript { position: absolute; right: 8px; top: 42px; bottom: 8px; z-index: 2; display: flex; flex-direction: column; box-sizing: border-box; width: min(360px, 92%); overflow: hidden; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(18,20,26,.94); color: #e8eaed; font-size: 13px; pointer-events: auto; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
.transcript[hidden] { display: none; }
/* Split layout: the player is pinned to the rest of the viewport, the transcript owns this strip.
   Fixed positioning resolves against the viewport because no ancestor sets a transform. */
.transcript.tx-side { position: fixed; top: 0; right: 0; bottom: 0; left: auto; width: var(--jp-transcript-size, 380px); height: auto; max-width: none; border-radius: 10px 0 0 10px; border-width: 1px 0 1px 1px; }
.transcript.tx-bottom { position: fixed; top: auto; right: 0; bottom: 0; left: 0; width: auto; height: var(--jp-transcript-size, 38vh); max-width: none; border-radius: 10px 10px 0 0; border-width: 1px 1px 0 1px; }
/* Divider on the inner edge; only meaningful while split. */
.transcript .tx-grip { position: absolute; z-index: 3; pointer-events: auto; touch-action: none; user-select: none; }
.transcript:not(.tx-side):not(.tx-bottom) .tx-grip { display: none; }
.transcript.tx-side .tx-grip { left: 0; top: 0; bottom: 0; width: 10px; cursor: col-resize; }
.transcript.tx-bottom .tx-grip { top: 0; left: 0; right: 0; height: 10px; cursor: row-resize; }
.transcript .tx-grip::after { content: ''; position: absolute; border-radius: 2px; background: rgba(255,255,255,.18); opacity: 0; transition: opacity 120ms; }
.transcript .tx-grip:hover::after, .transcript.resizing .tx-grip::after { opacity: 1; }
.transcript.tx-side .tx-grip::after { left: 4px; top: 50%; width: 2px; height: 32px; margin-top: -16px; }
.transcript.tx-bottom .tx-grip::after { top: 4px; left: 50%; width: 32px; height: 2px; margin-left: -16px; }
.transcript.resizing { user-select: none; }
.transcript .tx-head { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; padding: 7px 8px 7px 12px; border-bottom: 1px solid rgba(255,255,255,.1); font-size: 12px; font-weight: 600; }
.transcript .tx-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85; }
.transcript .tx-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: rgba(232,234,237,.6); cursor: pointer; }
.transcript .tx-close:hover { background: rgba(255,255,255,.1); color: #e8eaed; }
/* Layout picker: all three modes visible, the current one pressed. */
.transcript .tx-modes { display: flex; gap: 2px; margin-right: 2px; }
.transcript .tx-close.active { background: rgba(127,211,255,.18); color: #7FD3FF; }
.transcript .tx-close svg { width: 12px; height: 12px; display: block; }
.transcript .tx-list { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 6px 10px; }
.transcript .tx-list::-webkit-scrollbar { width: 8px; }
.transcript .tx-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.28); border-radius: 4px; }
.transcript .tx-list::-webkit-scrollbar-track { background: transparent; }
.transcript .tx-empty { padding: 18px 8px; text-align: center; font-size: 12px; line-height: 1.5; opacity: .55; }
.transcript .tx-empty[hidden] { display: none; }
.transcript .tx-row { display: flex; gap: 8px; padding: 5px 6px; border-radius: 6px; cursor: pointer; line-height: 1.6; }
.transcript .tx-row:hover { background: rgba(255,255,255,.06); }
.transcript .tx-row.active { background: rgba(127,211,255,.14); box-shadow: inset 2px 0 0 #7FD3FF; }
.transcript .tx-row:focus-visible { outline: 1px solid #7FD3FF; outline-offset: -1px; }
.transcript .tx-time { flex: 0 0 42px; align-self: flex-start; padding: 1px 0 0; border: 0; background: transparent; color: rgba(232,234,237,.45); font-size: 11px; font-variant-numeric: tabular-nums; text-align: left; cursor: pointer; }
.transcript .tx-row:hover .tx-time { color: rgba(232,234,237,.8); }
.transcript .tx-row.active .tx-time { color: #7FD3FF; }
.transcript .tx-body { flex: 1; min-width: 0; }
.transcript .tx-line { white-space: pre-wrap; overflow-wrap: anywhere; }
.transcript .tx-line + .tx-line { margin-top: 2px; }
.transcript .tx-line rt { font-size: 0.48em; color: rgba(232,234,237,.62); font-weight: 500; letter-spacing: .02em; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmtClock = (seconds: number): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** How long a manual scroll suppresses auto-follow; long enough to read an earlier exchange. */
const FOLLOW_PAUSE_MS = 2500;

/**
 * Full-transcript drawer: one row per cue, painted with the same tokenizer/annotator as the
 * on-video subtitle layer. Rows tokenize lazily as they scroll into view, so opening a 3000-cue
 * track does not build a token span for every word up front.
 */
export class TranscriptPanel {
  private readonly head: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private readonly grip: HTMLDivElement;
  private readonly observer: IntersectionObserver;
  private layoutMode: TranscriptLayout = 'overlay';
  /** Current strip size in CSS px; 0 while the drawer still overlays the picture. */
  private size = 0;
  private cues: Cue[] = [];
  private rows: HTMLDivElement[] = [];
  /** Rows already painted (possibly still waiting for tokens). */
  private painted = new Set<number>();
  /** Rows waiting on `prime`, so the observer cannot start a second round trip. */
  private pending = new Set<number>();
  private activeCue: Cue | null = null;
  private activeIndex = -1;
  private openState = false;
  private dirty = true;
  private lastUserScroll = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly source: TranscriptSource,
    private readonly hooks: TranscriptHooks,
  ) {
    this.head = el('div', 'tx-head');
    this.list = el('div', 'tx-list');
    this.empty = el('div', 'tx-empty');
    this.grip = el('div', 'tx-grip');
    this.grip.addEventListener('pointerdown', this.startGrip);
    this.root.append(this.head, this.list, this.grip);
    this.relabel();

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.paint(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root: this.list, rootMargin: '400px 0px' },
    );
    this.list.addEventListener('wheel', this.noteUserScroll, { passive: true });
    this.list.addEventListener('pointerdown', this.noteUserScroll);
    this.list.addEventListener('touchstart', this.noteUserScroll, { passive: true });
  }

  /** Rebuilds the chrome strings after an in-app language change. */
  relabel(): void {
    this.head.textContent = '';
    this.head.append(el('span', 'tx-title', t('overlay.transcript.title')));
    // All three layouts stay on screen, the current one pressed, so switching is one click.
    const modes = el('div', 'tx-modes');
    for (const item of TRANSCRIPT_MODES) {
      const active = item.layout === this.layoutMode;
      const button = el('button', 'tx-close tx-mode');
      button.type = 'button';
      button.title = t(item.label);
      button.setAttribute('aria-label', t(item.label));
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
      button.appendChild(createIcon(item.icon));
      button.addEventListener('click', () => this.hooks.onLayout(item.layout));
      modes.appendChild(button);
    }
    this.head.appendChild(modes);
    const close = el('button', 'tx-close');
    close.type = 'button';
    close.title = t('overlay.transcript.close');
    close.setAttribute('aria-label', t('overlay.transcript.close'));
    close.appendChild(createIcon('close'));
    close.addEventListener('click', () => this.hooks.onClose());
    this.head.appendChild(close);
    this.grip.title = t('overlay.transcript.resize');
    this.empty.textContent = t('overlay.transcript.empty');
  }

  /** `overlay` keeps the drawer on the picture; `side` / `bottom` reserve a viewport strip. */
  setLayout(layout: TranscriptLayout, size = 0): void {
    this.layoutMode = layout;
    this.root.classList.toggle('tx-side', layout === 'side');
    this.root.classList.toggle('tx-bottom', layout === 'bottom');
    if (size > 0) this.setSize(size);
    this.relabel();
  }

  getLayout(): TranscriptLayout {
    return this.layoutMode;
  }

  setSize(size: number): void {
    this.size = Math.max(0, Math.round(size));
    if (this.size > 0) this.root.style.setProperty('--jp-transcript-size', `${this.size}px`);
    else this.root.style.removeProperty('--jp-transcript-size');
  }

  isOpen(): boolean {
    return this.openState;
  }

  setOpen(open: boolean): void {
    this.openState = open;
    this.root.hidden = !open;
    if (!open) return;
    if (this.dirty) this.rebuild();
    this.syncActive();
  }

  setCues(cues: Cue[]): void {
    if (cues === this.cues) return;
    this.cues = cues;
    this.dirty = true;
    this.painted.clear();
    this.pending.clear();
    this.observer.disconnect();
    this.rows = [];
    this.activeIndex = -1;
    this.list.textContent = '';
    this.empty.hidden = cues.length > 0;
    this.list.appendChild(this.empty);
    if (this.openState) this.rebuild();
  }

  setActive(cue: Cue | null): void {
    if (cue === this.activeCue) return;
    this.activeCue = cue;
    this.syncActive();
  }

  /** Re-paint every row already on screen, e.g. after the study preset or dictionary settings change. */
  refresh(): void {
    this.relabel();
    for (const index of [...this.painted]) {
      this.painted.delete(index);
      this.paint(index);
    }
  }

  destroy(): void {
    this.observer.disconnect();
    this.list.removeEventListener('wheel', this.noteUserScroll);
    this.list.removeEventListener('pointerdown', this.noteUserScroll);
    this.list.removeEventListener('touchstart', this.noteUserScroll);
  }

  private noteUserScroll = (): void => {
    this.lastUserScroll = performance.now();
  };

  /**
   * Divider drag. Each move resizes both the panel and the pinned player, which reflows the
   * subtitle layout, so pointer events are coalesced to one write per frame.
   */
  private startGrip = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const mode = this.layoutMode;
    if (mode !== 'side' && mode !== 'bottom') return;
    // The grip sits inside a row that seeks on click and the host stops pointer events from
    // reaching the page, so the drag must be claimed here.
    event.preventDefault();
    event.stopPropagation();
    const grip = this.grip;
    grip.setPointerCapture(event.pointerId);
    this.root.classList.add('resizing');
    let size = this.size;
    let last = event;
    let raf = 0;
    const apply = (): void => {
      raf = 0;
      const raw = mode === 'side' ? window.innerWidth - last.clientX : window.innerHeight - last.clientY;
      size = clampSplitSize(mode, raw, window.innerWidth, window.innerHeight);
      this.setSize(size);
      this.hooks.onResize(size);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== event.pointerId) return;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const finish = (e: PointerEvent): void => {
      if (e.pointerId !== event.pointerId) return;
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = e;
      apply();
      this.root.classList.remove('resizing');
      this.hooks.onResizeEnd(size);
      if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  };

  private rebuild(): void {
    this.observer.disconnect();
    this.list.textContent = '';
    this.rows = [];
    this.painted.clear();
    this.pending.clear();
    this.activeIndex = -1;
    this.empty.hidden = this.cues.length > 0;
    if (!this.cues.length) {
      this.list.appendChild(this.empty);
    } else {
      this.cues.forEach((cue, index) => {
        const row = this.buildRow(index, cue);
        this.rows.push(row);
        this.list.appendChild(row);
        this.observer.observe(row);
      });
    }
    this.dirty = false;
    this.syncActive();
  }

  private buildRow(index: number, cue: Cue): HTMLDivElement {
    const row = el('div', 'tx-row');
    row.dataset.index = String(index);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const time = el('span', 'tx-time', fmtClock(cue.start));
    time.title = t('overlay.transcript.seek');

    const body = el('div', 'tx-body');
    for (const line of cue.text.split('\n').filter((value) => value.trim() !== '')) {
      body.appendChild(el('div', 'tx-line', line));
    }

    row.append(time, body);
    const seek = () => this.hooks.onSeek(cue);
    time.addEventListener('click', (event) => {
      event.stopPropagation();
      seek();
    });
    row.addEventListener('click', (event) => {
      // A dictionary lookup must not also jump the video.
      if ((event.target as HTMLElement | null)?.closest?.('.dict-word')) return;
      seek();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      seek();
    });
    return row;
  }

  /** Renders one row's tokens; plain text stays until the tokenizer/analysis is available. */
  private paint(index: number): void {
    const cue = this.cues[index];
    const row = this.rows[index];
    if (!cue || !row || !row.isConnected || this.painted.has(index)) return;
    const opts = this.source.options();
    const data = this.source.render(cue);
    const body = row.querySelector<HTMLElement>('.tx-body');
    if (!body) return;
    const registry = featuresFor(opts.language);
    const elements = presetElements(registry, data.preset);
    // Mirrors `Overlay.render`: a preset's own features are a reason to paint tokens, even when
    // the standalone POS-colour switch is off.
    const themed = opts.colorize || data.preset.features.length > 0;
    const furigana = opts.furigana || data.preset.features.includes('reading');
    body.textContent = '';
    data.lines.forEach((text, lineIndex) => {
      const line = el('div', 'tx-line');
      const parsed = data.rows[lineIndex];
      if (parsed?.tokens.length && (themed || opts.dict.enabled)) {
        renderTokens(line, parsed.tokens, {
          colorize: themed,
          furigana,
          style: { preset: data.preset, elements, registry, language: opts.language },
          dict: { ...opts.dict, entries: parsed.entries },
        });
        this.hooks.onLine(line, parsed.entries);
      } else {
        line.textContent = text;
      }
      body.appendChild(line);
    });
    this.painted.add(index);

    const needsTokens = !data.tokensReady && (themed || opts.dict.enabled);
    const needsDict = opts.dict.enabled && !data.dictReady;
    if (!needsTokens && !needsDict) return;
    if (this.pending.has(index)) return;
    this.pending.add(index);
    this.source.prime(cue, () => {
      this.pending.delete(index);
      if (this.rows[index] !== row || !row.isConnected) return;
      this.painted.delete(index);
      this.paint(index);
    });
  }

  private syncActive(): void {
    if (this.dirty || !this.openState) return;
    const index = this.activeCue ? this.cues.indexOf(this.activeCue) : -1;
    if (index !== this.activeIndex) {
      this.rows[this.activeIndex]?.classList.remove('active');
      this.activeIndex = index;
      if (index >= 0) {
        this.rows[index]?.classList.add('active');
        this.paint(index);
      }
    }
    if (index < 0) return;
    this.reveal(index);
  }

  /** Keeps the current cue centered unless the user just scrolled away to read something else. */
  private reveal(index: number): void {
    if (performance.now() - this.lastUserScroll < FOLLOW_PAUSE_MS) return;
    const row = this.rows[index];
    if (!row) return;
    const list = this.list;
    const rowRect = row.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (rowRect.top >= listRect.top + 4 && rowRect.bottom <= listRect.bottom - 4) return;
    list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2);
  }
}
