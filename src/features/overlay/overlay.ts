import type { DictEntry, DictLine } from '@/shared/dictionary';
import { defaultDictSettings, type DictSettings } from '@/shared/dictSettings';
import { withAlpha } from '@/shared/elementStyle';
import { createIcon, type IconName } from '@/shared/icons';
import { applyLanguage, getLanguage, t, type Language } from '@/shared/i18n';
import {
  activePreset,
  defaultPresets,
  defaultSubtitleStyle,
  effectiveBox,
  presetDisplayName,
  presetElements,
  presetOrder,
  saveSubtitleStyle,
  type StudyPreset,
  type SubtitleStyle,
} from '@/shared/subtitleStyle';
import { DEFAULT_AD_DURATION } from '@/shared/siteRules';
import { subtitleLanguageLabel, subtitleLanguageShortLabel } from '@/shared/subtitleLanguages';
import type { AdSlot, LayerCfg, PageCfg, Token } from '@/shared/types';
import { defaultLayer } from '@/shared/types';
import { DEFAULT_LANGUAGE, SELECTABLE_LANGUAGES, featuresFor, resolveLanguage } from '@/languages/registry';
import { SUBDL_LANGUAGES } from '@/features/scraper/providers';
import { DICT_CARD_CSS, renderDictCard } from './dictCard';
import { renderPlain, renderTokens, type DictRender, type RenderOpts } from './tokenize/render';
import { TRANSCRIPT_CSS } from './transcript';
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

/** Radix-free select sentinel: choosing it swaps in a free-text language field. */
const CUSTOM_SOURCE = '__custom';

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
/** maxWidth is a fraction of the picture width. */
const MIN_WIDTH = 0.2;
const MAX_WIDTH = 1;

/** Display-duration presets in ms; 0 keeps the cue for its full duration. */
const CAP_PRESETS: [() => string, number][] = [
  [() => t('overlay.cap.all'), 0],
  [() => '0.5s', 500],
  [() => '1s', 1000],
];

export type LibraryOption = {
  id: string;
  name: string;
  label: string;
  packTitle: string;
  /** Pack language id; surfaced in the cross-language search list. */
  language?: string;
};

/** A row the player renders in a layer's subtitle search menu. */
export type LibraryRow = { key: string; title: string; meta?: string };

/** Current episode's ad configuration, pushed by the content script. */
export type AdState = {
  slots: AdSlot[];
  seriesLabel: string;
  /** Seconds the skip shortcut adds and records. */
  duration: number;
  /** The episode is identifiable, so edits can be persisted. */
  canEdit: boolean;
};

export type OverlayCallbacks = {
  onAnchorChange: (layer: LayerId, x: number, y: number) => void;
  onFontScaleChange: (layer: LayerId, scale: number) => void;
  onMaxWidthChange: (layer: LayerId, width: number) => void;
  onPickFile: (target: LayerId) => void;
  onLibraryPick: (target: LibraryTarget, key: string) => void;
  onOnlineSearch: (query: string) => void;
  onClearSubtitle: (target: LayerId) => void;
  /** The layer's language select changed; null means auto-detect. */
  onLayerLanguage: (layer: LayerId, language: string | null) => void;
  /** The pack search scope changed; null means every available source. */
  onPackLanguage: (language: string | null) => void;
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
  /** The dock's transcript button: the host owns the cue list and the drawer state. */
  onTranscriptToggle: () => void;
  /** The settings panel opened; the host closes the transcript so the two surfaces cannot overlap. */
  onPanelOpen: () => void;
};

const CSS = `
:host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; }
.stage { position: absolute; overflow: visible; }
.layer[lang="th"] { font-family: "Noto Sans Thai", "Leelawadee UI", Thonburi, Tahoma, sans-serif; line-height: 1.7; word-break: normal; overflow-wrap: normal; }
.layer { position: absolute; transform: translate(-50%, -100%); display: flex; align-items: center; justify-content: center; box-sizing: border-box; text-align: center; pointer-events: none; user-select: none; line-height: 1.38; font-weight: 700; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,.92), 0 0 2px rgba(0,0,0,.92); transition: opacity 160ms linear; opacity: 0; }
.layer .body { display: inline-block; max-width: 100%; pointer-events: auto; cursor: grab; }
/* The subtitle box is a pseudo-element so its padding and bleed never enter the layout measurement. */
.layer .body.boxed { position: relative; }
.layer .body.boxed::before { content: ''; position: absolute; inset: -0.15em -0.45em; border-radius: 8px; background: var(--box-bg); }
.layer .body.boxed > * { position: relative; }
.layer.dragging { will-change: transform; }
.layer.dragging .body { cursor: grabbing; }
.layer .line { white-space: pre-wrap; }
.layer rt { font-size: 0.48em; color: rgba(255,255,255,.72); font-weight: 500; letter-spacing: 0.02em; }
/* Invisible grab area: the whole block body drags, the grip only makes small blocks grabbable. */
.grip { position: absolute; pointer-events: auto; opacity: 0; touch-action: none; user-select: none; transition: opacity 140ms; left: -10px; top: -10px; width: 20px; height: 20px; border-radius: 50%; cursor: grab; background: transparent; box-shadow: none; }
.layer.dragging .grip { cursor: grabbing; }
/* One corner handle, faint at rest: the resize affordance stays findable without covering the picture. */
.rz { position: absolute; pointer-events: auto; touch-action: none; user-select: none; transition: opacity 140ms; opacity: .2; left: 0; top: 0; width: 24px; height: 24px; cursor: nwse-resize; }
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
.panel .row > label { flex: 0 0 72px; opacity: .8; }
.panel input.offset-num { flex: 0 0 52px; width: 52px; text-align: right; font-variant-numeric: tabular-nums; }
.panel input.offset-num:focus { outline: none; border-color: #7FD3FF; }
.panel button { border-radius: 6px; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.08); color: #e8eaed; font-size: 11px; padding: 3px 8px; cursor: pointer; flex: 0 0 auto; }
.panel button:hover { background: rgba(255,255,255,.16); }
.panel input[type=range] { flex: 1; min-width: 0; accent-color: #7FD3FF; }
.panel input[type=number] { width: 64px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 2px 5px; font-size: 11px; }
.panel input[type=search] { flex: 1 1 auto; min-width: 0; width: 100%; box-sizing: border-box; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 3px 6px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel input[type=search]:focus { outline: none; border-color: #7FD3FF; text-overflow: clip; }
.panel select { flex: 1 1 auto; min-width: 0; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #e8eaed; border-radius: 5px; padding: 2px 4px; font-size: 11px; }
.panel select:focus { outline: none; border-color: #7FD3FF; }
.panel select option { background: #181b22; color: #e8eaed; }
.panel select.lang-select { flex: 0 0 auto; max-width: 82px; }
.panel input.lang-code { flex: 0 0 66px; width: 66px; }
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
.panel .mark-chip input { width: 44px; padding: 0; border: 0; background: transparent; color: #e8eaed; font-size: 10px; font-variant-numeric: tabular-nums; text-align: center; }
.panel .mark-chip input:focus { outline: none; color: #7FD3FF; }
.panel .mark-chip .brk { opacity: .55; font-size: 10px; }
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
.panel .mark-head .mark-hint { margin-left: 2px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.panel .row > .hint { flex: 1; min-width: 0; }
.dict-word { pointer-events: auto; cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,.5); }
.dict-word:hover { background: rgba(127,211,255,.22); border-bottom-color: #7FD3FF; }
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
  private transcriptBtn: HTMLButtonElement;
  private theaterBtn: HTMLButtonElement;
  /** The transcript drawer is created on first use; the host fills it with rows. */
  private transcriptEl: HTMLDivElement | null = null;
  private panel: HTMLDivElement;
  private sizeTip: HTMLDivElement;
  private card: HTMLDivElement;
  /** 'doc' = a word hovered in the transcript, outside the two subtitle layers. */
  private cardLayer: LayerId | 'doc' | null = null;
  private cardAnchor: HTMLElement | null = null;
  private cardTimer = 0;
  private hoverTimer = 0;
  private dictSettings: DictSettings = defaultDictSettings();
  private subtitleStyle: SubtitleStyle = defaultSubtitleStyle();
  private presetSelect: HTMLSelectElement | null = null;
  private langSelects: Partial<Record<LayerId, HTMLSelectElement>> = {};
  /** Online pack search scope; null is the 'auto' option. */
  private packLangSelect: HTMLSelectElement | null = null;
  private lineDict = new WeakMap<HTMLElement, DictEntry[]>();
  /** Current cue, kept so a resize can re-run the layout without a new tokenization round trip. */
  private content: Record<LayerId, LayerContent | null> = { a: null, b: null };
  /** Break plan currently painted, to avoid rebuilding the DOM on every resize frame. */
  private planKey: Record<LayerId, string> = { a: '', b: '' };
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
    duration: DEFAULT_AD_DURATION,
    canEdit: false,
  };
  private adStrip: HTMLDivElement | null = null;
  private adRecordBtn: HTMLButtonElement | null = null;
  private adTitle: HTMLElement | null = null;
  private adSkipBtn: HTMLButtonElement | null = null;
  private adHint: HTMLElement | null = null;
  private autoSkipAds = true;
  /** Content time captured by the first "标记开始" click, until "标记结束" completes the slot. */
  private adPendingStart: number | null = null;
  private language: Language = getLanguage();
  private theaterActive = false;

  constructor(
    private getCfg: () => PageCfg,
    private cb: OverlayCallbacks,
  ) {
    this.host = el('div', 'host');
    this.host.id = 'jp-sub-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = `${CSS}${DICT_CARD_CSS}${TRANSCRIPT_CSS}`;
    this.shadow.appendChild(style);

    this.stage = el('div', 'stage');
    this.shadow.appendChild(this.stage);

    const makeLayer = (id: LayerId) => {
      const wrap = el('div', 'layer empty');
      wrap.dataset.layer = id;
      const body = el('div', 'body');

      // Handles mirror the body drag / resize so the gesture stays reachable at the block edges.
      const label = this.layerLabel(id);
      const grip = el('div', 'grip');
      grip.title = t('overlay.grip.drag', { layer: label });
      grip.addEventListener('pointerdown', (e) => this.startDrag(e, id));
      grip.addEventListener('dblclick', () => {
        this.cb.onAnchorChange(id, 0.5, id === 'a' ? 0.9 : 0.82);
        this.applyLayout();
      });
      const rz = el('div', 'rz');
      rz.title = t('overlay.resize.drag', { layer: label });
      rz.addEventListener('pointerdown', (e) => this.startResize(e, id));
      rz.addEventListener('dblclick', () => {
        this.cb.onMaxWidthChange(id, defaultLayer().maxWidth);
        this.cb.onFontScaleChange(id, defaultLayer().fontScale);
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

    this.card = el('div', 'dict-card');
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

    this.dockBtn = el('button', '', t('overlay.dock.label'));
    this.dockBtn.title = t('overlay.dock.title');
    this.dockBtn.addEventListener('click', () => this.togglePanel());
    this.transcriptBtn = el('button');
    this.transcriptBtn.type = 'button';
    this.transcriptBtn.appendChild(icon('list'));
    this.transcriptBtn.title = t('overlay.transcript.open');
    this.transcriptBtn.setAttribute('aria-label', t('overlay.transcript.open'));
    this.transcriptBtn.addEventListener('click', () => this.cb.onTranscriptToggle());
    this.theaterBtn = el('button', 'theater');
    this.theaterBtn.type = 'button';
    this.theaterBtn.appendChild(icon('expand'));
    this.theaterBtn.title = t('overlay.theater.enter');
    this.theaterBtn.setAttribute('aria-label', t('overlay.theater.enter'));
    this.theaterBtn.addEventListener('click', () => this.cb.onTheaterToggle());
    const dock = el('div', 'dock');
    dock.append(this.dockBtn, this.transcriptBtn, this.theaterBtn);
    this.stage.appendChild(dock);

    this.panel = this.buildPanel();
    // Stable handle for debugging and for talking about the settings surface by name.
    this.panel.id = 'jp-sub-panel';
    this.stage.appendChild(this.panel);
    // A clicked button keeps focus, so the next Space (the player's play/pause shortcut) would
    // activate it again instead of reaching the page. Drop focus once the click is delivered.
    this.shadow.addEventListener('click', this.blurButton, true);
    // Menus float above the panel; a scroll would strand them at stale coordinates.
    this.panel.addEventListener('scroll', this.onPanelScroll);
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

  /** The layer name used in labels; resolved on every render so a switch relabels it. */
  private layerLabel(layer: LayerId): string {
    return t(layer === 'a' ? 'overlay.layer.a' : 'overlay.layer.b');
  }

  /** Compact layer name for the row labels, where a 320px panel cannot afford the full word. */
  private layerShort(layer: LayerId): string {
    return t(layer === 'a' ? 'overlay.panel.layerA' : 'overlay.panel.layerB');
  }

  private onPanelScroll = (): void => this.closeAllMenus();

  /**
   * Switches language without dropping overlay state. The panel is rebuilt rather than patched
   * (its labels live in ~50 elements); settings read back from the page config, so nothing is lost.
   */
  setLanguage(language: Language): void {
    if (language === this.language) return;
    this.language = language;
    applyLanguage(language);
    this.host.lang = language;
    this.hideCard();
    this.closeAllMenus();
    // Menus are appended to the stage by `bindLibrarySearch`, so dropping the panel does not remove them.
    for (const target of LIB_TARGETS) this.libMenuEls[target]?.remove();

    const wasOpen = !this.panel.hidden;
    const scrollTop = this.panel.scrollTop;
    const old = this.panel;
    const next = this.buildPanel();
    next.id = 'jp-sub-panel';
    next.hidden = !wasOpen;
    next.addEventListener('scroll', this.onPanelScroll);
    old.replaceWith(next);
    this.panel = next;

    this.syncPanel();
    this.relabelChrome();
    if (wasOpen) {
      next.scrollTop = scrollTop;
      this.fitPanelHeight();
    }
  }

  /** Nodes the constructor owns, outside the rebuilt panel. */
  private relabelChrome(): void {
    this.dockBtn.textContent = t('overlay.dock.label');
    this.dockBtn.title = t('overlay.dock.title');
    this.transcriptBtn.title = t('overlay.transcript.open');
    this.transcriptBtn.setAttribute('aria-label', t('overlay.transcript.open'));
    for (const id of ['a', 'b'] as LayerId[]) {
      const label = this.layerLabel(id);
      this.layers[id].grip.title = t('overlay.grip.drag', { layer: label });
      this.layers[id].rz.title = t('overlay.resize.drag', { layer: label });
    }
    this.setTheater(this.theaterActive);
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
    if (x >= left && x <= left + width && y >= top && y <= top + height) return true;
    // The transcript is its own surface: dropping a subtitle file over it must still load it.
    const tx = this.transcriptEl;
    if (!tx || tx.hidden) return false;
    const r = tx.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
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

  setNlpStatus(text: string): void {
    let hint = this.panel.querySelector<HTMLElement>('[data-nlp-status]');
    if (!hint) {
      hint = document.createElement('div');
      hint.dataset.nlpStatus = '';
      hint.className = 'hint';
      hint.setAttribute('role', 'status');
      this.panel.appendChild(hint);
    }
    hint.textContent = text;
  }

  /** The layer's content language; each layer is independent. */
  private languageOf(layer: LayerId): string {
    return this.getCfg().subs[layer].language ?? DEFAULT_LANGUAGE;
  }

  render(
    layer: LayerId,
    lines: string[],
    tokens: (DictLine | null)[],
    cfg: LayerCfg,
    dict: DictRender,
    preset?: StudyPreset,
  ): void {
    const language = this.languageOf(layer);
    this.layers[layer].wrap.lang = language;
    const resolved = preset ?? activePreset(this.subtitleStyle, language);
    if (this.cardLayer === layer && this.dictSettings.duration.mode === 'cue') this.hideCard();
    // A preset is itself a reason to paint tokens: its features carry the styling even when the
    // standalone POS-colour switch is off.
    const themed = cfg.colorize || resolved.features.length > 0;
    const furigana = cfg.furigana || resolved.features.includes('reading');
    // Keep the source, not just the painted DOM: a resize re-runs the layout optimizer and needs
    // the units back. Tokenized lines break at token boundaries, so a slice is still renderable.
    const paragraphs: ParaContent[] = lines.map((line, i) => {
      const parsed = tokens[i];
      if (parsed && parsed.tokens.length && (themed || dict.enabled)) {
        return {
          kind: 'tokens',
          tokens: parsed.tokens,
          entries: parsed.entries,
          opts: {
            colorize: themed,
            furigana,
            style: {
              preset: resolved,
              elements: presetElements(featuresFor(language), resolved),
              registry: featuresFor(language),
              language,
            },
            dict: { ...dict, entries: parsed.entries },
          },
        };
      }
      return { kind: 'plain', segments: resolveLanguage(language).text.segment(line) };
    });
    const ruby = paragraphs.some(
      (para) => para.kind === 'tokens' && furigana && para.tokens.some((token) => !!token.reading),
    );
    this.content[layer] = { paragraphs, ruby };
    this.planKey[layer] = '';
    this.layers[layer].wrap.classList.toggle('empty', paragraphs.length === 0);
    this.applyBoxStyle(layer, resolved);
    this.applyLayout();
  }

  /** The box behind the whole subtitle: the preset's override, else the global one. */
  private applyBoxStyle(id: LayerId, preset: StudyPreset): void {
    const body = this.layers[id].body;
    const { backgroundColor, backgroundOpacity } = effectiveBox(this.subtitleStyle, preset);
    if (!backgroundColor) {
      body.classList.remove('boxed');
      body.style.removeProperty('--box-bg');
      return;
    }
    body.classList.add('boxed');
    body.style.setProperty('--box-bg', withAlpha(backgroundColor, backgroundOpacity));
  }

  clear(layer: LayerId): void {
    if (this.cardLayer === layer) this.hideCard();
    this.content[layer] = null;
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

  private onWordClick = (event: MouseEvent, layer: LayerId | 'doc'): void => {
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

  private onWordOver = (event: MouseEvent, layer: LayerId | 'doc'): void => {
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
    this.theaterActive = active;
    const label = t(active ? 'overlay.theater.exit' : 'overlay.theater.enter');
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

  setSubtitleStyle(style: SubtitleStyle): void {
    this.subtitleStyle = style;
    this.fillPresetOptions();
  }

  /** The layer whose study modes the panel edits: the source layer once it has content. */
  private presetLayer(): LayerId {
    const cfg = this.getCfg();
    if (cfg.subs.a.text) return 'a';
    return cfg.subs.b.text ? 'b' : 'a';
  }

  /** Rebuilds the panel's preset list for the active language; called on every storage change. */
  private fillPresetOptions(): void {
    const select = this.presetSelect;
    if (!select) return;
    select.textContent = '';
    const language = this.languageOf(this.presetLayer());
    const registry = featuresFor(language);
    // A selectable language may not have a bucket yet; its seeded built-ins still belong in the
    // list, and selecting one writes through to storage below.
    const presets = this.subtitleStyle.presets[language] ?? defaultPresets(registry);
    for (const id of presetOrder(registry, this.subtitleStyle, language)) {
      const preset = presets[id];
      if (!preset) continue;
      const option = el('option', '', presetDisplayName(registry, preset, t));
      option.value = id;
      select.appendChild(option);
    }
    select.value = activePreset(this.subtitleStyle, language).id;
  }

  /**
   * Language selects reflect the stored per-layer choice. In auto mode the option label carries
   * the detected language, so the environment that the study layer switched to stays visible.
   */
  private syncLanguageSelects(): void {
    for (const id of ['a', 'b'] as LayerId[]) {
      const select = this.langSelects[id];
      if (!select) continue;
      const sub = this.getCfg().subs[id];
      const auto = sub.languageAuto !== false;
      const detected = sub.language && sub.language !== 'plain' ? resolveLanguage(sub.language).shortLabel : '';
      const autoOption = select.querySelector<HTMLOptionElement>('option[value="auto"]');
      if (autoOption) {
        autoOption.textContent =
          auto && detected
            ? t('overlay.panel.languageAutoDetected', { language: detected })
            : t('overlay.panel.languageAuto');
      }
      select.value = !auto && sub.language ? sub.language : 'auto';
    }
    if (this.packLangSelect) this.packLangSelect.value = this.getCfg().packLanguage ?? 'auto';
  }

  private showCard(entry: DictEntry, anchor: HTMLElement, layer: LayerId | 'doc'): void {
    window.clearTimeout(this.cardTimer);
    this.hideCard();
    this.cardLayer = layer;
    this.cardAnchor = anchor;
    renderDictCard(this.card, entry, {
      uiLanguage: this.language,
      romaji: this.dictSettings.pronunciation.romaji,
      closable: true,
      onClose: () => this.hideCard(),
      onSpeak: (text, language) => this.speak(text, language),
    });
    this.card.hidden = false;
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
    // A word in the transcript strip sits outside the picture; clamping to the stage would drag
    // the card back over the video. Bound by the room between the stage origin and the viewport.
    const boundsW = Math.max(stage.width, window.innerWidth - stage.left);
    const left = Math.min(boundsW - w / 2 - 4, Math.max(w / 2 + 4, centerX));
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

  private speak(text: string, lang = 'ja'): void {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'en' ? 'en-US' : 'ja-JP';
    utterance.rate = lang === 'en' ? 0.95 : 0.9;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
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
      // No explicit height: the container hugs the text at the size the user chose.
      wrap.style.height = '';
      wrap.style.opacity = this.visible[id] ? String(lc.opacity) : '0';
      this.fitBody(id);
    }
  }

  /**
   * Lays the current cue out for the container. The container hugs the text; the browser wraps
   * it at the container width. The painted font is the user's `fontScale`, so every cue renders
   * at the same size and the adjustable frame follows the text.
   */
  private fitBody(id: LayerId): void {
    const { wrap } = this.layers[id];
    const content = this.content[id];
    wrap.style.fontSize = `${this.fontPx(id)}px`;
    wrap.style.lineHeight = '';
    wrap.style.letterSpacing = '';
    this.paint(id, content ? content.paragraphs.map(() => [0]) : []);
    this.placeHandles(id);
  }

  /** Handles sit on the text block — i.e. on the painted subtitle box — not on the wrap width. */
  private placeHandles(id: LayerId): void {
    const { wrap, body, grip, rz } = this.layers[id];
    const wrapRect = wrap.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const left = bodyRect.left - wrapRect.left;
    const top = bodyRect.top - wrapRect.top;
    grip.style.left = `${left - 10}px`;
    grip.style.top = `${top - 10}px`;
    // 24px handle centred on the bottom-right corner.
    rz.style.left = `${left + bodyRect.width - 12}px`;
    rz.style.top = `${top + bodyRect.height - 12}px`;
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

  /**
   * The corner handle sizes the subtitle itself: horizontal drag sets the wrap width, vertical
   * drag sets the text size. The frame hugs the text, so what you see is what is being resized.
   */
  private startResize(event: PointerEvent, layer: LayerId): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const { wrap, body } = this.layers[layer];
    const cfg = this.getCfg().layers[layer];
    handle.setPointerCapture(event.pointerId);
    window.clearTimeout(this.handleTimers[layer]);
    wrap.classList.add('handles', 'resizing');

    const startX = event.clientX;
    const startY = event.clientY;
    const picW = Math.max(1, this.picture.width);
    const picH = Math.max(1, this.picture.height);
    const startWidth = cfg.maxWidth;
    const startScale = cfg.fontScale;
    const startAnchorY = cfg.anchorY;
    const startHeight = Math.max(1, body.getBoundingClientRect().height);

    // Events are coalesced to one update per frame: pointermove can fire well above 60 Hz and
    // each update reflows the text block, so unthrottled handling is what makes it feel stuck.
    let last: PointerEvent | null = null;
    let raf = 0;
    let moved = false;
    /** How far the box is shifted on screen; the bottom edge tracks the pointer. */
    let shift = 0;
    /** Applies the size for a pointer position; returns the wrap width for the tip. */
    const sizeTo = (clientX: number, clientY: number): number => {
      // The container is centered, so moving the right edge by dx widens it by 2*dx.
      const width = clamp(startWidth + (2 * (clientX - startX)) / picW, MIN_WIDTH, MAX_WIDTH);
      // Height is font-driven now: scale by how much the pointer pulled the bottom edge.
      const wanted = clamp(startHeight + (clientY - startY), startHeight * 0.25, picH);
      const scale = clamp((startScale * wanted) / startHeight, MIN_SCALE, MAX_SCALE);
      // Use the clamped scale, so the preview does not drift past the min/max font size.
      shift = (startHeight * scale) / startScale - startHeight;
      wrap.style.width = `${width * 100}%`;
      wrap.style.transform = `translate(-50%, calc(-100% + ${shift}px))`;
      this.cb.onMaxWidthChange(layer, Math.round(width * 1000) / 1000);
      this.cb.onFontScaleChange(layer, Math.round(scale * 10000) / 10000);
      this.fitBody(layer);
      return width;
    };
    const apply = (): void => {
      raf = 0;
      const e = last;
      if (!e) return;
      const width = sizeTo(e.clientX, e.clientY);
      this.showSizeTip(e.clientX, e.clientY, `${Math.round(this.fontPx(layer))}px · ${Math.round(width * 100)}%`);
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
      if (moved) {
        // A release can land before the pending frame ran; commit the final pointer position.
        if (e.type === 'pointerup') sizeTo(e.clientX, e.clientY);
        // The preview shift becomes a real anchor move, so the box does not snap back.
        this.cb.onAnchorChange(layer, cfg.anchorX, clamp(startAnchorY + shift / picH, 0, 1));
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

  closePanel(): void {
    this.setPanelOpen(false);
  }

  /** Drawer container for the transcript; created lazily and wired to the dictionary surface once. */
  transcriptRoot(): HTMLDivElement {
    if (this.transcriptEl) return this.transcriptEl;
    this.transcriptEl = el('div', 'transcript');
    this.transcriptEl.hidden = true;
    this.stage.appendChild(this.transcriptEl);
    // Word hover/click inside the transcript opens the same card as the subtitle layers.
    this.transcriptEl.addEventListener('click', (event) => this.onWordClick(event, 'doc'));
    this.transcriptEl.addEventListener('mouseover', (event) => this.onWordOver(event, 'doc'));
    this.transcriptEl.addEventListener('mouseout', this.onWordOut);
    this.transcriptEl.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement | null)?.closest?.('.dict-word')) event.stopPropagation();
    });
    return this.transcriptEl;
  }

  setTranscriptOpen(open: boolean): void {
    this.transcriptBtn.classList.toggle('on', open);
    this.host.classList.toggle('transcript-open', open);
    if (open && !this.panel.hidden) this.setPanelOpen(false);
  }

  /** Records the entries behind a transcript line so `entryFor` can resolve its word spans. */
  registerDictLine(line: HTMLElement, entries: DictEntry[]): void {
    this.lineDict.set(line, entries);
  }

  /** Dictionary card for a word outside the subtitle layers (currently the transcript). */
  showDictCard(entry: DictEntry, anchor: HTMLElement): void {
    this.showCard(entry, anchor, 'doc');
  }

  private togglePanel(): void {
    this.setPanelOpen(this.panel.hidden);
  }

  private setPanelOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.host.classList.toggle('panel-open', open);
    if (open) {
      this.cb.onPanelOpen();
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
    const rows: LibraryRow[] = matches.slice(0, 40).map((i) => {
      const short = i.language ? resolveLanguage(i.language).shortLabel : '';
      return {
        key: `local:${i.id}`,
        title: i.label,
        meta: short ? `${i.packTitle} · ${short}` : i.packTitle,
      };
    });
    let status = '';
    if (query && !matches.length) {
      rows.push({ key: 'online', title: t('overlay.menu.onlineSearch', { query: typed }), meta: 'kitsunekko' });
    } else if (!query && !this.libraryItems.length) {
      status = t('overlay.menu.noPacks');
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
      ? t('overlay.menu.enterToSearch', { query })
      : t('overlay.menu.packHint');
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
    // One record/stop toggle: recording lights it up and swaps the icon to stop; finishing or
    // cancelling clears the pending start and restores the idle look.
    if (this.adRecordBtn) {
      const recording = this.adPendingStart !== null;
      this.adRecordBtn.disabled = !canEdit;
      this.adRecordBtn.classList.toggle('on', recording);
      this.adRecordBtn.title = t(recording ? 'overlay.panel.markEnd' : 'overlay.panel.markStart');
      this.adRecordBtn.replaceChildren(icon(recording ? 'stop' : 'record'));
    }
    if (this.adTitle) {
      this.adTitle.title = seriesLabel
        ? t('overlay.panel.seriesAverage', { series: seriesLabel })
        : t('overlay.panel.average');
    }
    if (this.adSkipBtn) {
      this.adSkipBtn.classList.toggle('on', this.autoSkipAds);
      this.adSkipBtn.title = t(this.autoSkipAds ? 'overlay.panel.autoSkipOn' : 'overlay.panel.autoSkipOff');
    }
    if (this.adHint) {
      this.adHint.textContent = t('overlay.panel.skipHint', { seconds: Math.round(this.adState.duration) });
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
    start.title = t('overlay.panel.slotStartTitle');
    const end = el('input');
    end.type = 'text';
    end.spellcheck = false;
    end.disabled = !editable;
    end.value = fmtClock(slot.at + slot.duration);
    end.title = t('overlay.panel.slotEndTitle');
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
    const del = iconButton('close', t('overlay.panel.deleteSlot'));
    del.hidden = !editable;
    del.addEventListener('click', () => this.adCommit(this.adState.slots.filter((_, i) => i !== index)));
    chip.append(el('span', 'brk', '['), start, el('span', 'sep', '-'), end, el('span', 'brk', ']'), del);
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
    this.fillPresetOptions();
    this.syncLanguageSelects();
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

    const title = el('h4', '', t('overlay.panel.title'));
    panel.appendChild(title);

    // Switching presets is a viewing decision, so it belongs next to the subtitles, not only on
    // the options page. The write goes through storage; the content script repaints on change.
    const presetRow = el('div', 'row');
    presetRow.appendChild(el('label', '', t('overlay.panel.mode')));
    const presetSelect = el('select', 'preset-select');
    this.presetSelect = presetSelect;
    presetSelect.addEventListener('change', () => {
      const language = this.languageOf(this.presetLayer());
      this.subtitleStyle = {
        ...this.subtitleStyle,
        activePresetId: { ...this.subtitleStyle.activePresetId, [language]: presetSelect.value },
      };
      void saveSubtitleStyle(this.subtitleStyle);
    });
    presetRow.appendChild(presetSelect);
    panel.appendChild(presetRow);
    this.fillPresetOptions();

    const packRow = el('div', 'row');
    packRow.appendChild(el('label', '', t('overlay.panel.pack')));
    const pack = el('input', 'lib-search');
    pack.type = 'search';
    pack.placeholder = t('overlay.panel.packPlaceholder');
    pack.title = t('overlay.panel.packTitle');
    this.bindLibrarySearch('pack', pack);
    // The search itself is cross-language; this only decides which online source answers it.
    const packLang = el('select', 'lang-select');
    packLang.title = t('overlay.panel.packLanguage');
    packLang.setAttribute('aria-label', t('overlay.panel.packLanguage'));
    const allSources = el('option', '', t('overlay.panel.packLanguageAuto'));
    allSources.value = 'auto';
    packLang.appendChild(allSources);
    // Kitsunekko covers Japanese; the remaining sources are the languages SubDL serves, plus a
    // code the user typed earlier so a rebuild can still show it as the current selection.
    const sources: string[] = ['ja', ...SUBDL_LANGUAGES];
    const committed = this.getCfg().packLanguage;
    if (committed && !sources.includes(committed)) sources.push(committed);
    for (const id of sources) {
      const option = el('option', '', subtitleLanguageShortLabel(id));
      option.value = id;
      option.title = subtitleLanguageLabel(id);
      packLang.appendChild(option);
    }
    const otherSource = el('option', '', t('overlay.panel.packLanguageOther'));
    otherSource.value = CUSTOM_SOURCE;
    packLang.appendChild(otherSource);
    packLang.value = committed ?? 'auto';
    this.packLangSelect = packLang;

    // SubDL has far more languages than we ship labels for; this accepts a code such as `ko`.
    const customLang = el('input', 'lang-code');
    customLang.type = 'search';
    customLang.placeholder = t('overlay.panel.packLanguagePlaceholder');
    customLang.title = t('overlay.panel.packLanguage');
    customLang.setAttribute('aria-label', t('overlay.panel.packLanguagePlaceholder'));
    customLang.hidden = true;
    const resetSource = () => {
      customLang.hidden = true;
      customLang.value = '';
      packLang.value = this.getCfg().packLanguage ?? 'auto';
    };
    const commitSource = () => {
      const code = customLang.value.trim();
      if (!code) {
        resetSource();
        return;
      }
      // The select must own the value before `syncPanel` writes it back, or it renders blank.
      if (!Array.from(packLang.options).some((option) => option.value === code)) {
        const added = el('option', '', subtitleLanguageShortLabel(code));
        added.value = code;
        added.title = subtitleLanguageLabel(code);
        packLang.insertBefore(added, otherSource);
      }
      packLang.value = code;
      customLang.hidden = true;
      customLang.value = '';
      this.cb.onPackLanguage(code);
    };
    customLang.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') resetSource();
      if (event.key === 'Enter') {
        event.preventDefault();
        commitSource();
      }
    });
    customLang.addEventListener('blur', commitSource);
    packLang.addEventListener('change', () => {
      if (packLang.value === CUSTOM_SOURCE) {
        customLang.hidden = false;
        customLang.focus();
        return;
      }
      customLang.hidden = true;
      this.cb.onPackLanguage(packLang.value === 'auto' ? null : packLang.value);
    });
    packRow.append(pack, packLang, customLang);

    const subRow = (id: LayerId) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', t(id === 'a' ? 'overlay.panel.subA' : 'overlay.panel.subB')));
      // One combobox: idle it shows the loaded subtitle's name, focusing opens the search list.
      const combo = el('input', 'lib-search');
      combo.type = 'search';
      combo.placeholder = t(
        id === 'a' ? 'overlay.panel.searchSourcePlaceholder' : 'overlay.panel.searchTranslationPlaceholder',
      );
      combo.title = t('overlay.panel.searchTitle');
      this.bindLibrarySearch(id, combo);
      // Language belongs to the subtitle content, so it sits on the subtitle row, not the
      // display settings. 'auto' keeps detection running on every load.
      const lang = el('select', 'lang-select');
      lang.title = t('overlay.panel.language');
      lang.setAttribute('aria-label', `${t('overlay.panel.language')} ${this.layerShort(id)}`);
      const auto = el('option', '', t('overlay.panel.languageAuto'));
      auto.value = 'auto';
      lang.appendChild(auto);
      for (const pack of SELECTABLE_LANGUAGES) {
        const option = el('option', '', pack.shortLabel || pack.displayName);
        option.value = pack.id;
        lang.appendChild(option);
      }
      this.langSelects[id] = lang;
      lang.addEventListener('change', () =>
        this.cb.onLayerLanguage(id, lang.value === 'auto' ? null : lang.value),
      );
      const pick = iconButton('file', t('overlay.panel.pickFile'));
      pick.addEventListener('click', () => this.cb.onPickFile(id));
      const clear = iconButton('close', t('overlay.panel.clear'));
      clear.addEventListener('click', () => this.cb.onClearSubtitle(id));
      row.append(combo, lang, pick, clear);
      return row;
    };
    panel.append(subRow('a'), subRow('b'), packRow);
    this.syncLanguageSelects();

    const secOffset = el('div', 'sec');
    const offsetRow = el('div', 'row');
    offsetRow.appendChild(el('label', '', t('overlay.panel.offset')));
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
    offsetVal.title = t('overlay.panel.offsetTitle');
    offsetVal.setAttribute('aria-label', t('overlay.panel.offsetAria'));
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
      row.appendChild(el('label', '', t('overlay.panel.cap', { layer: this.layerShort(id) })));
      const chips = el('div', 'chips');
      const input = el('input', 'cap');
      input.type = 'number';
      input.min = '0';
      input.step = '100';
      input.title = t('overlay.panel.capCustomTitle');
      const presets: [HTMLButtonElement, number][] = [];
      // One toggle button rather than a start/end pair: its caption is the mode it will apply.
      let anchorBtn: HTMLButtonElement;
      // A lit border marks the active choice: exactly one preset, or the custom input.
      const sync = (): void => {
        const lc = this.getCfg().layers[id];
        for (const [button, ms] of presets) button.classList.toggle('on', lc.displayCapMs === ms);
        input.classList.toggle('on', !CAP_PRESETS.some(([, ms]) => ms === lc.displayCapMs));
        anchorBtn.textContent = t(lc.displayCapFromEnd ? 'overlay.panel.capEnd' : 'overlay.panel.capStart');
        anchorBtn.title = t(lc.displayCapFromEnd ? 'overlay.panel.capEndTitle' : 'overlay.panel.capStartTitle');
        // With no cap every cue runs its full duration, so the anchor cannot matter yet.
        anchorBtn.disabled = lc.displayCapMs <= 0;
        if (this.shadow.activeElement !== input) input.value = String(lc.displayCapMs);
      };
      for (const [label, ms] of CAP_PRESETS) {
        const button = el('button', 'chip', label());
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
      anchorBtn = el('button', 'chip');
      anchorBtn.type = 'button';
      anchorBtn.addEventListener('click', () => {
        const layer = this.getCfg().layers[id];
        layer.displayCapFromEnd = !layer.displayCapFromEnd;
        sync();
        this.cb.onCfgChange();
      });
      chips.appendChild(anchorBtn);
      sync();
      row.appendChild(chips);
      if (id === 'a') this.controls.capSyncA = sync;
      else this.controls.capSyncB = sync;
      return row;
    };
    secOffset.append(capRow('a'), capRow('b'));

    const fontRow = (id: LayerId) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', t('overlay.panel.font', { layer: this.layerShort(id) })));
      // The stored value is a fraction of the picture height, so the same setting keeps its
      // proportion when the player is resized. The number beside it is that fraction rendered
      // at the current picture height, which is what a user actually wants to set.
      const range = el('input');
      range.type = 'range';
      range.min = String(MIN_SCALE);
      range.max = String(MAX_SCALE);
      range.step = '0.002';
      range.title = t('overlay.panel.fontRatioTitle');
      const px = el('input', 'offset-num');
      px.type = 'number';
      px.min = '8';
      px.step = '1';
      px.title = t('overlay.panel.fontPxTitle');
      px.setAttribute('aria-label', t('overlay.panel.fontPxAria', { layer: this.layerLabel(id) }));
      const sync = (): void => {
        const value = this.getCfg().layers[id].fontScale;
        if (this.shadow.activeElement !== range) range.value = String(value);
        // Report what is actually painted: a resize drag writes its computed size back here,
        // so the number stays the single source of truth even inside a box.
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
    toggleRow.append(
      lbl(colorize, t('overlay.panel.colorize')),
      lbl(furigana, t('overlay.panel.furigana')),
      lbl(enableB, t('overlay.panel.translationLayer')),
    );
    secOffset.appendChild(toggleRow);
    this.controls.colorize = colorize;
    this.controls.furigana = furigana;
    this.controls.enableB = enableB;

    const manageRow = el('div', 'row');
    const manage = iconButton('list', t('overlay.panel.manage'));
    manage.addEventListener('click', () => this.cb.onOpenLibrary());
    manageRow.append(manage, el('span', 'hint', t('overlay.panel.libraryHint')));
    const secLibrary = el('div', 'sec');
    secLibrary.appendChild(manageRow);

    const secAd = el('div', 'sec');
    const adHead = el('div', 'mark-head');
    this.adTitle = el('span', 'mark-title', t('overlay.panel.adTitle'));
    adHead.appendChild(this.adTitle);
    // The shortcut sits on the section header rather than its own row, so the panel stays short.
    this.adHint = el('span', 'hint mark-hint');
    adHead.appendChild(this.adHint);
    adHead.appendChild(el('span', 'grow'));
    this.adRecordBtn = iconButton('record', t('overlay.panel.markStart'));
    this.adRecordBtn.addEventListener('click', () => {
      if (this.adPendingStart === null) this.onAdMarkStart();
      else this.onAdMarkEnd();
    });
    this.adSkipBtn = iconButton('skip', '');
    this.adSkipBtn.addEventListener('click', () => {
      this.autoSkipAds = !this.autoSkipAds;
      this.renderAds();
      this.cb.onAdAutoSkipChange(this.autoSkipAds);
    });
    adHead.append(this.adRecordBtn, this.adSkipBtn);
    secAd.appendChild(adHead);

    this.adStrip = el('div', 'mark-strip');
    secAd.appendChild(this.adStrip);
    this.renderAds();

    panel.append(secOffset, secAd, secLibrary);
    return panel;
  }
}