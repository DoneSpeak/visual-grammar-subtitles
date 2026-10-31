import type { DictEntry, DictLine } from '@/shared/dictionary';
import { defaultDictSettings, type DictSettings } from '@/shared/dictSettings';
import { createIcon, type IconName } from '@/shared/icons';
import { defaultPosColors, type PosColors } from '@/shared/posColors';
import { toRomaji } from '@/shared/romaji';
import type { AdSlot, LayerCfg, PageCfg, Token } from '@/shared/types';
import { defaultLayer } from '@/shared/types';
import { classifyBreak, optimizeLayout, segmentPlain, type LayoutUnit, type OptimizeResult } from './layout';
import { renderPlain, renderTokens, type DictRender, type RenderOpts } from './tokenize/render';
import type { PictureRect } from './video';

type LayerId = 'a' | 'b';

/** A cue line prepared for both token-level rendering and layout measurement. */
type ParaContent =
  | { kind: 'tokens'; tokens: Token[]; entries: DictEntry[]; opts: RenderOpts }
  | { kind: 'plain'; segments: string[] };

type LayerContent = { paragraphs: ParaContent[]; ruby: boolean };

/** Search surfaces: one per subtitle layer, plus the online pack browser. */
export type LibraryTarget = LayerId | 'pack';

const LIB_TARGETS: LibraryTarget[] = ['a', 'b', 'pack'];

type Controls = {
  offset: HTMLInputElement;
  offsetVal: HTMLInputElement;
  capSyncA: () => void;
  capSyncB: () => void;
  fontSyncA: () => void;
  fontSyncB: () => void;
    colorize: HTMLInputElement;
  furigana: HTMLInputElement;
  enableB: HTMLInputElement;
};

/** fontScale is a fraction of the picture height; keep the rendered size inside this range. */
const MIN_SCALE = 0.02;
const MAX_SCALE = 0.12;
/** Container height floor in CSS pixels, so a shrunken box stays grabbable. */
const MIN_BOX_H = 24;
/** Floor for the auto-fit, below which the text would stop being legible anyway. */
const MIN_FONT_PX = 10;
/** maxWidth is a fraction of the picture width. */
const MIN_WIDTH = 0.2;
const MAX_WIDTH = 1;

/** Display-duration presets in ms; 0 keeps the cue for its full duration. */
const CAP_PRESETS: [string, number][] = [
  ['全', 0],
  ['0.2s', 200],
  ['0.5s', 500],
  ['1s', 1000],
];

export type LibraryOption = { id: string; name: string; label: string; packTitle: string };

/** A row the player renders in a layer's subtitle search menu. */
export type LibraryRow = { key: string; title: string; meta?: string };

/** Current episode's ad configuration, pushed by the content script. */
export type AdState = {
  slots: AdSlot[];
  seriesLabel: string;
  /** The episode is identifiable, so edits can be persisted. */
  canEdit: boolean;
};

export type OverlayCallbacks = {
  onAnchorChange: (layer: LayerId, x: number, y: number) => void;
  onFontScaleChange: (layer: LayerId, scale: number) => void;
  onMaxWidthChange: (layer: LayerId, width: number) => void;
  onBoxHeightChange: (layer: LayerId, height: number) => void;
  onPickFile: (target: LayerId) => void;
  onLibraryPick: (target: LibraryTarget, key: string) => void;
  onOnlineSearch: (query: string) => void;
  onClearSubtitle: (target: LayerId) => void;
  onOpenLibrary: () => void;
  onCfgChange: () => void;
  /** Player time → subtitle (content) timeline. */
  onAdCurrentTime: () => number;
  onAdSlotsChange: (slots: AdSlot[]) => void;
  onAdAutoSkipChange: (enabled: boolean) => void;
  /** Content time of an in-progress mark, or null when no mark is open. */
  onAdPending: (contentAt: number | null) => void;
  /** A word was looked up by click; the host decides whether to pause playback. */
  onWordLookup: () => void;
  /** Expand the player to the whole viewport, or put it back. */
  onTheaterToggle: () => void;
};

const CSS = `
:host { --card-bg: rgba(18,20,26,.97); --card-fg: #e8eaed; --card-muted: #99a3b0; --card-accent: #7fd3ff; --card-line: rgba(255,255,255,.12); --card-radius: 16px; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; }
.stage { position: absolute; overflow: visible; }
.layer { position: absolute; transform: translate(-50%, -100%); display: flex; align-items: center; justify-content: center; box-sizing: border-box; text-align: center; pointer-events: none; user-select: none; line-height: 1.38; font-weight: 700; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,.92), 0 0 2px rgba(0,0,0,.92); transition: opacity 160ms linear; opacity: 0; }
.layer .body { display: inline-block; max-width: 100%; pointer-events: auto; cursor: grab; }
.layer.dragging { will-change: transform; }
.layer.dragging .body { cursor: grabbing; }
.layer .line { white-space: pre-wrap; }
.layer rt { font-size: 0.48em; color: rgba(255,255,255,.72); font-weight: 500; letter-spacing: 0.02em; }
/* Invisible grab area: the whole block body drags, the grip only makes small blocks grabbable. */
.grip { position: absolute; pointer-events: auto; opacity: 0; touch-action: none; user-select: none; transition: opacity 140ms; left: -10px; top: -10px; width: 20px; height: 20px; border-radius: 50%; cursor: grab; background: transparent; box-shadow: none; }
.layer.dragging .grip { cursor: grabbing; }
/* One corner handle, faint at rest: the resize affordance stays findable without covering the picture. */
.rz { position: absolute; pointer-events: auto; touch-action: none; user-select: none; transition: opacity 140ms; opacity: .2; right: -9px; bottom: -9px; width: 24px; height: 24px; cursor: nwse-resize; }
.rz::after, .rz::before { content: ''; position: absolute; border-radius: 3px; background: rgba(255,255,255,.34); backdrop-filter: blur(6px) saturate(150%); -webkit-backdrop-filter: blur(6px) saturate(150%); box-shadow: 0 0 6px rgba(0,0,0,.4); }
.rz::after { right: 6px; bottom: 6px; width: 5px; height: 16px; }
.rz::before { right: 6px; bottom: 6px; width: 16px; height: 5px; }
/* Handles appear on pointer movement and fade out while the pointer rests, so they stay out of the picture. */
.layer.handles .grip { opacity: .8; }
.rz:hover, .layer.resizing .rz { opacity: 1; }
.layer.empty .grip, .layer.empty .rz { display: none; }
.size-tip { position: absolute; transform: translate(-50%, -100%); padding: 2px 7px; border-radius: 6px; background: rgba(20,22,28,.88); border: 1px solid rgba(255,255,255,.22); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0; transition: opacity 120ms; pointer-events: none; }
.dock { position: absolute; right: 8px; top: 8px; pointer-events: auto; display: flex; align-items: center; gap: 6px; }
/* Faint by default so the dock is findable without sitting on the picture; the pointer reveals it. */
.dock button { width: 30px; height: 26px; border-radius: 6px; border: 1px solid rgba(255,255,255,.35); background: rgba(20,22,28,.62); color: #fff; font-size: 13px; cursor: pointer; opacity: .2; transition: opacity 120ms; }
.dock button svg { width: 14px; height: 14px; display: block; margin: 0 auto; }
.dock button.on { border-color: #7FD3FF; color: #7FD3FF; background: rgba(127,211,255,.18); }
.dock:hover button, :host(.panel-open) .dock button { opacity: 1; }
/* Build identity sits in the picture's bottom-right corner so a stale content script is visible at a glance. */
.panel { position: absolute; right: 8px; top: 42px; width: 320px; max-height: calc(100vh - 60px); overflow-y: auto; padding: 10px 12px 12px; border-radius: 10px; background: rgba(18,20,26,.96); border: 1px solid rgba(255,255,255,.14); color: #e8eaed; font-size: 12px; pointer-events: auto; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
.panel[hidden] { display: none; }
/* macOS hides overlay scrollbars until the user scrolls, which makes a clipped section look absent. */
.panel::-webkit-scrollbar { width: 8px; }
.panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,.3); border-radius: 4px; }
.panel::-webkit-scrollbar-track { background: transparent; }
.panel h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; opacity: .85; }
.panel .sec { border-top: 1px solid rgba(255,255,255,.1); margin-top: 10px; padding-top: 8px; }
.panel .row { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.panel .row > label { flex: 0 0 64px; opacity: .8; }
.panel input.offset-num { flex: 0 0 52px; width: 52px; text-align: right; font-variant-numeric: tabular-nums; }
.panel input.offset-num:focus { outline: none; border-color: #7FD3FF; }
.panel button { border-radius: 6px; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.08); color: #e8eaed; font-size: 11px; padding: 3px 8px; cursor: pointer; flex: 0 0 auto; }
.panel button:hover { background: rgba(255,255,255,.16); }
.panel input[type=range] { flex: 1; min-width: 0; accent-color: #7FD3FF; }
.panel input[type=number] { width: 64px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 2px 5px; font-size: 11px; }
.panel input[type=search] { flex: 1 1 auto; min-width: 0; width: 100%; box-sizing: border-box; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 3px 6px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel input[type=search]:focus { outline: none; border-color: #7FD3FF; text-overflow: clip; }
.panel button.icon { width: 22px; height: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.panel button.icon svg { width: 13px; height: 13px; display: block; }
.panel .chips { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.panel .chip { padding: 1px 7px; font-size: 10px; line-height: 1.7; opacity: .72; }
.panel .chip.on { border-color: #7FD3FF; color: #7FD3FF; background: rgba(127,211,255,.12); opacity: 1; }
.panel .chip:disabled { opacity: .35; cursor: default; }
.panel .chips .sep { width: 1px; align-self: stretch; margin: 0 2px; background: rgba(255,255,255,.18); }
.panel input.cap { width: 52px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 1px 5px; font-size: 10px; }
.panel input.cap:focus { outline: none; border-color: #7FD3FF; }
.panel input.cap.on { border-color: #7FD3FF; color: #7FD3FF; }
.panel button.on { border-color: #7FD3FF; color: #7FD3FF; background: rgba(127,211,255,.12); }
.panel .mark-head { display: flex; align-items: center; gap: 6px; margin: 0; }
.panel .mark-title { font-size: 12px; font-weight: 600; opacity: .85; }
.panel .mark-head .grow { flex: 1; }
/* Marks sit in one horizontal row of compact cards; the row is hidden entirely when there is nothing to show. */
.panel .mark-strip { display: flex; flex-wrap: nowrap; align-items: center; gap: 4px; min-height: 22px; margin-top: 6px; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
.panel .mark-strip[hidden] { display: none; }
.panel .mark-strip::-webkit-scrollbar { height: 6px; }
.panel .mark-strip::-webkit-scrollbar-thumb { background: rgba(255,255,255,.25); border-radius: 3px; }
.panel button.icon[hidden] { display: none; }
.panel .mark-chip { flex: 0 0 auto; box-sizing: border-box; height: 22px; display: inline-flex; align-items: center; gap: 1px; padding: 0 2px 0 4px; border: 1px solid rgba(255,255,255,.16); border-radius: 6px; background: rgba(255,255,255,.05); }
.panel .mark-chip input { width: 40px; padding: 0; border: 0; background: transparent; color: #e8eaed; font-size: 10px; font-variant-numeric: tabular-nums; text-align: center; }
.panel .mark-chip input:focus { outline: none; color: #7FD3FF; }
.panel .mark-chip .sep { opacity: .4; font-size: 10px; }
.panel .mark-chip button.icon { width: 16px; height: 16px; border: 0; background: none; }
.panel .mark-chip button.icon svg { width: 10px; height: 10px; }
.lib-menu { position: fixed; z-index: 8; max-height: 224px; overflow-y: auto; pointer-events: auto; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; background: rgba(24,27,34,.99); color: #e8eaed; font-size: 11px; box-shadow: 0 10px 28px rgba(0,0,0,.55); }
.lib-menu[hidden] { display: none; }
.lib-status { padding: 6px 8px; font-size: 11px; opacity: .62; line-height: 1.45; }
.lib-item { display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; cursor: pointer; font-size: 11px; }
.lib-item:hover, .lib-item.active { background: rgba(127,211,255,.16); }
.lib-item .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-item .meta { flex: 0 1 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .5; font-size: 10px; }
.panel .hint { opacity: .5; font-size: 11px; line-height: 1.5; }
.panel .row > .hint { flex: 1; min-width: 0; }
.dict-word { pointer-events: auto; cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,.5); }
.dict-word:hover { background: rgba(127,211,255,.22); border-bottom-color: #7FD3FF; }
.card { position: absolute; width: 320px; max-width: 92%; max-height: 62vh; overflow-y: auto; padding: 10px 20px 18px; border-radius: var(--card-radius); background: var(--card-bg); border: 1px solid rgba(255,255,255,.14); color: var(--card-fg); font-size: 12px; line-height: 1.5; text-align: center; pointer-events: auto; box-shadow: 0 18px 48px rgba(0,0,0,.6); transform: translate(-50%, -100%); }
.card[hidden] { display: none; }
.card .top { display: flex; align-items: center; justify-content: space-between; min-height: 26px; }
.card .lv { padding: 1px 8px; border-radius: 99px; border: 1px solid rgba(127,211,255,.42); color: var(--card-accent); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.card .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.06); color: var(--card-muted); cursor: pointer; transition: background 120ms, color 120ms; }
.card .icon-btn:hover { background: rgba(127,211,255,.16); color: var(--card-accent); }
.card .icon-btn svg { width: 14px; height: 14px; display: block; }
.card .word-line { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; justify-items: center; margin-top: 4px; }
.card .word { grid-column: 2; font-size: 44px; line-height: 1.15; font-weight: 700; letter-spacing: .01em; overflow-wrap: anywhere; }
.card .word-line .icon-btn { grid-column: 3; justify-self: start; margin-left: 6px; width: 30px; height: 30px; flex: none; }
.card .word-line .icon-btn svg { width: 19px; height: 19px; }
.card .reading { margin-top: 6px; font-size: 18px; font-weight: 600; color: var(--card-accent); letter-spacing: .02em; }
.card .romaji { margin-top: 2px; font-size: 16px; color: var(--card-muted); letter-spacing: .09em; }
.card .pos { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; }
.card .pos span { padding: 0 6px; border-radius: 4px; background: rgba(255,255,255,.08); color: #b9c0c9; font-size: 10px; line-height: 1.7; }
.card .gloss { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--card-line); font-size: 14px; font-weight: 500; line-height: 1.45; }
.card .ex { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--card-line); text-align: left; }
.card .ex-jp { display: flex; align-items: flex-start; gap: 6px; font-size: 12.5px; line-height: 1.55; }
.card .ex-jp .text { flex: 1; min-width: 0; }
.card .ex-jp .icon-btn { width: 22px; height: 22px; flex: none; margin-top: -2px; }
.card .ex-jp .icon-btn svg { width: 12px; height: 12px; }
.card .ex-en { margin-top: 2px; font-size: 11.5px; line-height: 1.5; color: var(--card-muted); }
`;

/**
 * Input aimed at the overlay must never climb into the page. In fullscreen the host is a child
 * of the player container, so a click on a setting bubbles into the player and reads as
 * click-to-pause; outside fullscreen it still lets page-level shortcuts fight the panel.
 */
const HOST_ISOLATED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'wheel',
  'keydown',
  'keyup',
  'keypress',
] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const stopAtHost = (event: Event): void => event.stopPropagation();

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const fmtClock = (seconds: number): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** Accepts `mm:ss` or `h:mm:ss`; null when the text is not a time point. */
const parseClock = (text: string): number | null => {
  const parts = text.trim().split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number);
  return parts.length === 2 ? a * 60 + b : a * 3600 + b * 60 + c;
};

const icon = (name: IconName): SVGSVGElement => createIcon(name);

/** Icon-only button; the tooltip carries the label. */
const iconButton = (name: IconName, title: string): HTMLButtonElement => {
  const button = el('button', 'icon');
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(icon(name));
  return button;
};

export class Overlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private stage: HTMLDivElement;
  private layers: Record<LayerId, { wrap: HTMLDivElement; body: HTMLDivElement; grip: HTMLDivElement; rz: HTMLDivElement }>;
  private dockBtn: HTMLButtonElement;
  private theaterBtn: HTMLButtonElement;
  private panel: HTMLDivElement;
  private sizeTip: HTMLDivElement;
  private card: HTMLDivElement;
  private cardLayer: LayerId | null = null;
  private cardAnchor: HTMLElement | null = null;
  private cardTimer = 0;
  private hoverTimer = 0;
  private dictSettings: DictSettings = defaultDictSettings();
  private posColors: PosColors = defaultPosColors();
  private lineDict = new WeakMap<HTMLElement, DictEntry[]>();
  /** Current cue, kept so a resize can re-run the layout without a new tokenization round trip. */
  private content: Record<LayerId, LayerContent | null> = { a: null, b: null };
  /** Break plan currently painted, to avoid rebuilding the DOM on every resize frame. */
  private planKey: Record<LayerId, string> = { a: '', b: '' };
  private layoutCache: Record<LayerId, { key: string; plan: OptimizeResult } | null> = { a: null, b: null };
  /** Glyph width (px at font-size 1px) per unit text; the same tokens recur across cues. */
  private unitWidths = new Map<string, number>();
  private measureCtx: CanvasRenderingContext2D | null | undefined;
  private fontFamily = '';
  private picture: PictureRect = { left: 0, top: 0, width: 0, height: 0 };
  private visible: Record<LayerId, boolean> = { a: false, b: false };
  private hovered = false;
  /** Idle timers that fade a layer's drag/resize handles back out. */
  private handleTimers: Record<LayerId, number> = { a: 0, b: 0 };
  private mountedIn: Element | null = null;
  private controls = {} as Controls;
  private libraryItems: LibraryOption[] = [];
  private libInputs: Partial<Record<LibraryTarget, HTMLInputElement>> = {};
  private libMenuEls: Partial<Record<LibraryTarget, HTMLDivElement>> = {};
  private libRows: Record<LibraryTarget, LibraryRow[]> = { a: [], b: [], pack: [] };
  private libStatus: Record<LibraryTarget, string> = { a: '', b: '', pack: '' };
  private libActive: Record<LibraryTarget, number> = { a: -1, b: -1, pack: -1 };
  private libOnline: Record<LibraryTarget, boolean> = { a: false, b: false, pack: false };
  /** Text a layer input shows while idle: the display label of the loaded subtitle. */
  private libCommitted: Record<LibraryTarget, string> = { a: '', b: '', pack: '' };
  private adState: AdState = {
    slots: [],
    seriesLabel: '',
    canEdit: false,
  };
  private adStrip: HTMLDivElement | null = null;
  private adStartBtn: HTMLButtonElement | null = null;
  private adEndBtn: HTMLButtonElement | null = null;
  private adTitle: HTMLElement | null = null;
  private adSkipBtn: HTMLButtonElement | null = null;
  private autoSkipAds = true;
  /** Content time captured by the first "标记开始" click, until "标记结束" completes the slot. */
  private adPendingStart: number | null = null;

  constructor(
    private getCfg: () => PageCfg,
    private cb: OverlayCallbacks,
  ) {
    this.host = el('div', 'host');
    this.host.id = 'jp-sub-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);

    this.stage = el('div', 'stage');
    this.shadow.appendChild(this.stage);

    const makeLayer = (id: LayerId) => {
      const wrap = el('div', 'layer empty');
      wrap.dataset.layer = id;
      const body = el('div', 'body');

      // Handles mirror the body drag / resize so the gesture stays reachable at the block edges.
      const label = id === 'a' ? '原文' : '译文';
      const grip = el('div', 'grip');
      grip.title = `拖动调整${label}字幕位置（双击复位）`;
      grip.addEventListener('pointerdown', (e) => this.startDrag(e, id));
      grip.addEventListener('dblclick', () => {
        this.cb.onAnchorChange(id, 0.5, id === 'a' ? 0.9 : 0.82);
        this.applyLayout();
      });
      const rz = el('div', 'rz');
      rz.title = `拖动调整${label}字幕框：右边改宽度、下边改高度，双击复位`;
      rz.addEventListener('pointerdown', (e) => this.startResize(e, id));
      rz.addEventListener('dblclick', () => {
        this.cb.onMaxWidthChange(id, defaultLayer().maxWidth);
        this.cb.onBoxHeightChange(id, defaultLayer().boxH);
        this.applyLayout();
      });

      // Handles track pointer activity instead of hover so they disappear over resting text.
      wrap.addEventListener('pointerenter', () => this.showHandles(id));
      wrap.addEventListener('pointermove', () => this.showHandles(id));
      wrap.addEventListener('pointerleave', () => this.hideHandles(id));

      wrap.append(body, grip, rz);
      this.stage.appendChild(wrap);
      return { wrap, body, grip, rz };
    };
    this.layers = { a: makeLayer('a'), b: makeLayer('b') };
    for (const id of ['a', 'b'] as LayerId[]) {
      const body = this.layers[id].body;
      body.addEventListener('click', (e) => this.onWordClick(e, id));
      body.addEventListener('mouseover', (e) => this.onWordOver(e, id));
      body.addEventListener('mouseout', this.onWordOut);
      // Keep player-level pointer handlers (pause/play on click) from firing under a word.
      body.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('.dict-word')) e.stopPropagation();
      });
      // The text block itself drags; words stay clickable for the dictionary card.
      body.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('.dict-word')) return;
        this.startDrag(e, id);
      });
    }

    this.card = el('div', 'card');
    this.card.hidden = true;
    this.card.addEventListener('mouseenter', () => {
      window.clearTimeout(this.hoverTimer);
      // Reading the card should not race the fixed-duration timer.
      window.clearTimeout(this.cardTimer);
    });
    this.card.addEventListener('mouseleave', () => {
      if (this.dictSettings.trigger === 'hover') this.scheduleHoverHide();
      else this.armCardTimer();
    });
    this.stage.appendChild(this.card);

    this.sizeTip = el('div', 'size-tip');
    this.stage.appendChild(this.sizeTip);

    this.dockBtn = el('button', '', '字');
    this.dockBtn.title = '字幕设置';
    this.dockBtn.addEventListener('click', () => this.togglePanel());
    this.theaterBtn = el('button', 'theater');
    this.theaterBtn.type = 'button';
    this.theaterBtn.appendChild(icon('expand'));
    this.theaterBtn.title = '视频平铺全网页';
    this.theaterBtn.setAttribute('aria-label', '视频平铺全网页');
    this.theaterBtn.addEventListener('click', () => this.cb.onTheaterToggle());
    const dock = el('div', 'dock');
    dock.append(this.dockBtn, this.theaterBtn);
    this.stage.appendChild(dock);

    this.panel = this.buildPanel();
    // Stable handle for debugging and for talking about the settings surface by name.
    this.panel.id = 'jp-sub-panel';
    this.stage.appendChild(this.panel);
    // A clicked button keeps focus, so the next Space (the player's play/pause shortcut) would
    // activate it again instead of reaching the page. Drop focus once the click is delivered.
    this.shadow.addEventListener('click', this.blurButton, true);
    // Menus float above the panel; a scroll would strand them at stale coordinates.
    this.panel.addEventListener('scroll', () => this.closeAllMenus());
    window.addEventListener('resize', this.repositionMenus);

    document.addEventListener('fullscreenchange', this.reparent);
    document.addEventListener('webkitfullscreenchange', this.reparent);
    document.addEventListener('pointerdown', this.onDocPointerDown, true);
    document.addEventListener('keydown', this.onDocKeyDown, true);
    // Bubble phase on the host: the overlay's own handlers inside the shadow root still run,
    // then the event stops before the page (or the enclosing player) sees it.
    for (const type of HOST_ISOLATED_EVENTS) {
      // `wheel` stays passive: there is nothing to prevent, and a non-passive listener here
      // would make the host a scroll-blocking element for Chrome's scroll optimisation.
      this.host.addEventListener(type, stopAtHost, type === 'wheel' ? { passive: true } : undefined);
    }
  }

  mount(): void {
    this.reparent();
  }

  reveal(): void {
    this.host.classList.add('hover');
  }

  /** The element the overlay must live in to paint above the picture.
   *  A fullscreen `<video>` sits in the top layer with no room for siblings, so fall back to
   *  the document — the overlay then paints under it, which is a platform limit, not a state. */
  private fullscreenTarget(): Element {
    const fs = document.fullscreenElement as Element | null;
    return fs && fs.tagName !== 'VIDEO' ? fs : document.documentElement;
  }

  private reparent = (): void => {
    const target = this.fullscreenTarget();
    if (this.mountedIn === target && this.host.isConnected) return;
    this.mountedIn = target;
    target.appendChild(this.host);
  };

  /**
   * Players swap or tear down their fullscreen container without a matching `fullscreenchange`
   * (bilibili rebuilds the player on episode switch), which strands the host in a dead subtree.
   * Cheap enough to check every frame from the playback loop.
   */
  ensureMounted(): void {
    if (this.host.isConnected && this.fullscreenTarget() === this.mountedIn) return;
    this.reparent();
  }

  destroy(): void {
    document.removeEventListener('fullscreenchange', this.reparent);
    document.removeEventListener('webkitfullscreenchange', this.reparent);
    document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    document.removeEventListener('keydown', this.onDocKeyDown, true);
    window.removeEventListener('resize', this.repositionMenus);
    window.speechSynthesis?.cancel();
    this.host.remove();
  }

  updateRect(rect: PictureRect): void {
    this.picture = rect;
    const s = this.stage.style;
    s.left = `${rect.left}px`;
    s.top = `${rect.top}px`;
    s.width = `${rect.width}px`;
    s.height = `${rect.height}px`;
    if (!this.panel.hidden) this.fitPanelHeight();
    this.applyLayout();
    // The px readout is derived from the picture height, so it follows a player resize.
    if (!this.panel.hidden) {
      this.controls.fontSyncA();
      this.controls.fontSyncB();
    }
  }

  setHover(hovered: boolean): void {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.host.classList.toggle('hover', hovered);
  }

  isInside(x: number, y: number): boolean {
    const { left, top, width, height } = this.picture;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  diag(): Record<string, unknown> {
    const panel = this.shadow.getElementById('jp-sub-panel') as HTMLDivElement | null;
    const stage = this.shadow.querySelector('.stage') as HTMLDivElement | null;
    const r = panel?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : -1;
    const cy = r ? r.top + r.height / 2 : -1;
    const inView = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
    const top = inView ? document.elementFromPoint(cx, cy) : null;
    const rect = (x?: { left: number; top: number; width: number; height: number } | null) =>
      x ? [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)] : null;
    return {
      mountedIn: this.mountedIn?.tagName ?? null,
      video: rect(this.picture),
      stage: rect(stage?.getBoundingClientRect()),
      panel: rect(r),
      panelHidden: panel?.hidden ?? null,
      hostZ: getComputedStyle(this.host).zIndex,
      hostPos: getComputedStyle(this.host).position,
      topAtPanelCenter: top ? `${top.tagName}${top.id ? '#' + top.id : ''}.${top.className}` : null,
      viewport: [window.innerWidth, window.innerHeight],
      scroll: [window.scrollX, window.scrollY],
      ad: {
        title: !!this.shadow.querySelector('.mark-title'),
        slots: this.adState.slots.length,
        strip: rect(this.adStrip?.getBoundingClientRect()),
        panelScroll: panel ? [panel.scrollTop, panel.scrollHeight, panel.clientHeight] : null,
        panelCount: this.shadow.querySelectorAll('.panel').length,
        panelSame: this.panel === panel,
        stripCount: this.shadow.querySelectorAll('.mark-strip').length,
        stripSame: this.adStrip === this.shadow.querySelector('.mark-strip'),
        stripConnected: this.adStrip?.isConnected ?? null,
        stripDisplay: this.adStrip ? getComputedStyle(this.adStrip).display : null,
        stripParent: this.adStrip?.parentElement?.className ?? null,
        parentRect: rect(this.adStrip?.parentElement?.getBoundingClientRect()),
        parentHidden: this.adStrip?.parentElement?.hidden ?? null,
        parentDisplay: this.adStrip?.parentElement ? getComputedStyle(this.adStrip.parentElement).display : null,
        stripKids: this.adStrip?.children.length ?? -1,
      },
    };
  }

  render(layer: LayerId, lines: string[], tokens: (DictLine | null)[], cfg: LayerCfg, dict: DictRender): void {
    if (this.cardLayer === layer && this.dictSettings.duration.mode === 'cue') this.hideCard();
    // Keep the source, not just the painted DOM: a resize re-runs the layout optimizer and needs
    // the units back. Tokenized lines break at token boundaries, so a slice is still renderable.
    const paragraphs: ParaContent[] = lines.map((line, i) => {
      const parsed = tokens[i];
      if (parsed && parsed.tokens.length && (cfg.colorize || dict.enabled)) {
        return {
          kind: 'tokens',
          tokens: parsed.tokens,
          entries: parsed.entries,
          opts: {
            colorize: cfg.colorize,
            furigana: cfg.furigana,
            colors: this.posColors,
            dict: { ...dict, entries: parsed.entries },
          },
        };
      }
      return { kind: 'plain', segments: segmentPlain(line) };
    });
    const ruby = paragraphs.some(
      (para) => para.kind === 'tokens' && cfg.furigana && para.tokens.some((token) => !!token.reading),
    );
    this.content[layer] = { paragraphs, ruby };
    this.layoutCache[layer] = null;
    this.planKey[layer] = '';
    this.layers[layer].wrap.classList.toggle('empty', paragraphs.length === 0);
    this.applyLayout();
  }

  clear(layer: LayerId): void {
    if (this.cardLayer === layer) this.hideCard();
    this.content[layer] = null;
    this.layoutCache[layer] = null;
    this.planKey[layer] = '';
    this.layers[layer].body.textContent = '';
    this.layers[layer].wrap.classList.add('empty');
    this.setOpacity(layer, false);
  }

  private wordAt(target: EventTarget | null): HTMLElement | null {
    return ((target as HTMLElement | null)?.closest?.('.dict-word') as HTMLElement | null) ?? null;
  }

  private entryFor(span: HTMLElement): DictEntry | undefined {
    const line = span.parentElement;
    return line ? this.lineDict.get(line)?.[Number(span.dataset.dictIdx)] : undefined;
  }

  private onWordClick = (event: MouseEvent, layer: LayerId): void => {
    if (this.dictSettings.trigger !== 'click') return;
    const span = this.wordAt(event.target);
    if (!span) return;
    const entry = this.entryFor(span);
    if (!entry) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.dictSettings.pauseOnLookup) this.cb.onWordLookup();
    this.showCard(entry, span, layer);
  };

  private onWordOver = (event: MouseEvent, layer: LayerId): void => {
    if (this.dictSettings.trigger !== 'hover') return;
    const span = this.wordAt(event.target);
    if (!span || span === this.cardAnchor) return;
    const entry = this.entryFor(span);
    if (!entry) return;
    window.clearTimeout(this.hoverTimer);
    this.showCard(entry, span, layer);
  };

  private onWordOut = (event: MouseEvent): void => {
    if (this.dictSettings.trigger !== 'hover' || this.card.hidden) return;
    if (!this.wordAt(event.target) || this.wordAt(event.relatedTarget)) return;
    // The card floats above the word; give the pointer time to cross the gap.
    this.scheduleHoverHide();
  };

  private scheduleHoverHide(): void {
    if (this.dictSettings.trigger !== 'hover') return;
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.hideCard(), 320);
  }

  /** Reflect the page-level theater state on the dock button. */
  setTheater(active: boolean): void {
    const label = active ? '退出全页平铺' : '视频平铺全网页';
    this.theaterBtn.textContent = '';
    this.theaterBtn.appendChild(icon(active ? 'collapse' : 'expand'));
    this.theaterBtn.title = label;
    this.theaterBtn.setAttribute('aria-label', label);
    this.theaterBtn.classList.toggle('on', active);
  }

  setDictSettings(settings: DictSettings): void {
    this.dictSettings = settings;
    if (!settings.enabled || settings.trigger === 'click') window.clearTimeout(this.hoverTimer);
  }

  setPosColors(colors: PosColors): void {
    this.posColors = colors;
  }

  private showCard(entry: DictEntry, anchor: HTMLElement, layer: LayerId): void {
    window.clearTimeout(this.cardTimer);
    this.hideCard();
    this.cardLayer = layer;
    this.cardAnchor = anchor;
    const card = this.card;
    const reading = entry.r && entry.r !== entry.w ? entry.r : '';
    const roman = this.dictSettings.pronunciation.romaji ? toRomaji(entry.r || entry.w) : '';

    const top = el('div', 'top');
    top.appendChild(el('span', 'lv', `N${entry.lv}`));
    const close = this.iconBtn('close', '关闭');
    close.addEventListener('click', () => this.hideCard());
    top.appendChild(close);
    card.appendChild(top);

    const wordLine = el('div', 'word-line');
    wordLine.append(el('span', 'word', entry.w), this.speakButton(entry.w, `朗读 ${entry.w}`));
    card.appendChild(wordLine);

    if (reading) card.appendChild(el('div', 'reading', reading));
    if (roman) card.appendChild(el('div', 'romaji', roman));

    if (entry.p.length) {
      const pos = el('div', 'pos');
      for (const p of entry.p) pos.appendChild(el('span', '', p));
      card.appendChild(pos);
    }

    // `z` is unused until a Chinese gloss source is wired in; prefer it when present.
    const glosses = entry.z?.length ? entry.z : entry.g;
    if (glosses.length) card.appendChild(el('div', 'gloss', glosses.join(', ')));

    for (const example of entry.x) {
      const box = el('div', 'ex');
      const jp = el('div', 'ex-jp');
      jp.append(el('span', 'text', example.j), this.speakButton(example.j, '朗读例句'));
      box.append(jp, el('div', 'ex-en', example.e));
      card.appendChild(box);
    }

    card.hidden = false;
    this.positionCard(anchor);
    this.armCardTimer();
  }

  private armCardTimer(): void {
    window.clearTimeout(this.cardTimer);
    if (this.dictSettings.duration.mode !== 'fixed') return;
    this.cardTimer = window.setTimeout(() => this.hideCard(), this.dictSettings.duration.ms);
  }

  private positionCard(anchor: HTMLElement): void {
    const card = this.card;
    const a = anchor.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    if (stage.width < 1) return;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const centerX = a.left - stage.left + a.width / 2;
    const left = Math.min(stage.width - w / 2 - 4, Math.max(w / 2 + 4, centerX));
    let top = a.top - stage.top - 8;
    let flip = false;
    if (top - h < 4) {
      top = a.bottom - stage.top + 8;
      flip = true;
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transform = flip ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
  }

  private hideCard(): void {
    window.clearTimeout(this.cardTimer);
    window.clearTimeout(this.hoverTimer);
    if (this.card.hidden) return;
    this.cardLayer = null;
    this.cardAnchor = null;
    this.card.hidden = true;
    this.card.textContent = '';
    window.speechSynthesis?.cancel();
  }

  private iconBtn(name: IconName, label: string): HTMLButtonElement {
    const button = el('button', 'icon-btn');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(createIcon(name));
    return button;
  }

  private speakButton(text: string, label = '朗读'): HTMLButtonElement {
    const button = this.iconBtn('speaker', label);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.speak(text);
    });
    return button;
  }

  private speak(text: string): void {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }

  private blurButton = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element) {
      const button = target.closest('button');
      if (button instanceof HTMLButtonElement) button.blur();
    }
  };

  private onDocPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    // The settings panel is a transient surface: like any popover it goes away on an outside click.
    if (!path.includes(this.host) && !this.panel.hidden) this.setPanelOpen(false);
    if (this.card.hidden) return;
    if (path.includes(this.card)) return;
    if (path.some((node) => node instanceof Element && node.classList.contains('dict-word'))) return;
    this.hideCard();
  };

  private onDocKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (!this.card.hidden) {
      this.hideCard();
      event.stopPropagation();
      return;
    }
    // Escape closes the settings panel before it reaches page/player handlers.
    if (!this.panel.hidden) {
      this.setPanelOpen(false);
      event.stopPropagation();
    }
  };

  setOpacity(layer: LayerId, visible: boolean): void {
    if (!visible && this.cardLayer === layer && this.dictSettings.duration.mode === 'cue') this.hideCard();
    if (this.visible[layer] === visible) return;
    this.visible[layer] = visible;
    this.layers[layer].wrap.style.opacity = visible ? String(this.getCfg().layers[layer].opacity) : '0';
  }

  private applyLayout(): void {
    const cfg = this.getCfg();
    for (const id of ['a', 'b'] as LayerId[]) {
      const lc = cfg.layers[id];
      const wrap = this.layers[id].wrap;
      wrap.style.left = `${lc.anchorX * 100}%`;
      wrap.style.top = `${lc.anchorY * 100}%`;
      wrap.style.width = `${lc.maxWidth * 100}%`;
      // No explicit height = the container hugs the text.
      wrap.style.height = lc.boxH ? `${lc.boxH * 100}%` : '';
      wrap.style.opacity = this.visible[id] ? String(lc.opacity) : '0';
      this.fitBody(id);
    }
  }

  /**
   * Lays the current cue out for the container. Without an explicit box the container hugs the
   * text at the user's size and the browser wraps it. With a box, the optimizer picks the font,
   * break positions, line height and tracking that fill `(maxWidth × boxH)` — see layout.ts.
   *
   * The font size slider is the starting preference; inside a box the text may grow up to the
   * slider's own ceiling (MAX_SCALE of the picture height) to fill the rectangle.
   */
  private fitBody(id: LayerId): void {
    const { wrap } = this.layers[id];
    const cfg = this.getCfg().layers[id];
    const content = this.content[id];
    const preferred = this.fontPx(id);
    if (!content || !content.paragraphs.length) {
      wrap.style.fontSize = `${preferred}px`;
      wrap.style.lineHeight = '';
      wrap.style.letterSpacing = '';
      this.paint(id, content ? content.paragraphs.map(() => [0]) : []);
      return;
    }
    if (!cfg.boxH) {
      wrap.style.fontSize = `${preferred}px`;
      wrap.style.lineHeight = '';
      wrap.style.letterSpacing = '';
      this.paint(id, content.paragraphs.map(() => [0]));
      return;
    }
    const width = Math.max(1, cfg.maxWidth * this.picture.width);
    const height = Math.max(1, cfg.boxH * this.picture.height);
    const maxFont = Math.max(preferred, MAX_SCALE * this.picture.height);
    // A resize drag rewrites the box on every frame; the cache keeps a scroll-only rect update
    // from re-running the DP with identical inputs.
    const key = `${Math.round(width)}|${Math.round(height)}|${preferred}|${content.ruby}`;
    let cached = this.layoutCache[id];
    if (!cached || cached.key !== key) {
      const paragraphs = content.paragraphs.map((para) => this.unitsOf(para));
      cached = {
        key,
        plan: optimizeLayout({
          paragraphs,
          width,
          height,
          minFont: MIN_FONT_PX,
          maxFont,
          preferredFont: preferred,
          // Ruby sits above the base glyphs and enlarges the line box.
          rubyFactor: content.ruby ? 1.28 : 1,
        }),
      };
      this.layoutCache[id] = cached;
    }
    const plan = cached.plan;
    wrap.style.fontSize = `${plan.fontPx}px`;
    wrap.style.lineHeight = String(plan.lineHeight);
    wrap.style.letterSpacing = plan.letterSpacingEm >= 0.005 ? `${plan.letterSpacingEm}em` : '';
    this.paint(id, plan.lineStarts);
  }

  /** Renders the cue with the optimizer's break plan; unchanged plans keep the existing DOM. */
  private paint(id: LayerId, lineStarts: number[][]): void {
    const content = this.content[id];
    const key = content ? lineStarts.map((starts) => starts.join(',')).join('|') : 'empty';
    if (key === this.planKey[id]) return;
    const body = this.layers[id].body;
    body.textContent = '';
    if (content) {
      content.paragraphs.forEach((para, p) => {
        const starts = lineStarts[p]?.length ? lineStarts[p] : [0];
        const unitCount = para.kind === 'tokens' ? para.tokens.length : para.segments.length;
        if (!unitCount) return;
        starts.forEach((start, index) => {
          const end = index + 1 < starts.length ? starts[index + 1] : unitCount;
          const div = el('div', 'line');
          if (para.kind === 'tokens') {
            renderTokens(div, para.tokens.slice(start, end), para.opts);
            this.lineDict.set(div, para.entries);
          } else {
            renderPlain(div, para.segments.slice(start, end).join(''));
          }
          body.appendChild(div);
        });
      });
    }
    this.planKey[id] = key;
  }

  /** Break units for the optimizer: tokens keep words intact; plain text is segmented first. */
  private unitsOf(para: ParaContent): LayoutUnit[] {
    if (para.kind === 'plain') {
      return para.segments.map((text) => ({ text, width: this.unitWidth(text), ...classifyBreak(text) }));
    }
    return para.tokens.map((token) => ({
      text: token.surface,
      width: this.unitWidth(token.surface),
      // 助詞 / 助動詞: a line break on either side of them reads badly.
      particle: token.pos.startsWith('助'),
      ...classifyBreak(token.surface),
    }));
  }

  /**
   * Glyph width at font-size 1px. Canvas measurement matches the layer's own font (weight 700,
   * the shadow host's family) and is cached: the same tokens repeat across every cue.
   */
  private unitWidth(text: string): number {
    if (!text) return 0;
    const cached = this.unitWidths.get(text);
    if (cached !== undefined) return cached;
    if (this.measureCtx === undefined) {
      this.fontFamily = getComputedStyle(this.host).fontFamily || 'sans-serif';
      this.measureCtx = document.createElement('canvas').getContext('2d');
    }
    let px: number;
    if (this.measureCtx) {
      this.measureCtx.font = `700 100px ${this.fontFamily}`;
      px = this.measureCtx.measureText(text).width;
    } else {
      // Rough fallback when no canvas is available: CJK ≈ 1em, everything else ≈ 0.55em.
      const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
      px = [...text].reduce((sum, char) => sum + (CJK.test(char) ? 100 : 55), 0);
    }
    const width = px / 100;
    this.unitWidths.set(text, width);
    return width;
  }

  /** Handles show while the pointer moves over a layer, then fade out on their own. */
  private showHandles(layer: LayerId): void {
    if (!this.card.hidden) return; // reading the dictionary card should not sprout handles
    const { wrap } = this.layers[layer];
    wrap.classList.add('handles');
    window.clearTimeout(this.handleTimers[layer]);
    this.handleTimers[layer] = window.setTimeout(() => this.hideHandles(layer), 1400);
  }

  private hideHandles(layer: LayerId): void {
    window.clearTimeout(this.handleTimers[layer]);
    this.handleTimers[layer] = 0;
    const { wrap } = this.layers[layer];
    if (wrap.classList.contains('dragging') || wrap.classList.contains('resizing')) return;
    wrap.classList.remove('handles');
  }

  private fontPx(id: LayerId): number {
    // Fractional: rounding to whole pixels makes a slow resize visibly step.
    const scale = clamp(this.getCfg().layers[id].fontScale, MIN_SCALE, MAX_SCALE);
    return Math.max(12, Math.round(this.picture.height * scale * 100) / 100);
  }

  private startDrag(event: PointerEvent, layer: LayerId): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    const { wrap } = this.layers[layer];
    grip.setPointerCapture(event.pointerId);
    window.clearTimeout(this.handleTimers[layer]);
    wrap.classList.add('dragging', 'handles');

    const cfg = this.getCfg().layers[layer];
    const startX = event.clientX;
    const startY = event.clientY;
    const w = Math.max(1, this.picture.width);
    const h = Math.max(1, this.picture.height);
    let x = cfg.anchorX;
    let y = cfg.anchorY;
    let raf = 0;

    // Move via transform only: no layout per pointer event. The anchor is persisted once on
    // release, so a drag costs one style write per frame instead of one reflow per event.
    const apply = (): void => {
      raf = 0;
      const dx = (x - cfg.anchorX) * w;
      const dy = (y - cfg.anchorY) * h;
      wrap.style.transform = `translate(calc(-50% + ${dx}px), calc(-100% + ${dy}px))`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      x = Math.min(1, Math.max(0, cfg.anchorX + (e.clientX - startX) / w));
      y = Math.min(1, Math.max(0, cfg.anchorY + (e.clientY - startY) / h));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      wrap.classList.remove('dragging');
      wrap.style.transform = '';
      this.cb.onAnchorChange(layer, x, y);
      this.applyLayout();
      if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
      this.showHandles(layer);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  }

  /** The single corner handle resizes both axes at once. */
  private startResize(event: PointerEvent, layer: LayerId): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const { wrap } = this.layers[layer];
    const cfg = this.getCfg().layers[layer];
    handle.setPointerCapture(event.pointerId);
    window.clearTimeout(this.handleTimers[layer]);
    wrap.classList.add('handles', 'resizing');

    const startX = event.clientX;
    const startY = event.clientY;
    const picW = Math.max(1, this.picture.width);
    const picH = Math.max(1, this.picture.height);
    const startWidth = cfg.maxWidth;
    const startAnchorY = cfg.anchorY;
    // The rendered container height, whether it hugs the text or was set explicitly.
    const startHeight = Math.max(1, wrap.getBoundingClientRect().height);

    // The container is the unit being sized: width drives wrapping, height drives how much
    // room the text gets (it shrinks to fit when the box is too small).
    // Events are coalesced to one update per frame: pointermove can fire well above 60 Hz and
    // each update reflows the text block, so unthrottled handling is what makes it feel stuck.
    let last: PointerEvent | null = null;
    let raf = 0;
    let moved = false;
    let endH = startHeight;
    const apply = (): void => {
      raf = 0;
      const e = last;
      if (!e) return;
      // The container is centered, so moving the right edge by dx widens it by 2*dx.
      const width = clamp(
        startWidth + (2 * (e.clientX - startX)) / picW,
        MIN_WIDTH,
        MAX_WIDTH,
      );
      endH = clamp(startHeight + (e.clientY - startY), MIN_BOX_H, picH);
      const grown = endH - startHeight;
      wrap.style.width = `${width * 100}%`;
      this.cb.onMaxWidthChange(layer, Math.round(width * 1000) / 1000);
      wrap.style.height = `${endH}px`;
      // The container is bottom-anchored; shift it by the same amount it grows so the top
      // edge stays put and the bottom edge keeps tracking the cursor.
      wrap.style.transform = `translate(-50%, calc(-100% + ${grown}px))`;
      this.cb.onBoxHeightChange(layer, Math.round((endH / picH) * 10000) / 10000);
      this.fitBody(layer);
      this.showSizeTip(e.clientX, e.clientY, `${Math.round(endH)}px · ${Math.round(width * 100)}%`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      moved = true;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = null;
      this.sizeTip.classList.remove('show');
      wrap.classList.remove('resizing');
      // The preview shift becomes a real anchor move, so the container does not snap back to
      // its bottom-anchored position on release.
      if (moved) {
        this.cb.onAnchorChange(layer, cfg.anchorX, clamp(startAnchorY + (endH - startHeight) / picH, 0, 1));
      }
      wrap.style.transform = '';
      this.applyLayout();
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.showHandles(layer);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  private showSizeTip(clientX: number, clientY: number, text: string): void {
    this.sizeTip.textContent = text;
    this.sizeTip.style.left = `${clientX - this.picture.left}px`;
    this.sizeTip.style.top = `${clientY - this.picture.top - 10}px`;
    this.sizeTip.classList.add('show');
  }

  openPanel(): void {
    this.setPanelOpen(true);
  }

  private togglePanel(): void {
    this.setPanelOpen(this.panel.hidden);
  }

  private setPanelOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.host.classList.toggle('panel-open', open);
    if (open) {
      this.fitPanelHeight();
      this.syncPanel();
    } else {
      this.cancelAdMark();
      this.closeAllMenus();
    }
  }

  /**
   * The panel hangs below the dock at the video's top edge, so a fixed `100vh` cap can push its
   * last section past the bottom of the viewport where no scroll can reach it.
   */
  private fitPanelHeight(): void {
    if (this.panel.hidden) return;
    const panel = this.panel;
    panel.style.top = '';
    panel.style.maxHeight = '';
    const top = panel.getBoundingClientRect().top;
    const room = window.innerHeight - top - 12;
    if (room >= 140) {
      panel.style.maxHeight = `${Math.round(room)}px`;
      return;
    }
    const lift = Math.min(top - 8, 140 - room);
    if (lift > 0) {
      panel.style.top = `${42 - lift}px`;
      panel.style.maxHeight = `${Math.round(room + lift)}px`;
    } else {
      panel.style.maxHeight = `${Math.round(Math.max(80, room))}px`;
    }
  }

  setLibrary(items: LibraryOption[]): void {
    this.libraryItems = [...items].sort(
      (a, b) =>
        a.packTitle.localeCompare(b.packTitle, undefined, { numeric: true }) ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
    for (const target of ['a', 'b'] as LayerId[]) {
      const input = this.libInputs[target];
      // Labels can land after the panel opened; don't overwrite a query the user is typing.
      if (input && this.shadow.activeElement !== input) this.syncLayerInput(target);
      const menu = this.libMenuEls[target];
      if (menu && !menu.hidden && !this.libOnline[target]) this.renderLocal(target);
    }
  }

  /** Menu supplied by the content script (online search, directory listing…). */
  showLibraryMenu(target: LibraryTarget, rows: LibraryRow[], status = ''): void {
    this.libOnline[target] = true;
    this.libRows[target] = rows;
    this.libStatus[target] = status;
    this.libActive[target] = rows.length ? 0 : -1;
    this.renderMenu(target);
  }

  closeLibraryMenu(target: LibraryTarget): void {
    this.libOnline[target] = false;
    this.libRows[target] = [];
    this.libStatus[target] = '';
    this.libActive[target] = -1;
    // The pack box keeps its query: browsing series → directory → archive is one session.
    const input = this.libInputs[target];
    if (input && target !== 'pack') input.value = this.libCommitted[target];
    const menu = this.libMenuEls[target];
    if (menu) {
      menu.hidden = true;
      menu.textContent = '';
    }
  }

  private closeAllMenus(): void {
    for (const target of LIB_TARGETS) this.closeLibraryMenu(target);
  }

  private renderFor(target: LibraryTarget): void {
    if (target === 'pack') this.renderPackHint();
    else this.renderLocal(target);
  }

  /** The committed label is a display value, not a query: focusing must list the whole library. */
  private menuQuery(target: LibraryTarget, input: HTMLInputElement): string {
    const typed = input.value.trim();
    return target !== 'pack' && typed === this.libCommitted[target] ? '' : typed;
  }

  private renderLocal(target: LayerId): void {
    const input = this.libInputs[target];
    if (!input) return;
    const typed = this.menuQuery(target, input);
    const query = typed.toLowerCase();
    const matches = query
      ? this.libraryItems.filter(
          (i) =>
            i.label.toLowerCase().includes(query) ||
            i.name.toLowerCase().includes(query) ||
            i.packTitle.toLowerCase().includes(query),
        )
      : this.libraryItems;
    const rows: LibraryRow[] = matches
      .slice(0, 40)
      .map((i) => ({ key: `local:${i.id}`, title: i.label, meta: i.packTitle }));
    let status = '';
    if (query && !matches.length) {
      rows.push({ key: 'online', title: `在线搜索「${typed}」`, meta: 'kitsunekko' });
    } else if (!query && !this.libraryItems.length) {
      status = '还没有字幕包 — 在上方「字幕包」里在线搜索';
    }
    this.libOnline[target] = false;
    this.libRows[target] = rows;
    this.libStatus[target] = status;
    this.libActive[target] = rows.length ? 0 : -1;
    this.renderMenu(target);
  }

  private renderPackHint(): void {
    const input = this.libInputs.pack;
    if (!input) return;
    const query = input.value.trim();
    this.libOnline.pack = false;
    this.libRows.pack = [];
    this.libStatus.pack = query
      ? `回车在线搜索「${query}」`
      : '输入番剧名（中文 / 英文 / 罗马音）后回车，在线搜索 kitsunekko';
    this.libActive.pack = -1;
    this.renderMenu('pack');
  }

  private renderMenu(target: LibraryTarget): void {
    const menu = this.libMenuEls[target];
    if (!menu) return;
    const rows = this.libRows[target];
    const status = this.libStatus[target];
    menu.textContent = '';
    // Async results can land after the panel was closed; never float a menu over nothing.
    menu.hidden = this.panel.hidden || (rows.length === 0 && !status);
    if (menu.hidden) return;
    if (status) menu.appendChild(el('div', 'lib-status', status));
    rows.forEach((row, index) => {
      const item = el('div', 'lib-item');
      if (index === this.libActive[target]) item.classList.add('active');
      item.append(el('span', 't', row.title));
      if (row.meta) item.append(el('span', 'meta', row.meta));
      item.title = row.meta ? `${row.title} · ${row.meta}` : row.title;
      // Keep focus in the search box, otherwise its blur closes the menu before the click lands.
      item.addEventListener('pointerdown', (e) => e.preventDefault());
      item.addEventListener('click', () => this.pickRow(target, row));
      menu.appendChild(item);
    });
    this.positionMenu(target);
  }

  /** Menus live in the stage, not the panel, so the scrolling panel cannot clip or stretch them. */
  private positionMenu(target: LibraryTarget): void {
    const menu = this.libMenuEls[target];
    const input = this.libInputs[target];
    if (!menu || !input || menu.hidden) return;
    const r = input.getBoundingClientRect();
    const width = Math.max(160, Math.min(r.width, window.innerWidth - 12));
    const left = Math.min(Math.max(6, r.left), Math.max(6, window.innerWidth - width - 6));
    const height = menu.offsetHeight;
    let top = r.bottom + 4;
    if (top + height > window.innerHeight - 6) {
      const above = r.top - 4 - height;
      top = above > 6 ? above : Math.max(6, window.innerHeight - 6 - height);
    }
    menu.style.width = `${Math.round(width)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  private repositionMenus = (): void => {
    for (const target of LIB_TARGETS) {
      const menu = this.libMenuEls[target];
      if (menu && !menu.hidden) this.positionMenu(target);
    }
  };

  private pickRow(target: LibraryTarget, row: LibraryRow): void {
    const input = this.libInputs[target];
    if (row.key === 'online') {
      const query = input?.value.trim() ?? '';
      if (!query) return;
      this.closeLibraryMenu(target);
      const pack = this.libInputs.pack;
      if (pack) {
        pack.value = query;
        pack.focus();
      }
      this.cb.onOnlineSearch(query);
      return;
    }
    if (input && target === 'pack') input.value = '';
    else this.closeLibraryMenu(target);
    this.cb.onLibraryPick(target, row.key);
  }

  private moveActive(target: LibraryTarget, delta: number): void {
    const rows = this.libRows[target];
    if (!rows.length) return;
    const at = this.libActive[target];
    this.libActive[target] = at < 0 ? 0 : (at + delta + rows.length) % rows.length;
    this.renderMenu(target);
  }

  private bindLibrarySearch(target: LibraryTarget, input: HTMLInputElement): void {
    const menu = el('div', 'lib-menu');
    menu.hidden = true;
    this.stage.appendChild(menu);
    this.libInputs[target] = input;
    this.libMenuEls[target] = menu;

    input.addEventListener('input', () => this.renderFor(target));
    input.addEventListener('focus', () => {
      // Committed label is a value, not a query: select it so typing replaces it and list the whole library.
      if (target !== 'pack' && input.value === this.libCommitted[target]) input.select();
      this.renderFor(target);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLibraryMenu(target);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveActive(target, e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      const query = this.menuQuery(target, input);
      if (e.key === 'Enter' && query) {
        const active = this.libRows[target][this.libActive[target]];
        e.preventDefault();
        if (active) this.pickRow(target, active);
        else if (target === 'pack') this.cb.onOnlineSearch(query);
      }
    });
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (this.shadow.activeElement === input) return;
        this.closeLibraryMenu(target);
      }, 0);
    });
  }

  setAdState(state: AdState): void {
    this.adState = state;
    if (!state.canEdit && this.adPendingStart !== null) {
      this.adPendingStart = null;
      this.cb.onAdPending(null);
    }
    this.renderAds();
  }

  setAutoSkip(enabled: boolean): void {
    this.autoSkipAds = enabled;
    this.renderAds();
  }

  /** Don't rebuild under a field the user is typing in; the next state push refreshes it. */
  private adEditing(): boolean {
    const active = this.shadow.activeElement;
    return !!active && active.tagName === 'INPUT' && !!this.adStrip?.contains(active);
  }

  private renderAds(): void {
    const { slots, canEdit, seriesLabel } = this.adState;
    if (this.adStartBtn) this.adStartBtn.disabled = !canEdit;
    if (this.adEndBtn) {
      this.adEndBtn.disabled = !canEdit || this.adPendingStart === null;
      this.adEndBtn.classList.toggle('on', this.adPendingStart !== null);
    }
    if (this.adTitle) {
      this.adTitle.title = seriesLabel
        ? `${seriesLabel}：开始与结束时间按全部已标记剧集取均值`
        : '按全部已标记剧集取均值';
    }
    if (this.adSkipBtn) {
      this.adSkipBtn.classList.toggle('on', this.autoSkipAds);
      this.adSkipBtn.title = this.autoSkipAds ? '自动跳过已标记片段：开' : '自动跳过已标记片段：关';
    }

    const strip = this.adStrip;
    if (!strip || this.adEditing()) return;
    strip.textContent = '';
    strip.hidden = !slots.length;
    slots.forEach((slot, index) => strip.appendChild(this.adChip(slot, index, canEdit)));
  }

  /** Marks stay visible read-only when the episode is unknown; only then are the fields locked. */
  private adChip(slot: AdSlot, index: number, editable: boolean): HTMLSpanElement {
    const chip = el('span', 'mark-chip');
    const start = el('input');
    start.type = 'text';
    start.spellcheck = false;
    start.disabled = !editable;
    start.value = fmtClock(slot.at);
    start.title = '跳过起点（08:17 或 1:08:17）';
    const end = el('input');
    end.type = 'text';
    end.spellcheck = false;
    end.disabled = !editable;
    end.value = fmtClock(slot.at + slot.duration);
    end.title = '跳过终点';
    const commit = (): void => {
      const s = parseClock(start.value);
      const e = parseClock(end.value);
      if (s === null || e === null || e - s < 0.5) {
        start.value = fmtClock(slot.at);
        end.value = fmtClock(slot.at + slot.duration);
        return;
      }
      this.adCommit(this.adState.slots.map((item, i) => (i === index ? { at: s, duration: e - s } : item)));
    };
    start.addEventListener('change', commit);
    end.addEventListener('change', commit);
    const del = iconButton('close', '删除该片段');
    del.hidden = !editable;
    del.addEventListener('click', () => this.adCommit(this.adState.slots.filter((_, i) => i !== index)));
    chip.append(start, el('span', 'sep', '–'), end, del);
    return chip;
  }

  private adCommit(slots: AdSlot[]): void {
    this.adState = { ...this.adState, slots };
    this.renderAds();
    this.cb.onAdSlotsChange(slots);
  }

  private onAdMarkStart(): void {
    this.adPendingStart = Math.max(0, this.cb.onAdCurrentTime());
    this.cb.onAdPending(this.adPendingStart);
    this.renderAds();
  }

  private onAdMarkEnd(): void {
    const start = this.adPendingStart;
    if (start === null) return;
    const now = Math.max(0, this.cb.onAdCurrentTime());
    this.adPendingStart = null;
    this.cb.onAdPending(null);
    if (now - start < 0.5) {
      this.renderAds();
      return;
    }
    this.adCommit([...this.adState.slots, { at: start, duration: now - start }]);
  }

  /** Drop an unfinished mark when the panel closes or the episode is no longer editable. */
  private cancelAdMark(): void {
    if (this.adPendingStart === null) return;
    this.adPendingStart = null;
    this.cb.onAdPending(null);
    this.renderAds();
  }

  syncPanel(): void {
    const cfg = this.getCfg();
    this.controls.offset.value = String(cfg.offset);
    this.controls.offsetVal.value = cfg.offset.toFixed(1);
    this.controls.capSyncA();
    this.controls.capSyncB();
    this.controls.fontSyncA();
    this.controls.fontSyncB();
        this.controls.colorize.checked = cfg.layers.a.colorize;
    this.controls.furigana.checked = cfg.layers.a.furigana;
    this.controls.enableB.checked = cfg.layers.b.enabled;
    this.syncLayerInput('a');
    this.syncLayerInput('b');
    this.renderAds();
  }

  /** The layer input doubles as the reader: idle it shows "pack | subtitle" for the loaded file. */
  private layerDisplayName(target: LayerId): string {
    const name = this.getCfg().subs[target].name;
    if (!name) return '';
    const item =
      this.libraryItems.find((i) => i.name === name) ?? this.libraryItems.find((i) => i.label === name);
    if (!item) return name;
    return item.packTitle && item.packTitle !== item.label ? `${item.packTitle} | ${item.label}` : item.label;
  }

  private syncLayerInput(target: LayerId): void {
    const input = this.libInputs[target];
    if (!input) return;
    const value = this.layerDisplayName(target);
    this.libCommitted[target] = value;
    // The field truncates visually when idle; title keeps the whole name reachable without widening the panel.
    input.title = value || input.title;
    input.value = value;
  }

  private buildPanel(): HTMLDivElement {
    const panel = el('div', 'panel');
    panel.hidden = true;

    const title = el('h4', '', '字幕设置');
    panel.appendChild(title);

    const packRow = el('div', 'row');
    packRow.appendChild(el('label', '', '字幕包'));
    const pack = el('input', 'lib-search');
    pack.type = 'search';
    pack.placeholder = '在线搜索字幕包…';
    pack.title = '输入番剧名后回车，在线搜索 kitsunekko 并导入';
    this.bindLibrarySearch('pack', pack);
    packRow.appendChild(pack);

    const subRow = (id: LayerId) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', id === 'a' ? '原文' : '译文'));
      // One combobox: idle it shows the loaded subtitle's name, focusing opens the search list.
      const combo = el('input', 'lib-search');
      combo.type = 'search';
      combo.placeholder = id === 'a' ? '搜索原文字幕…' : '搜索译文字幕…';
      combo.title = '点击选择已导入的字幕；输入关键字过滤，无结果时可转在线搜索';
      this.bindLibrarySearch(id, combo);
      const pick = iconButton('file', '从本地选择字幕文件');
      pick.addEventListener('click', () => this.cb.onPickFile(id));
      const clear = iconButton('close', '清除该层字幕');
      clear.addEventListener('click', () => this.cb.onClearSubtitle(id));
      row.append(combo, pick, clear);
      return row;
    };
    panel.append(subRow('a'), subRow('b'), packRow);

    const secOffset = el('div', 'sec');
    const offsetRow = el('div', 'row');
    offsetRow.appendChild(el('label', '', '时间偏移'));
    const offset = el('input');
    offset.type = 'range';
    offset.min = '-10';
    offset.max = '10';
    offset.step = '0.1';
    const offsetVal = el('input', 'offset-num');
    offsetVal.type = 'number';
    offsetVal.min = offset.min;
    offsetVal.max = offset.max;
    offsetVal.step = offset.step;
    offsetVal.title = '负值提前、正值延后';
    offsetVal.setAttribute('aria-label', '时间偏移（秒）');
    const clampOffset = (v: number): number => Math.min(10, Math.max(-10, v));
    const setOffset = (value: number): void => {
      this.getCfg().offset = value;
      this.cb.onCfgChange();
    };
    offset.addEventListener('input', () => {
      const value = Number(offset.value);
      offsetVal.value = value.toFixed(1);
      setOffset(value);
    });
    offsetVal.addEventListener('input', () => {
      const value = Number(offsetVal.value);
      if (offsetVal.value.trim() === '' || !Number.isFinite(value)) return;
      const clamped = clampOffset(value);
      offset.value = String(clamped);
      setOffset(clamped);
    });
    offsetVal.addEventListener('change', () => {
      const value = Number(offsetVal.value);
      if (offsetVal.value.trim() === '' || !Number.isFinite(value)) {
        offsetVal.value = this.getCfg().offset.toFixed(1);
        return;
      }
      const clamped = clampOffset(value);
      offset.value = String(clamped);
      offsetVal.value = clamped.toFixed(1);
      setOffset(clamped);
    });
    offsetRow.append(offset, offsetVal);
    secOffset.appendChild(offsetRow);
    this.controls.offset = offset;
    this.controls.offsetVal = offsetVal;

    const capRow = (id: LayerId) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', `${id === 'a' ? '原文' : '译文'}显示`));
      const chips = el('div', 'chips');
      const input = el('input', 'cap');
      input.type = 'number';
      input.min = '0';
      input.step = '100';
      input.title = '自定义毫秒数；0 = 跟随字幕结束时间';
      const presets: [HTMLButtonElement, number][] = [];
      const modes: [HTMLButtonElement, boolean][] = [];
      // A lit border marks the active choice: exactly one preset, or the custom input.
      const sync = (): void => {
        const lc = this.getCfg().layers[id];
        for (const [button, ms] of presets) button.classList.toggle('on', lc.displayCapMs === ms);
        input.classList.toggle('on', !CAP_PRESETS.some(([, ms]) => ms === lc.displayCapMs));
        for (const [button, fromEnd] of modes) {
          button.classList.toggle('on', lc.displayCapFromEnd === fromEnd);
          // With no cap every cue runs its full duration, so the anchor cannot matter yet.
          button.disabled = lc.displayCapMs <= 0;
        }
        if (this.shadow.activeElement !== input) input.value = String(lc.displayCapMs);
      };
      for (const [text, ms] of CAP_PRESETS) {
        const button = el('button', 'chip', text);
        button.type = 'button';
        button.addEventListener('click', () => {
          this.getCfg().layers[id].displayCapMs = ms;
          sync();
          this.cb.onCfgChange();
        });
        presets.push([button, ms]);
        chips.appendChild(button);
      }
      input.addEventListener('change', () => {
        this.getCfg().layers[id].displayCapMs = Math.max(0, Number(input.value) || 0);
        sync();
        this.cb.onCfgChange();
      });
      chips.appendChild(input);
      chips.appendChild(el('span', 'sep'));
      for (const [text, fromEnd] of [
        ['开头', false],
        ['结束前', true],
      ] as [string, boolean][]) {
        const button = el('button', 'chip', text);
        button.type = 'button';
        button.title = fromEnd
          ? '先听后看：整句先隐藏，最后 N 毫秒才出字幕'
          : '先看后听：整句开头显示 N 毫秒后隐藏';
        button.addEventListener('click', () => {
          this.getCfg().layers[id].displayCapFromEnd = fromEnd;
          sync();
          this.cb.onCfgChange();
        });
        modes.push([button, fromEnd]);
        chips.appendChild(button);
      }
      row.appendChild(chips);
      if (id === 'a') this.controls.capSyncA = sync;
      else this.controls.capSyncB = sync;
      return row;
    };
    secOffset.append(capRow('a'), capRow('b'));

    const fontRow = (id: LayerId) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', id === 'a' ? '原文字号' : '译文字号'));
      // The stored value is a fraction of the picture height, so the same setting keeps its
      // proportion when the player is resized. The number beside it is that fraction rendered
      // at the current picture height, which is what a user actually wants to set.
      const range = el('input');
      range.type = 'range';
      range.min = String(MIN_SCALE);
      range.max = String(MAX_SCALE);
      range.step = '0.002';
      range.title = '字号占画面高度的比例';
      const px = el('input', 'offset-num');
      px.type = 'number';
      px.min = '8';
      px.step = '1';
      px.title = '实际渲染字号。未设框时等于滑杆值；设框后为自适应布局的结果，滑杆作为期望下限';
      px.setAttribute('aria-label', id === 'a' ? '原文字号（像素）' : '译文字号（像素）');
      const sync = (): void => {
        const value = this.getCfg().layers[id].fontScale;
        if (this.shadow.activeElement !== range) range.value = String(value);
        // Inside a sized box the optimizer may grow the font past the slider, so report what
        // is actually painted rather than the slider's own value.
        const painted = Number.parseFloat(this.layers[id].wrap.style.fontSize);
        if (this.shadow.activeElement !== px) {
          px.value = String(Math.round(Number.isFinite(painted) ? painted : this.fontPx(id)));
        }
      };
      const apply = (): void => {
        sync();
        this.cb.onCfgChange();
      };
      range.addEventListener('input', () => {
        this.getCfg().layers[id].fontScale = clamp(Number(range.value), MIN_SCALE, MAX_SCALE);
        apply();
      });
      px.addEventListener('change', () => {
        const wanted = Number(px.value);
        if (!Number.isFinite(wanted) || wanted <= 0) {
          sync();
          return;
        }
        this.getCfg().layers[id].fontScale = clamp(wanted / Math.max(1, this.picture.height), MIN_SCALE, MAX_SCALE);
        apply();
      });
      row.append(range, px, el('span', 'hint', 'px'));
      if (id === 'a') this.controls.fontSyncA = sync;
      else this.controls.fontSyncB = sync;
      return row;
    };
    secOffset.append(fontRow('a'), fontRow('b'));

    const toggleRow = el('div', 'row');
    const colorize = el('input');
    colorize.type = 'checkbox';
    colorize.addEventListener('change', () => {
      this.getCfg().layers.a.colorize = colorize.checked;
      this.cb.onCfgChange();
    });
    const furigana = el('input');
    furigana.type = 'checkbox';
    furigana.addEventListener('change', () => {
      this.getCfg().layers.a.furigana = furigana.checked;
      this.cb.onCfgChange();
    });
    const enableB = el('input');
    enableB.type = 'checkbox';
    enableB.addEventListener('change', () => {
      this.getCfg().layers.b.enabled = enableB.checked;
      this.cb.onCfgChange();
    });
    const lbl = (input: HTMLInputElement, text: string) => {
      const l = el('label');
      l.style.flex = '0 0 auto';
      l.style.display = 'inline-flex';
      l.style.alignItems = 'center';
      l.style.gap = '4px';
      l.append(input, document.createTextNode(text));
      return l;
    };
    toggleRow.append(lbl(colorize, '词性着色'), lbl(furigana, '假名'), lbl(enableB, '译文层'));
    secOffset.appendChild(toggleRow);
    this.controls.colorize = colorize;
    this.controls.furigana = furigana;
    this.controls.enableB = enableB;

    const manageRow = el('div', 'row');
    const manage = iconButton('list', '打开字幕库管理');
    manage.addEventListener('click', () => this.cb.onOpenLibrary());
    manageRow.append(manage, el('span', 'hint', '字幕库 · 支持拖入 .srt / .vtt / .ass 载入'));
    const secLibrary = el('div', 'sec');
    secLibrary.appendChild(manageRow);

    const secAd = el('div', 'sec');
    const adHead = el('div', 'mark-head');
    this.adTitle = el('span', 'mark-title', '跳过标记');
    adHead.appendChild(this.adTitle);
    adHead.appendChild(el('span', 'grow'));
    this.adStartBtn = iconButton('markStart', '标记跳过起点');
    this.adStartBtn.addEventListener('click', () => this.onAdMarkStart());
    this.adEndBtn = iconButton('markEnd', '标记跳过终点');
    this.adEndBtn.addEventListener('click', () => this.onAdMarkEnd());
    this.adSkipBtn = iconButton('skip', '');
    this.adSkipBtn.addEventListener('click', () => {
      this.autoSkipAds = !this.autoSkipAds;
      this.renderAds();
      this.cb.onAdAutoSkipChange(this.autoSkipAds);
    });
    adHead.append(this.adStartBtn, this.adEndBtn, this.adSkipBtn);
    secAd.appendChild(adHead);

    this.adStrip = el('div', 'mark-strip');
    secAd.appendChild(this.adStrip);

    panel.append(secOffset, secAd, secLibrary);
    return panel;
  }
}