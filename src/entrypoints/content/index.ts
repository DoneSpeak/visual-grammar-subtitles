import { TrackAnalysis } from '@/nlp/client';
import { NLP_SETTINGS_KEY } from '@/nlp/settings';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { AdSlot, Cue, LayerCfg, LayerId, PageCfg, Token } from '@/shared/types';
import { buildLabel } from '@/shared/buildInfo';
import type { DictLine } from '@/shared/dictionary';
import { isDictSettingsKey, loadDictSettings, type DictSettings } from '@/shared/dictSettings';
import {
  LANGUAGE_KEY,
  applyLanguage,
  initI18n,
  loadLanguage,
  packTitleForDisplay,
  t,
  type Language,
} from '@/shared/i18n';
import {
  activePreset,
  isSubtitleStyleKey,
  loadSubtitleStyle,
  localOnlyPreset,
  presetUsesRemote,
  type StudyPreset,
  type SubtitleStyle,
} from '@/shared/subtitleStyle';
import { annotateLocal } from '@/features/overlay/tokenize/local';
import { localExclusiveFeatures, localFeatures } from '@/shared/studyFeatures';
import {
  DEFAULT_LANGUAGE,
  SELECTABLE_LANGUAGES,
  featuresFor,
  resolveLanguageHint,
} from '@/languages/registry';
import { UNFILED_TITLE } from '@/shared/persistedText';
import {
  isPlaybackSettingsKey,
  loadPlaybackSettings,
  savePlaybackSettings,
  type PlaybackSettings,
} from '@/shared/playbackSettings';
import type { DictRender } from '@/features/overlay/tokenize/render';
import {
  getLibrarySettings,
  isLibraryKey,
  listLibrary,
  listPacks,
  patchLibrarySettings,
  readLibraryText,
  type LibraryEntry,
} from '@/shared/library';
import { loadAssoc, loadPageCfg, makeSaver, resolvePageKey, resolvePageUrl, setAssoc } from '@/shared/storage';
import { describeSubtitles } from '@/shared/subtitleLabel';
import {
  adEpisodeKey,
  boundPackOf,
  buildAdMap,
  DEFAULT_AD_DURATION,
  isSiteRulesKey,
  loadSiteRules,
  matchPackByTitle,
  pickEpisodeEntry,
  resolveAdSlots,
  resolveSite,
  saveEpisodeAdSlots,
  setSeriesBind,
  type AdMap,
  type ResolvedSite,
  type SiteRules,
} from '@/shared/siteRules';
import { Overlay, type AdState, type LibraryOption, type LibraryRow, type LibraryTarget } from '@/features/overlay/overlay';
import { TranscriptPanel, type TranscriptLayout } from '@/features/overlay/transcript';
import { canSplit, clampSplitSize, defaultSplitSize, type SplitMode } from '@/features/overlay/split';
import { Theater, installFrameTheater } from '@/features/overlay/theater';
import type { SeriesDir, SubFile } from '@/features/scraper/kitsunekko';
import {
  providerFor,
  SUBDL_LANGUAGES,
  type EpisodeFile,
  type SeriesHit,
} from '@/features/scraper/providers';
import { PROVIDER_KEYS_KEY, sanitizeProviderKeys } from '@/shared/providerSettings';
import { parseSubtitles } from '@/features/overlay/subtitles/parse';
import { Timeline } from '@/features/overlay/timeline';
import { TokenizerClient } from '@/features/overlay/tokenize/client';
import { pictureRect, watchVideos, type PictureRect } from '@/features/overlay/video';

const log = (...args: unknown[]) => console.info('[jp-sub]', ...args);

/** Subtitle languages an online provider serves; kitsunekko covers Japanese separately. */
const PROVIDER_LANGUAGES = SUBDL_LANGUAGES;

/** Same label the options page shows for a file, derived per pack. */
const displayLabel = (entry: LibraryEntry, all: LibraryEntry[]): string => {
  const names = all.filter((e) => e.packId === entry.packId).map((e) => e.name);
  return describeSubtitles(names).get(entry.name)?.label || entry.name;
};

const fmtSize = (bytes: number): string =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const pickFile = (): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.vtt,.ass,.ssa,.txt';
    input.style.display = 'none';
    document.documentElement.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });

/** Shape both import paths return: a pack plus the entries it stored. */
type ImportResult = { packTitle: string; entries: { id: string; name: string }[]; errors: number };

/** An online search result the panel can descend into; kitsunekko and providers share the list. */
type OnlineTarget =
  | { kind: 'kitsuDir'; dir: SeriesDir }
  | { kind: 'kitsuFile'; dir: SeriesDir; file: SubFile }
  | { kind: 'providerSeries'; language: string; hit: SeriesHit }
  | { kind: 'providerFile'; language: string; hit: SeriesHit; file: EpisodeFile };

/** One cue resolved into rows for either the subtitle layer or the transcript drawer. */
type CueRender = {
  lines: string[];
  rows: (DictLine | null)[];
  preset: StudyPreset;
  /** Tokens came from the remote analysis, so only dictionary entries can still be missing. */
  remote: boolean;
  tokensReady: boolean;
  dictReady: boolean;
};

class Session {
  private analysis: Record<LayerId, TrackAnalysis> = { a: new TrackAnalysis(), b: new TrackAnalysis() };
  private overlay: Overlay;
  private theater: Theater;
  private timelines: Record<LayerId, Timeline> = { a: new Timeline(), b: new Timeline() };
  private transcript: TranscriptPanel;
  /** The transcript entered theater itself, so closing it must hand the page back. */
  private splitOwnsTheater = false;
  /** Enriched rows for cues rendered from the remote analysis; the dictionary lookup lands here. */
  private cueDict = new WeakMap<Cue, DictLine[]>();
  private shownCue: Record<LayerId, Cue | null> = { a: null, b: null };
  /** Video time at which the current cue started being displayed; displayCapMs counts from here
   *  in start-anchored mode. End-anchored mode counts back from the cue's end instead. */
  private shownAt: Record<LayerId, number> = { a: 0, b: 0 };
  private peekUntil = 0;
  /** Player time seen on the previous frame; a discontinuity means a seek. */
  private lastPlayerTime = Number.NaN;
  private raf = 0;
  private lastFrame = 0;
  private lastRect: PictureRect = { left: -1, top: -1, width: 0, height: 0 };
  /** Last menu rendered per surface, plus the stack the "返回" row unwinds. */
  private onlineRows: Record<LibraryTarget, LibraryRow[]> = { a: [], b: [], pack: [] };
  private onlineStatus: Record<LibraryTarget, string> = { a: '', b: '', pack: '' };
  private onlineBack: Record<LibraryTarget, { rows: LibraryRow[]; status: string }[]> = { a: [], b: [], pack: [] };
  /** Content time where the ad being marked starts; subtitles hold there until the mark ends. */
  private pendingAdAt: number | null = null;
  private autoSkipAds = true;
  /** Throttles auto-skip so a seek back into the same ad cannot trap the playhead. */
  private lastAdSkipAt = 0;
  private onlineTargets = new Map<string, OnlineTarget>();
  /** Drops results from a search the user has already superseded. */
  private searchSeq = 0;

  constructor(
    private video: HTMLVideoElement,
    private cfg: PageCfg,
    private save: () => void,
    private tokenizer: TokenizerClient,
    private dict: DictSettings,
    private subtitleStyle: SubtitleStyle,
    private adMap: AdMap,
    private onSubtitlePicked: (
      layer: LayerId,
      source: { id: string; name: string; packId?: string } | null,
    ) => void,
    private refreshLibrary: () => Promise<void>,
    private adHooks: {
      state: () => AdState;
      onChange: (slots: AdSlot[]) => void;
      onAutoSkip: (enabled: boolean) => void;
    },
  ) {
    this.theater = new Theater(this.video);
    this.overlay = new Overlay(
      () => this.cfg,
      {
        onAnchorChange: (layer, x, y) => {
          this.cfg.layers[layer].anchorX = x;
          this.cfg.layers[layer].anchorY = y;
          this.save();
        },
        onFontScaleChange: (layer, scale) => {
          this.cfg.layers[layer].fontScale = scale;
          this.save();
        },
        onMaxWidthChange: (layer, width) => {
          this.cfg.layers[layer].maxWidth = width;
          this.save();
        },
        onPickFile: (target) => void this.loadFile(target),
        onLibraryPick: (target, key) => void this.pickLibraryRow(target, key),
        onOnlineSearch: (query) => void this.searchOnline('pack', query),
        onOpenLibrary: () => {
          void chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => undefined);
        },
        onClearSubtitle: (target) => {
          this.cfg.subs[target] = { name: '', text: '' };
          this.timelines[target].setCues([]);
          if (target === 'a') this.transcript.setCues([]);
          this.analysis[target].stop();
          this.shownCue[target] = null;
          this.overlay.clear(target);
          this.overlay.syncPanel();
          this.onSubtitlePicked(target, null);
          this.save();
        },
        onLayerLanguage: (target, language) => {
          const sub = this.cfg.subs[target];
          this.cfg.subs[target] = {
            ...sub,
            language: language ?? resolveLanguageHint(sub.text.slice(0, 4000)),
            languageAuto: language === null,
          };
          this.applySubtitle(target, sub.name, sub.text);
          this.overlay.syncPanel();
          this.save();
        },
        onPackLanguage: (language) => {
          this.cfg.packLanguage = language ?? undefined;
          this.overlay.syncPanel();
          this.save();
        },
        onCfgChange: () => {
          this.overlay.updateRect(pictureRect(this.video));
          this.save();
        },
        onAdCurrentTime: () => this.adMap.toContent(this.video.currentTime),
        onAdSlotsChange: (slots) => this.adHooks.onChange(slots),
        onAdAutoSkipChange: (enabled) => this.adHooks.onAutoSkip(enabled),
        onAdPending: (at) => {
          this.pendingAdAt = at;
          this.shownCue.a = null;
          this.shownCue.b = null;
        },
        onWordLookup: () => {
          if (!this.video.paused) this.video.pause();
        },
        onTheaterToggle: () => this.toggleTheater(),
        onTranscriptToggle: () => this.toggleTranscript(),
        onPanelOpen: () => this.closeTranscript(),
      },
    );
    this.transcript = new TranscriptPanel(
      this.overlay.transcriptRoot(),
      {
        // The transcript mirrors layer A: same preset, same annotator, same dictionary state.
        render: (cue) => this.cueRender('a', cue),
        prime: (cue, done) => this.primeCue('a', cue, done),
        options: () => ({
          colorize: this.cfg.layers.a.colorize,
          furigana: this.cfg.layers.a.furigana,
          dict: this.dictRender(),
          language: this.languageOf('a'),
        }),
      },
      {
        onSeek: (cue) => this.seekToCue(cue),
        onLine: (line, entries) => this.overlay.registerDictLine(line, entries),
        onClose: () => this.closeTranscript(),
        onLayout: (layout) => this.setTranscriptLayout(layout),
        onResize: (size) => this.theater.setSplitSize(size),
        onResizeEnd: (size) => this.saveTranscriptSize(size),
      },
    );
    this.overlay.mount();
    this.overlay.setDictSettings(this.dict);
    this.overlay.setSubtitleStyle(this.subtitleStyle);
    this.overlay.setAdState(this.adHooks.state());
    this.overlay.setAutoSkip(this.autoSkipAds);
    this.overlay.updateRect(pictureRect(this.video));
    window.setTimeout(() => log(`diag ${JSON.stringify(this.diag())}`), 3000);

    if (this.cfg.subs.a.text) this.applySubtitle('a', this.cfg.subs.a.name, this.cfg.subs.a.text);
    if (this.cfg.subs.b.text) this.applySubtitle('b', this.cfg.subs.b.name, this.cfg.subs.b.text);
    // `applySubtitle` may have auto-detected a language, so start the tokenizer afterwards.
    void this.tokenizer.start(this.languageOf('a'));
    this.overlay.syncPanel();
    window.addEventListener('resize', this.onViewportResize);

    document.addEventListener('mousemove', this.onMouseMove, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('dragover', this.onDragOver, true);
    document.addEventListener('drop', this.onDrop, true);
    this.video.addEventListener('seeking', this.onSeeking);
    this.loop();
  }

  async refreshNlpSettings(): Promise<void> {
    await Promise.all([this.analysis.a.refreshSettings(), this.analysis.b.refreshSettings()]);
    this.shownCue.a = null; this.shownCue.b = null;
    this.transcript.refresh();
  }

  destroy(): void {
    this.analysis.a.stop(); this.analysis.b.stop();
    cancelAnimationFrame(this.raf);
    document.removeEventListener('mousemove', this.onMouseMove, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('dragover', this.onDragOver, true);
    document.removeEventListener('drop', this.onDrop, true);
    window.removeEventListener('resize', this.onViewportResize);
    this.video.removeEventListener('seeking', this.onSeeking);
    this.transcript.destroy();
    this.theater.destroy();
    this.overlay.destroy();
  }

  theaterActive(): boolean {
    return this.theater.active();
  }

  /** Player pinned to the viewport instead of the page's layout box. */
  toggleTheater(): boolean {
    // The split layout rides on the pinning, so closing the transcript first must not be undone
    // by a toggle that re-reads the now-inactive state and enters theater again.
    const wasActive = this.theater.active();
    if (this.transcript.isOpen()) this.closeTranscript();
    if (wasActive) {
      if (this.theater.active()) this.theater.exit();
    } else {
      this.theater.enter();
    }
    this.overlay.setTheater(this.theater.active());
    return this.theater.active();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastFrame < 32) return;
    this.lastFrame = now;

    // Fullscreen containers are rebuilt by players without a fullscreenchange; recover before
    // measuring the picture so a stranded host does not stay invisible.
    this.overlay.ensureMounted();
    this.theater.sync();
    const rect = pictureRect(this.video);
    if (rect.width < 1) return;
    // Repainting an unchanged rect would rewrite the layer styles every 32 ms and fight the
    // drag/resize gesture writes, so only push layout when the picture actually moved.
    const last = this.lastRect;
    if (
      Math.abs(rect.left - last.left) > 0.5 ||
      Math.abs(rect.top - last.top) > 0.5 ||
      Math.abs(rect.width - last.width) > 0.5 ||
      Math.abs(rect.height - last.height) > 0.5
    ) {
      this.lastRect = rect;
      this.overlay.updateRect(rect);
    }

    // Arrow-key and chapter seeks move `currentTime` between frames; some players do it without
    // `seeking`, so a discontinuity larger than playback can produce also restarts the display
    // window. The ad map runs after the reset, so a seek across a marked ad still lands correctly.
    let playerTime = this.video.currentTime;
    // Skipping lands on the slot's insertion point, so the subtitle clock keeps running from the
    // same content time it held during the ad. A mark in progress must not be skipped over.
    const ad = this.autoSkipAds && this.pendingAdAt === null ? this.adMap.adAt(playerTime) : null;
    if (ad && ad.end - playerTime > 0.3 && now - this.lastAdSkipAt > 1500) {
      this.lastAdSkipAt = now;
      const end = this.video.duration > 0 ? Math.min(ad.end + 0.05, this.video.duration) : ad.end + 0.05;
      playerTime = end;
      this.video.currentTime = end;
    }
    if (Math.abs(playerTime - this.lastPlayerTime) > 0.5) this.resetShown();
    this.lastPlayerTime = playerTime;

    // During an open ad mark the content clock would keep running; pin it to the mark so the
    // subtitles stop at the insertion point instead of drifting through the ad.
    const content = this.adMap.toContent(playerTime);
    const t =
      (this.pendingAdAt === null ? content : Math.min(content, this.pendingAdAt)) - this.cfg.offset;
    const force = this.video.paused || now < this.peekUntil;
    this.updateLayer('a', t, force);
    this.updateLayer('b', t, force);
  };

  private updateLayer(id: LayerId, t: number, force: boolean): void {
    const lc = this.cfg.layers[id];
    const timeline = this.timelines[id];
    if (!lc.enabled || timeline.cues.length === 0) {
      this.overlay.setOpacity(id, false);
      return;
    }
    const cue = timeline.cueAt(t);
    if (!cue) {
      this.overlay.setOpacity(id, false);
      this.shownCue[id] = null;
      if (id === 'a') this.transcript.setActive(null);
      return;
    }
    if (this.shownCue[id] !== cue) {
      this.shownCue[id] = cue;
      this.shownAt[id] = t;
      this.renderCue(id, cue, lc);
      if (id === 'a') this.transcript.setActive(cue);
    }
    const cap = lc.displayCapMs;
    const visible =
      force ||
      cap <= 0 ||
      (lc.displayCapFromEnd
        ? (cue.end - t) * 1000 <= cap
        : (t - this.shownAt[id]) * 1000 <= cap);
    this.overlay.setOpacity(id, visible);
  }

  /** Dragging the progress bar or stepping with the arrow keys jumps between cues; drop the stale
   *  text and restart the display window so a seek into the middle of a cue still shows it. */
  private onSeeking = (): void => this.resetShown();

  private resetShown(): void {
    for (const id of ['a', 'b'] as LayerId[]) {
      this.shownCue[id] = null;
      this.overlay.setOpacity(id, false);
    }
  }

  /**
   * Remote features only exist after syntax analysis; until then the same preset renders with its
   * local features, so the rest of the user's configuration stays on screen.
   */
  /** The layer's content language; the two layers may show different languages at once. */
  private languageOf(id: LayerId): string {
    return this.cfg.subs[id].language ?? DEFAULT_LANGUAGE;
  }

  private effectivePreset(id: LayerId): StudyPreset {
    const language = this.languageOf(id);
    const registry = featuresFor(language);
    const preset = activePreset(this.subtitleStyle, language);
    return presetUsesRemote(registry, preset) && !this.analysis[id].ready()
      ? localOnlyPreset(registry, preset)
      : preset;
  }

  /**
   * Local annotations for the preset's features. On the remote path only locally exclusive
   * features run, so client rules never compete with the service's labels; hybrid features keep
   * working when the service is unavailable because the caller has already fallen back.
   */
  private annotate(
    lines: DictLine[],
    preset: StudyPreset,
    language: string,
    remote: boolean,
  ): DictLine[] {
    const registry = featuresFor(language);
    const features = remote
      ? localExclusiveFeatures(registry, preset.features)
      : localFeatures(registry, preset.features);
    if (!features.length) return lines;
    return lines.map((line) => ({
      ...line,
      tokens: annotateLocal(line.tokens, line.entries ?? [], this.dict.bands[language] ?? {}, features, language),
    }));
  }

  /** Splits the remote analysis' flat token stream back into per-line rows. */
  private splitRemote(lines: string[], remote: Token[]): DictLine[] {
    let offset = 0;
    return lines.map((line) => {
      const start = offset;
      offset += line.length + 1;
      let at = 0;
      const tokens = remote.flatMap((token) => {
        const a = at;
        at += token.surface.length;
        const left = Math.max(start, a);
        const right = Math.min(start + line.length, at);
        return left < right
          ? [{
              ...token,
              surface: token.surface.slice(left - a, right - a),
              reading: left === a && right === at ? token.reading : '',
            }]
          : [];
      });
      return { tokens, entries: [] };
    });
  }

  /** One cue painted exactly like the on-video subtitle: same preset, annotations and dictionary. */
  private cueRender(id: LayerId, cue: Cue): CueRender {
    const language = this.languageOf(id);
    const preset = this.effectivePreset(id);
    const remote = preset.features.length === 0 ? null : this.analysis[id].tokens(cue);
    if (remote) {
      const lines = cue.text.split('\n');
      const cached = this.cueDict.get(cue);
      return {
        lines,
        rows: this.annotate(cached ?? this.splitRemote(lines, remote), preset, language, true),
        preset,
        remote: true,
        tokensReady: true,
        dictReady: !this.dict.enabled || cached !== undefined,
      };
    }
    const lines = cue.text.split('\n').filter((line) => line.trim() !== '');
    const cached = lines.map((line) => this.tokenizer.peek(language, line));
    const ready = cached.every((line): line is DictLine => line !== undefined);
    return {
      lines,
      rows: ready ? this.annotate(cached, preset, language, false) : lines.map(() => null),
      preset,
      remote: false,
      tokensReady: ready,
      dictReady: ready,
    };
  }

  /**
   * Resolves the parts `cueRender` is still missing. `done` fires only when a repeat call would
   * return a complete row, so callers can re-render without deciding which path was taken.
   */
  private primeCue(id: LayerId, cue: Cue, done: () => void): void {
    const language = this.languageOf(id);
    const preset = this.effectivePreset(id);
    const remote = preset.features.length === 0 ? null : this.analysis[id].tokens(cue);
    if (remote) {
      if (!this.dict.enabled || this.cueDict.has(cue)) {
        done();
        return;
      }
      const parsed = this.splitRemote(cue.text.split('\n'), remote);
      void chrome.runtime.sendMessage({
        type: 'lookupTokens',
        language,
        tokens: parsed.flatMap((line) => line.tokens),
      })
        .then((result: DictLine) => {
          if (!result?.tokens) return;
          let offset = 0;
          const enriched = parsed.map((line) => {
            const tokens = result.tokens.slice(offset, offset + line.tokens.length);
            offset += line.tokens.length;
            return { tokens, entries: result.entries };
          });
          this.cueDict.set(cue, enriched);
          done();
        })
        .catch((error) => log('dictionary lookup failed', error));
      return;
    }
    const lines = cue.text.split('\n').filter((line) => line.trim() !== '');
    const missing = [...new Set(lines)].filter((line) => !this.tokenizer.peek(language, line));
    if (!missing.length) {
      done();
      return;
    }
    void Promise.all(missing.map((line) => this.tokenizer.tokenizeLine(language, line)))
      .then(() => done())
      .catch((error) => log('tokenize failed', error));
  }

  private renderCue(id: LayerId, cue: Cue, lc: LayerCfg): void {
    const first = this.cueRender(id, cue);
    this.overlay.render(id, first.lines, first.rows, lc, this.dictRender(), first.preset);
    const needsTokens = !first.tokensReady && id === 'a' &&
      (lc.colorize || first.preset.features.length > 0 || this.dict.enabled);
    const needsDict = first.remote && !first.dictReady && this.dict.enabled;
    if (!needsTokens && !needsDict) return;
    this.primeCue(id, cue, () => {
      if (this.shownCue[id] !== cue) return;
      const next = this.cueRender(id, cue);
      this.overlay.render(id, next.lines, next.rows, lc, this.dictRender(), next.preset);
    });
  }

  private seekToCue(cue: Cue): void {
    // Cue times live on the subtitle timeline; the ad map restores the player's own clock.
    const playerTime = Math.max(0, this.adMap.toPlayer(cue.start + this.cfg.offset));
    this.video.currentTime = this.video.duration > 0 ? Math.min(playerTime, this.video.duration) : playerTime;
    this.resetShown();
  }

  private toggleTranscript(): void {
    if (this.transcript.isOpen()) this.closeTranscript();
    else this.openTranscript();
  }

  /** Layout remembered for this page; the split modes also shrink the player to make room. */
  private transcriptLayout(): TranscriptLayout {
    const mode = this.cfg.transcriptSplit;
    return mode === 'overlay' || mode === 'bottom' ? mode : 'side';
  }

  private transcriptSize(mode: SplitMode): number {
    const saved = mode === 'side' ? this.cfg.transcriptSide : this.cfg.transcriptBottom;
    const size = saved ?? defaultSplitSize(mode, window.innerWidth, window.innerHeight);
    return clampSplitSize(mode, size, window.innerWidth, window.innerHeight);
  }

  /**
   * Split needs a player we can pin and room for both panes. A framed player is lifted to the top
   * window's viewport by `installFrameTheater`, so its own (pre-lift) size must not veto the split:
   * the resize fired by the lift re-clamps it. A fullscreen `<video>` paints above the overlay and
   * keeps the on-picture drawer.
   */
  private canSplitTranscript(mode: SplitMode): boolean {
    if (document.fullscreenElement?.tagName === 'VIDEO') return false;
    if (this.theater.framed()) return true;
    return canSplit(mode, window.innerWidth, window.innerHeight);
  }

  /**
   * Pins the player and reserves a strip for the transcript. False means the player cannot be
   * split right now; the caller falls back to the on-picture drawer.
   */
  private ensureSplit(mode: SplitMode): boolean {
    if (!this.canSplitTranscript(mode)) return false;
    if (!this.theater.active()) {
      this.theater.enter();
      // `enter()` declines when the video is already gone.
      if (!this.theater.active()) return false;
      this.splitOwnsTheater = true;
    }
    const size = this.transcriptSize(mode);
    this.theater.setSplit(mode, size);
    this.transcript.setLayout(mode, size);
    this.overlay.setTheater(this.theater.active());
    return true;
  }

  /**
   * Removes the strip and floats the drawer over the picture. A pin the split entered stays: the
   * user asked for the floating layout, not for the page to come back, so 悬浮 keeps covering the
   * lifted player. `dropSplit` releases it on close.
   */
  private clearSplit(): void {
    this.theater.setSplit(null);
    this.transcript.setLayout('overlay');
    this.overlay.setTheater(this.theater.active());
  }

  /** Undoes the split and any pin the transcript owns; closing it must hand the page back. */
  private dropSplit(): void {
    this.theater.setSplit(null);
    if (this.splitOwnsTheater && this.theater.active()) this.theater.exit();
    this.splitOwnsTheater = false;
    this.transcript.setLayout('overlay');
    this.overlay.setTheater(this.theater.active());
  }

  private openTranscript(): void {
    this.transcript.setCues(this.timelines.a.cues);
    const layout = this.transcriptLayout();
    if (layout === 'overlay' || !this.ensureSplit(layout)) this.clearSplit();
    this.transcript.setOpen(true);
    this.overlay.setTranscriptOpen(true);
    this.overlay.setTheater(this.theater.active());
  }

  private closeTranscript(): void {
    if (!this.transcript.isOpen()) return;
    this.dropSplit();
    this.transcript.setOpen(false);
    this.overlay.setTranscriptOpen(false);
  }

  /**
   * Applies a layout picked in the transcript header: floating drawer, right strip or bottom strip.
   * Pressing the current layout after the drawer fell back (small viewport, lift not applied) must
   * retry the split, so this compares against the applied layout, not the remembered one.
   */
  private setTranscriptLayout(layout: TranscriptLayout): void {
    if (this.transcript.isOpen() && this.transcript.getLayout() === layout) return;
    this.cfg.transcriptSplit = layout;
    this.save();
    if (!this.transcript.isOpen()) return;
    // Sizes are direction-specific, so a new orientation starts from its own saved default.
    if (layout === 'overlay' || !this.ensureSplit(layout)) this.clearSplit();
  }

  private saveTranscriptSize(size: number): void {
    const layout = this.transcript.getLayout();
    if (layout === 'side') this.cfg.transcriptSide = size;
    else if (layout === 'bottom') this.cfg.transcriptBottom = size;
    else return;
    this.save();
  }

  /** Re-clamp the strip after a window resize; the video must stay above the candidate floor. */
  private onViewportResize = (): void => {
    const mode = this.transcript.getLayout();
    if (mode === 'overlay') return;
    if (!canSplit(mode, window.innerWidth, window.innerHeight)) {
      this.dropSplit();
      return;
    }
    const size = this.transcriptSize(mode);
    this.theater.setSplitSize(size);
    this.transcript.setSize(size);
  };

  private dictRender(): DictRender {
    return { entries: [], enabled: this.dict.enabled, bands: this.dict.bands };
  }

  setDictSettings(settings: DictSettings): void {
    this.dict = settings;
    this.overlay.setDictSettings(settings);
    this.shownCue.a = null;
    this.shownCue.b = null;
    this.transcript.refresh();
  }

  setSubtitleStyle(style: SubtitleStyle): void {
    this.subtitleStyle = style;
    this.overlay.setSubtitleStyle(style);
    this.shownCue.a = null;
    this.shownCue.b = null;
    this.transcript.refresh();
  }

  setAdMap(adMap: AdMap): void {
    this.adMap = adMap;
    this.shownCue.a = null;
    this.shownCue.b = null;
  }

  setAutoSkip(enabled: boolean): void {
    this.autoSkipAds = enabled;
    this.overlay.setAutoSkip(enabled);
  }

  setAdState(): void {
    this.overlay.setAdState(this.adHooks.state());
  }

  /** Relabels the live overlay and drops the async strings, which were rendered in the old language. */
  setLanguage(language: Language): void {
    this.overlay.setLanguage(language);
    this.onlineRows = { a: [], b: [], pack: [] };
    this.onlineStatus = { a: '', b: '', pack: '' };
    this.onlineBack = { a: [], b: [], pack: [] };
    this.overlay.setAdState(this.adHooks.state());
    this.transcript.refresh();
    void this.refreshLibrary();
  }

  diag(): Record<string, unknown> {
    return {
      overlay: this.overlay.diag(),
      theater: this.theater.diagnose(),
      transcript: {
        open: this.transcript.isOpen(),
        layout: this.transcript.getLayout(),
        ownsTheater: this.splitOwnsTheater,
      },
      cuesA: this.timelines.a.cues.length,
      cuesB: this.timelines.b.cues.length,
      offset: this.cfg.offset,
      currentTime: this.video.currentTime,
    };
  }

  openPanel(): void {
    this.overlay.openPanel();
  }

  loadSubtitle(target: LayerId, name: string, text: string): void {
    this.applySubtitle(target, name, text);
    this.overlay.syncPanel();
    this.save();
  }

  setLibrary(items: LibraryOption[]): void {
    this.overlay.setLibrary(items);
  }

  applyLibraryItemFromPopup(id: string): Promise<void> {
    return this.applyLibraryItem('a', id);
  }

  private remote<T>(msg: Record<string, unknown>): Promise<T> {
    return chrome.runtime.sendMessage(msg).then((res: unknown) => {
      const err = (res as { error?: string } | undefined)?.error;
      if (err) throw new Error(err);
      return res as T;
    });
  }

  private renderOnline(target: LibraryTarget): void {
    const rows = this.onlineRows[target];
    const list: LibraryRow[] =
      this.onlineBack[target].length ? [{ key: 'back', title: t('content.back') }, ...rows] : rows;
    this.overlay.showLibraryMenu(target, list, this.onlineStatus[target]);
  }

  private beginOnline(target: LibraryTarget, status: string): void {
    this.onlineBack[target].push({ rows: this.onlineRows[target], status: this.onlineStatus[target] });
    this.onlineRows[target] = [];
    this.onlineStatus[target] = status;
    this.renderOnline(target);
  }

  /** Keys are read here so the panel can skip sources it could never query. */
  private async providerKeys(): Promise<Record<string, string | undefined>> {
    const raw = await chrome.storage.local.get(PROVIDER_KEYS_KEY);
    return sanitizeProviderKeys(raw[PROVIDER_KEYS_KEY]);
  }

  private hasProviderKey(language: string, keys: Record<string, string | undefined>): boolean {
    const provider = providerFor(language);
    return !!provider && !!keys[provider.id];
  }

  /**
   * Online search is scoped by `cfg.packLanguage`: `ja` → kitsunekko, other subtitle languages →
   * that provider, absent → every source the user has a key for, plus kitsunekko. The local
   * library stays cross-language; only the remote sources are constrained.
   */
  private async searchOnline(target: LibraryTarget, query: string): Promise<void> {
    this.onlineTargets.clear();
    this.onlineBack[target] = [];
    this.onlineRows[target] = [];
    const source = this.cfg.packLanguage;
    const providerOnly = !!source && source !== 'ja';
    // An explicit Japanese source means kitsunekko only — never mix in SubDL languages.
    const kitsuOnly = source === 'ja';
    const providerLabel = providerOnly ? (providerFor(source as string)?.id ?? source) : '';
    this.onlineStatus[target] = providerOnly
      ? t('content.searchingProvider', { provider: providerLabel })
      : source
        ? t('content.searching')
        : t('content.searchingAll');
    this.renderOnline(target);
    const seq = ++this.searchSeq;

    try {
      const keys = await this.providerKeys();
      if (seq !== this.searchSeq) return;
      if (providerOnly && !this.hasProviderKey(source as string, keys)) {
        this.onlineStatus[target] = t('content.providerKeyMissing', {
          provider: providerFor(source as string)?.id ?? source,
        });
        this.renderOnline(target);
        return;
      }
      const languages = providerOnly
        ? [source as string]
        : kitsuOnly
          ? []
          : PROVIDER_LANGUAGES.filter((language) => this.hasProviderKey(language, keys));
      const rows: LibraryRow[] = [];
      let translated = '';
      const jobs: Promise<void>[] = [];

      if (!providerOnly) {
        jobs.push(
          this.searchKitsu(query).then((found) => {
            rows.push(...found.rows);
            translated = found.translated;
          }),
        );
      }
      for (const language of languages) {
        jobs.push(
          this.searchProvider(language, query).then((found) => {
            rows.push(...found);
          }),
        );
      }

      const results = await Promise.allSettled(jobs);
      if (seq !== this.searchSeq) return;
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      this.onlineRows[target] = rows;

      if (rows.length) {
        this.onlineStatus[target] = translated ? t('content.translated', { title: translated }) : '';
      } else if (failure) {
        this.onlineStatus[target] = t('errors.onlineSearchFailed', { error: errText(failure.reason) });
      } else if (providerOnly) {
        this.onlineStatus[target] = t('content.noMatchProvider', { provider: providerLabel });
      } else if (translated) {
        this.onlineStatus[target] = t('content.translatedNoPack', { title: translated });
      } else {
        this.onlineStatus[target] = t('content.noMatch');
      }
      this.renderOnline(target);
    } catch (err) {
      this.onlineStatus[target] = t('errors.onlineSearchFailed', { error: errText(err) });
      this.renderOnline(target);
    }
  }

  private async searchKitsu(query: string): Promise<{ rows: LibraryRow[]; translated: string }> {
    const { hits, translated } = await this.remote<{ hits: SeriesDir[]; translated?: string }>({
      type: 'kitsuSearch',
      query,
    });
    const rows = hits.map((dir): LibraryRow => {
      const key = `series:${dir.path}`;
      this.onlineTargets.set(key, { kind: 'kitsuDir', dir });
      return { key, title: dir.name, meta: 'kitsunekko' };
    });
    return { rows, translated: translated ?? '' };
  }

  private async searchProvider(language: string, query: string): Promise<LibraryRow[]> {
    const provider = providerFor(language);
    if (!provider) return [];
    const { hits } = await this.remote<{ hits: SeriesHit[] }>({
      type: 'providerSearch',
      provider: provider.id,
      language,
      query,
    });
    return hits.map((hit): LibraryRow => {
      const key = `pseries:${language}:${hit.id}`;
      this.onlineTargets.set(key, { kind: 'providerSeries', language, hit });
      return {
        key,
        title: hit.title,
        meta: hit.year ? `${provider.id} · ${hit.year}` : provider.id,
      };
    });
  }

  private async openRemoteDir(target: LibraryTarget, dir: SeriesDir): Promise<void> {
    this.beginOnline(target, t('content.readingDir', { name: dir.name }));
    try {
      const { dirs, files } = await this.remote<{ dirs: SeriesDir[]; files: SubFile[] }>({
        type: 'kitsuList',
        path: dir.path,
      });
      const rows: LibraryRow[] = [];
      for (const sub of dirs) {
        const key = `dir:${sub.path}`;
        this.onlineTargets.set(key, { kind: 'kitsuDir', dir: sub });
        rows.push({ key, title: sub.name, meta: t('content.subdir') });
      }
      for (const file of files) {
        const key = `file:${file.url}`;
        this.onlineTargets.set(key, { kind: 'kitsuFile', dir, file });
        rows.push({ key, title: file.name, meta: `${fmtSize(file.size)} · ${file.modified}` });
      }
      this.onlineRows[target] = rows;
      this.onlineStatus[target] = rows.length ? '' : t('content.emptyDir');
      this.renderOnline(target);
    } catch (err) {
      this.onlineStatus[target] = t('errors.readDirFailed', { error: errText(err) });
      this.renderOnline(target);
    }
  }

  private async importRemote(target: LibraryTarget, dir: SeriesDir, file: SubFile): Promise<void> {
    this.beginOnline(target, t('content.downloading', { name: file.name }));
    try {
      const res = await this.remote<ImportResult>({ type: 'kitsuImport', dir, file });
      await this.showImported(target, res);
    } catch (err) {
      this.onlineStatus[target] = t('errors.importFailed', { error: errText(err) });
      this.renderOnline(target);
    }
  }

  private async openProviderSeries(
    target: LibraryTarget,
    language: string,
    hit: SeriesHit,
  ): Promise<void> {
    this.beginOnline(target, t('content.readingDir', { name: hit.title }));
    try {
      const provider = providerFor(language);
      const { files } = await this.remote<{ files: EpisodeFile[] }>({
        type: 'providerList',
        provider: provider?.id,
        language,
        hit,
      });
      const rows: LibraryRow[] = files.map((file) => {
        const key = `pfile:${language}:${file.id}`;
        this.onlineTargets.set(key, { kind: 'providerFile', language, hit, file });
        const meta = [provider?.id, file.size ? fmtSize(file.size) : '', file.release ?? '']
          .filter(Boolean)
          .join(' · ');
        return { key, title: file.name, meta };
      });
      this.onlineRows[target] = rows;
      this.onlineStatus[target] = rows.length ? '' : t('content.emptyDir');
      this.renderOnline(target);
    } catch (err) {
      this.onlineStatus[target] = t('errors.readDirFailed', { error: errText(err) });
      this.renderOnline(target);
    }
  }

  private async importProviderFile(
    target: LibraryTarget,
    language: string,
    hit: SeriesHit,
    file: EpisodeFile,
  ): Promise<void> {
    this.beginOnline(target, t('content.downloading', { name: file.name }));
    try {
      const res = await this.remote<ImportResult>({
        type: 'providerImport',
        provider: providerFor(language)?.id,
        language,
        hit,
        file,
      });
      await this.showImported(target, res);
    } catch (err) {
      this.onlineStatus[target] = t('errors.importFailed', { error: errText(err) });
      this.renderOnline(target);
    }
  }

  /** Shared tail for kitsunekko and provider imports: fill the library, then offer the files. */
  private async showImported(target: LibraryTarget, res: ImportResult): Promise<void> {
    const failed = res.errors ? t('popup.toast.parseFailed', { count: res.errors }) : '';
    if (target === 'pack') {
      // The pack box only fills the library; selection happens in the two layer boxes.
      await this.refreshLibrary();
      this.onlineRows.pack = [];
      this.onlineStatus.pack =
        t('content.importedCount', { count: res.entries.length }) + failed + t('content.chooseAbove');
      this.renderOnline('pack');
      return;
    }
    const labels = describeSubtitles(res.entries.map((e) => e.name));
    this.onlineRows[target] = res.entries.map((e) => ({
      key: `entry:${e.id}`,
      title: labels.get(e.name)?.label ?? e.name,
      meta: res.packTitle,
    }));
    this.onlineStatus[target] = res.errors
      ? t('content.importedCount', { count: res.entries.length }) + failed
      : '';
    this.renderOnline(target);
  }

  private async pickLibraryRow(target: LibraryTarget, key: string): Promise<void> {
    if (key.startsWith('local:') || key.startsWith('entry:')) {
      const layer: LayerId = target === 'b' ? 'b' : 'a';
      await this.applyLibraryItem(layer, key.slice(key.indexOf(':') + 1));
      this.overlay.closeLibraryMenu(target);
      return;
    }
    if (key === 'back') {
      const prev = this.onlineBack[target].pop();
      if (!prev) return;
      this.onlineRows[target] = prev.rows;
      this.onlineStatus[target] = prev.status;
      this.renderOnline(target);
      return;
    }
    const found = this.onlineTargets.get(key);
    if (!found) return;
    switch (found.kind) {
      case 'kitsuDir':
        await this.openRemoteDir(target, found.dir);
        break;
      case 'kitsuFile':
        await this.importRemote(target, found.dir, found.file);
        break;
      case 'providerSeries':
        await this.openProviderSeries(target, found.language, found.hit);
        break;
      case 'providerFile':
        await this.importProviderFile(target, found.language, found.hit, found.file);
        break;
    }
  }

  private async applyLibraryItem(target: LayerId, id: string): Promise<void> {
    const [text, items, packs] = await Promise.all([readLibraryText(id), listLibrary(), listPacks()]);
    const entry = items.find((e) => e.id === id);
    if (!text || !entry) {
      log('library item unavailable', id);
      return;
    }
    const label = displayLabel(entry, items);
    // A fresh selection re-runs detection; the pack's declared language is only a fallback for
    // text too short to classify.
    this.cfg.subs[target] = { ...this.cfg.subs[target], name: label, text, languageAuto: true };
    this.applySubtitle(target, label, text, packs.find((p) => p.id === entry.packId)?.language);
    this.overlay.syncPanel();
    this.onSubtitlePicked(target, { id, name: label, packId: entry.packId });
    this.save();
    if (target === 'a') void patchLibrarySettings({ lastId: id });
  }

  private applySubtitle(target: LayerId, name: string, text: string, languageHint?: string): void {
    const language = this.resolveSubtitleLanguage(target, text, languageHint);
    const cues = parseSubtitles(text);
    this.timelines[target].setCues(cues);
    if (target === 'a') this.transcript.setCues(cues);
    void this.analysis[target].select(cues, language).then(() => {
      this.overlay.setNlpStatus(this.analysis[target].status);
      if (this.video.paused) this.shownCue[target] = null;
      if (target === 'a') this.transcript.refresh();
    });
    this.shownCue[target] = null;
    log(`loaded ${cues.length} cues into layer ${target}`, name, language);
    if (target === 'a' && cues.length) {
      void this.tokenizer.start(language).then((ok) => {
        if (ok) void this.tokenizer.warmup(language, cues);
      });
    }
  }

  /**
   * Language is content, not display: detect it from the subtitle text unless the user pinned a
   * language for this layer. The result is written back to the page config.
   */
  private resolveSubtitleLanguage(target: LayerId, text: string, hint?: string): string {
    const sub = this.cfg.subs[target];
    if (sub.languageAuto === false && sub.language) return sub.language;
    const language = resolveLanguageHint(text.slice(0, 4000), hint);
    if (sub.language !== language) {
      this.cfg.subs[target] = { ...sub, language };
      this.save();
    }
    return language;
  }

  private async loadFile(target: LayerId): Promise<void> {
    const file = await pickFile();
    if (!file) return;
    const text = await file.text();
    this.cfg.subs[target] = { ...this.cfg.subs[target], name: file.name, text, languageAuto: true };
    this.applySubtitle(target, file.name, text);
    this.overlay.syncPanel();
    this.onSubtitlePicked(target, { id: '', name: file.name });
    this.save();
  }

  private onMouseMove = (event: MouseEvent): void => {
    this.overlay.setHover(this.overlay.isInside(event.clientX, event.clientY));
  };

  private onDragOver = (event: DragEvent): void => {
    if (this.overlay.isInside(event.clientX, event.clientY)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  };

  private onDrop = (event: DragEvent): void => {
    if (!this.overlay.isInside(event.clientX, event.clientY)) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    const target: LayerId = this.cfg.subs.a.text ? 'b' : 'a';
    void file.text().then((text) => {
      this.cfg.subs[target] = { ...this.cfg.subs[target], name: file.name, text, languageAuto: true };
      this.applySubtitle(target, file.name, text);
      this.overlay.syncPanel();
      this.onSubtitlePicked(target, { id: '', name: file.name });
      this.save();
    });
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    // Escape leaves the expanded player, matching what native fullscreen does.
    if (event.key === 'Escape' && this.theater.active()) {
      event.preventDefault();
      event.stopPropagation();
      this.toggleTheater();
      return;
    }
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 0.5 : 0.1;
    switch (event.code) {
      case 'BracketLeft':
        this.cfg.offset = Math.round((this.cfg.offset - step) * 10) / 10;
        break;
      case 'BracketRight':
        this.cfg.offset = Math.round((this.cfg.offset + step) * 10) / 10;
        break;
      case 'Backslash':
        this.cfg.layers.b.enabled = !this.cfg.layers.b.enabled;
        this.overlay.syncPanel();
        break;
      case 'KeyP':
        this.peekUntil = performance.now() + 1800;
        break;
      case 'KeyS': {
        // One press: record the ad at the playhead, then jump over it. Already-marked stretches
        // just borrow their stored end so a second press cannot stack duplicate slots.
        const playerTime = this.video.currentTime;
        const active = this.adMap.adAt(playerTime);
        const duration = Math.max(1, Math.round(this.adHooks.state().duration || DEFAULT_AD_DURATION));
        if (!active) {
          const at = this.adMap.toContent(playerTime);
          this.adHooks.onChange([...this.adMap.slots, { at, duration }]);
        }
        const target = active ? active.end : playerTime + duration;
        this.video.currentTime = this.video.duration > 0 ? Math.min(target, this.video.duration) : target;
        break;
      }
      case 'Enter': {
        const contentTime = this.adMap.toContent(this.video.currentTime) - this.cfg.offset;
        const cue = this.timelines.a.cueAt(contentTime);
        if (cue) {
          const playerTime = this.adMap.toPlayer(cue.start + this.cfg.offset);
          this.video.currentTime = Math.max(0, playerTime - 0.15);
        }
        break;
      }
      case 'ArrowUp':
        this.cfg.layers.a.anchorY = Math.max(0, this.cfg.layers.a.anchorY - 0.01);
        break;
      case 'ArrowDown':
        this.cfg.layers.a.anchorY = Math.min(1, this.cfg.layers.a.anchorY + 0.01);
        break;
      case 'ArrowLeft':
        this.cfg.layers.a.anchorX = Math.max(0, this.cfg.layers.a.anchorX - 0.01);
        break;
      case 'ArrowRight':
        this.cfg.layers.a.anchorX = Math.min(1, this.cfg.layers.a.anchorX + 0.01);
        break;
      case 'Equal':
      case 'Minus': {
        const dir = event.code === 'Equal' ? 1 : -1;
        const step = event.shiftKey ? 0.006 : 0.002;
        const lc = this.cfg.layers.a;
        lc.fontScale = Math.min(0.12, Math.max(0.02, Math.round((lc.fontScale + dir * step) * 1000) / 1000));
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.overlay.updateRect(pictureRect(this.video));
    this.overlay.syncPanel();
    this.save();
    log('offset', this.cfg.offset.toFixed(1));
  };
}

type PageState = { key: string; cfg: PageCfg; save: () => void };

const hydrateFromAssoc = async (state: PageState): Promise<void> => {
  const assoc = await loadAssoc(state.key);
  const items = Object.values(assoc).some((ref) => ref?.id) ? await listLibrary() : [];
  for (const layer of ['a', 'b'] as LayerId[]) {
    if (state.cfg.subs[layer].text) continue;
    const ref = assoc[layer];
    if (!ref?.id) continue;
    const text = await readLibraryText(ref.id);
    if (!text) continue;
    const entry = items.find((e) => e.id === ref.id);
    state.cfg.subs[layer] = {
      ...state.cfg.subs[layer],
      name: entry ? displayLabel(entry, items) : ref.name,
      text,
    };
    state.save();
    log(`auto-matched ${layer} subtitle from history`, ref.name);
  }
};

const applyLastLibraryItem = async (state: PageState): Promise<void> => {
  if (state.cfg.subs.a.text) return;
  const settings = await getLibrarySettings();
  if (!settings.autoApply || !settings.lastId) return;
  const [text, items, packs] = await Promise.all([
    readLibraryText(settings.lastId),
    listLibrary(),
    listPacks(),
  ]);
  const entry = items.find((e) => e.id === settings.lastId);
  if (!text || !entry) return;
  const language = state.cfg.subs.a.language;
  const pack = packs.find((item) => item.id === entry.packId);
  if (language && pack && pack.language !== language) return;
  state.cfg.subs.a = { ...state.cfg.subs.a, name: displayLabel(entry, items), text };
  state.save();
  log('auto-applied library subtitle', entry.name);
};

const applySiteSubtitle = async (
  state: PageState,
  site: ResolvedSite | null,
  siteRules: SiteRules,
): Promise<void> => {
  if (state.cfg.subs.a.text || !site || site.episode === null) return;

  let packId = boundPackOf(siteRules, site.rule.id, site.seriesId);
  if (!packId && site.seriesTitle) {
    const pack = matchPackByTitle(await listPacks(), site.seriesTitle, state.cfg.subs.a.language);
    if (!pack) return;
    packId = pack.id;
    // Bind only when the season is actually known; otherwise `#*` would hit every series.
    if (site.seriesId) void setSeriesBind(site.rule.id, site.seriesId, packId);
  }
  if (!packId) return;

  const entries = (await listLibrary()).filter((entry) => entry.packId === packId);
  const entry = pickEpisodeEntry(entries, site.episode, site.rule.fileTemplate);
  if (!entry) return;
  const text = await readLibraryText(entry.id);
  if (!text) return;
  state.cfg.subs.a = { ...state.cfg.subs.a, name: displayLabel(entry, entries), text };
  state.save();
  log(`auto-matched episode ${site.episode}`, entry.name);
};

const loadState = async (
  key: string,
  site: ResolvedSite | null,
  siteRules: SiteRules,
): Promise<PageState> => {
  const cfg = await loadPageCfg(key);
  const state: PageState = { key, cfg, save: makeSaver(key, () => cfg) };
  await hydrateFromAssoc(state);
  await applySiteSubtitle(state, site, siteRules);
  await applyLastLibraryItem(state);
  return state;
};

/** SPA route changes (player switches episodes without a reload). */
const watchUrl = (onChange: () => void): (() => void) => {
  let last = location.href;
  const check = (): void => {
    if (location.href === last) return;
    last = location.href;
    onChange();
  };
  const wrap = (fn: History['pushState']) =>
    function (this: History, ...args: Parameters<History['pushState']>): void {
      fn.apply(this, args);
      check();
    };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', check);
  window.addEventListener('hashchange', check);
  return () => {
    window.removeEventListener('popstate', check);
    window.removeEventListener('hashchange', check);
  };
};

/** Popup operations; frames without a video leave the message unanswered so the popup
 *  hears back from the frame that actually owns the player. */
type PopupStatus = {
  hasVideo: boolean;
  subtitle: string;
  theater: boolean;
  /** Layer A's content language, so the popup can show that language's dictionary bands. */
  language: string;
  site: {
    rule: string;
    series: string | null;
    title: string | null;
    season: string | null;
    episode: number | null;
  } | null;
};

let popupApi: {
  status: () => PopupStatus | null;
  apply: (id: string) => Promise<void>;
  panel: () => void;
  theater: () => boolean;
} | null = null;

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (!popupApi) return false;
  if (msg?.type === 'popupStatus') {
    const status = popupApi.status();
    if (!status) return false;
    respond(status);
    return false;
  }
  if (msg?.type === 'popupApply') {
    if (!popupApi.status()) return false;
    void popupApi
      .apply(String(msg.id))
      .then(() => respond({ ok: true }))
      .catch((err) => respond({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === 'popupPanel') {
    if (!popupApi.status()) return false;
    popupApi.panel();
    respond({ ok: true });
    return false;
  }
  if (msg?.type === 'popupTheater') {
    if (!popupApi.status()) return false;
    respond({ ok: true, active: popupApi.theater() });
    return false;
  }
  return false;
});

const start = async (): Promise<void> => {
  await initI18n();
  log(buildLabel());
  const stopFrameTheater = installFrameTheater();
  const tokenizer = new TokenizerClient();

  let siteRules: SiteRules = await loadSiteRules();
  let pageUrl = await resolvePageUrl();
  let site: ResolvedSite | null = await resolveSite(siteRules, pageUrl);
  if (site) log('site rule', site.rule.id, { id: site.seriesId, season: site.season, episode: site.episode });

  let state = await loadState(await resolvePageKey(), site, siteRules);
  log('page key', state.key);
  let dictSettings = await loadDictSettings();
  let subtitleStyle = await loadSubtitleStyle();
  let playback = await loadPlaybackSettings();

  let video: HTMLVideoElement | null = null;
  let session: Session | null = null;

  const changeAutoSkip = (enabled: boolean): void => {
    playback = { ...playback, autoSkipAds: enabled };
    session?.setAutoSkip(enabled);
    void savePlaybackSettings(playback).catch((err) => log('playback settings save failed', err));
  };

  const pushLibrary = async (): Promise<void> => {
    const [entries, packs] = await Promise.all([listLibrary(), listPacks()]);
    const titles = new Map(packs.map((p) => [p.id, p.title]));
    const languages = new Map(packs.map((p) => [p.id, p.language]));
    const byPack = new Map<string, string[]>();
    for (const entry of entries) {
      const names = byPack.get(entry.packId);
      if (names) names.push(entry.name);
      else byPack.set(entry.packId, [entry.name]);
    }
    const labels = new Map([...byPack].map(([packId, names]) => [packId, describeSubtitles(names)]));
    session?.setLibrary(
      entries.map(({ id, name, packId }) => ({
        id,
        name,
        label: labels.get(packId)?.get(name)?.label ?? name,
        packTitle: packTitleForDisplay(titles.get(packId) ?? UNFILED_TITLE, t),
        language: languages.get(packId),
      })),
    );
  };

  const adState = (): AdState => {
    if (!site) {
      return { slots: [], seriesLabel: '', duration: DEFAULT_AD_DURATION, canEdit: false };
    }
    return {
      slots: site.slots,
      seriesLabel: site.seriesTitle ?? (site.seriesId ? t('content.seriesLabel', { id: site.seriesId }) : ''),
      duration: site.adDuration,
      canEdit: site.episode !== null,
    };
  };

  /** Apply freshly saved rules to the in-memory site without another adapter round trip. */
  const applyRules = (next: SiteRules): void => {
    siteRules = next;
    const current = site;
    if (current) {
      const rule = next.rules.find((item) => item.id === current.rule.id);
      if (rule) {
        site = {
          ...current,
          rule,
          ...resolveAdSlots(rule, current.seriesId, current.season, current.episode),
        };
      }
    }
    session?.setAdMap(buildAdMap(site?.slots ?? []));
    session?.setAdState();
  };

  const changeEpisodeAds = (slots: AdSlot[]): void => {
    if (!site) return;
    const current = site;
    // Re-time the subtitles now; the storage write must not gate playback.
    site = {
      ...current,
      slots,
      adEpisodeKey: adEpisodeKey(current.seriesId, current.season, current.episode),
    };
    session?.setAdMap(buildAdMap(slots));
    session?.setAdState();
    void saveEpisodeAdSlots(current.rule.id, current.seriesId, current.season, current.episode, slots)
      .then((next) => {
        if (next) applyRules(next);
      })
      .catch((err) => log('ad slots save failed', err));
  };

  const rebuild = (): void => {
    session?.destroy();
    session = null;
    if (!video) return;
    session = new Session(
      video,
      state.cfg,
      state.save,
      tokenizer,
      dictSettings,
      subtitleStyle,
      buildAdMap(site?.slots ?? []),
      (layer, source) => {
        void setAssoc(state.key, layer, source ? { id: source.id, name: source.name, at: Date.now() } : null);
        // Without a series id the bind would be the `#*` wildcard, which then hits every season.
        if (layer === 'a' && source?.packId && site && (site.seriesId || !site.rule.adapter)) {
          void setSeriesBind(site.rule.id, site.seriesId, source.packId);
        }
      },
      () => pushLibrary(),
      { state: adState, onChange: changeEpisodeAds, onAutoSkip: changeAutoSkip },
    );
    session.setAutoSkip(playback.autoSkipAds);
    void pushLibrary();
  };

  popupApi = {
    status: () =>
      video
        ? {
            hasVideo: true,
            subtitle: state.cfg.subs.a.name,
            theater: session?.theaterActive() ?? false,
            language: state.cfg.subs.a.language ?? DEFAULT_LANGUAGE,
            site: site
              ? {
                  rule: site.rule.id,
                  series: site.seriesId,
                  title: site.seriesTitle,
                  season: site.season,
                  episode: site.episode,
                }
              : null,
          }
        : null,
    apply: async (id) => {
      if (!session) throw new Error(t('errors.noVideo'));
      await session.applyLibraryItemFromPopup(id);
    },
    panel: () => session?.openPanel(),
    theater: () => session?.toggleTheater() ?? false,
  };

  const onStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area === 'local' && changes[NLP_SETTINGS_KEY]) void session?.refreshNlpSettings();
    if (area === 'local' && changes[LANGUAGE_KEY]) {
      void loadLanguage().then((next) => {
        applyLanguage(next);
        session?.setLanguage(next);
      });
    }
    if (area === 'local' && Object.keys(changes).some(isLibraryKey)) void pushLibrary();
    if (area === 'local' && Object.keys(changes).some(isDictSettingsKey)) {
      void loadDictSettings().then((next) => {
        dictSettings = next;
        session?.setDictSettings(next);
      });
    }
    if (area === 'local' && Object.keys(changes).some(isSubtitleStyleKey)) {
      void loadSubtitleStyle().then((next) => {
        subtitleStyle = next;
        session?.setSubtitleStyle(next);
      });
    }
    if (area === 'local' && Object.keys(changes).some(isPlaybackSettingsKey)) {
      void loadPlaybackSettings().then((next) => {
        playback = next;
        session?.setAutoSkip(next.autoSkipAds);
      });
    }
    if (area === 'local' && Object.keys(changes).some(isSiteRulesKey)) {
      void loadSiteRules().then(async (next) => {
        siteRules = next;
        site = await resolveSite(siteRules, pageUrl);
        session?.setAdMap(buildAdMap(site?.slots ?? []));
        session?.setAdState();
        if (!state.cfg.subs.a.text) {
          await applySiteSubtitle(state, site, siteRules);
          if (state.cfg.subs.a.text) session?.loadSubtitle('a', state.cfg.subs.a.name, state.cfg.subs.a.text);
        }
        log('site rules updated', site?.rule.id ?? 'no match');
      });
    }
  };
  chrome.storage.onChanged.addListener(onStorageChange);

  const checkUrl = async (): Promise<void> => {
    const nextKey = await resolvePageKey();
    if (!nextKey || nextKey === state.key) return;
    pageUrl = await resolvePageUrl();
    site = await resolveSite(siteRules, pageUrl);
    state = await loadState(nextKey, site, siteRules);
    log('page key changed', state.key, site?.episode ?? '-');
    rebuild();
  };

  const stopWatching = watchVideos((v) => {
    video = v;
    rebuild();
    if (v) {
      log('attached to video', v.currentSrc || v.src || '(no src yet)');
      log(t('content.logReady'));
    }
  });

  const stopWatchingUrl = watchUrl(() => void checkUrl());
  // SPA players (bilibili, YouTube) switch episodes without a page load, and the isolated
  // world cannot intercept the page's own history.pushState — poll the URL instead.
  const urlPoll = window.setInterval(() => void checkUrl(), 2500);

  // Isolated-world handle for console debugging and smoke tests.
  Object.assign(window as unknown as Record<string, unknown>, {
    __jpSub: {
      setSubtitle: (text: string, name = 'debug') => {
        state.cfg.subs.a = { ...state.cfg.subs.a, name, text };
        session?.loadSubtitle('a', name, text);
        state.save();
      },
      tokenize: async (text: string, language = 'ja') => {
        await tokenizer.start(language);
        return tokenizer.tokenizeLine(language, text);
      },
      get config() {
        return state.cfg;
      },
      get pageKey() {
        return state.key;
      },
      diag: () => JSON.stringify(session?.diag() ?? { session: null }),
      openPanel: () => session?.openPanel(),
      theater: () => session?.toggleTheater() ?? false,
    },
  });

  window.addEventListener('pagehide', () => {
    stopWatching();
    stopWatchingUrl();
    stopFrameTheater();
    if (urlPoll) window.clearInterval(urlPoll);
    chrome.storage.onChanged.removeListener(onStorageChange);
    session?.destroy();
  });
};

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main() {
    const flag = window as unknown as { __jpSubLoaded?: boolean };
    if (flag.__jpSubLoaded) return;
    flag.__jpSubLoaded = true;
    void start().catch((e) => console.error('[jp-sub] init failed', e));
  },
});