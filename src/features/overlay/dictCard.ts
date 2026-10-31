import type { DictEntry } from '@/shared/dictionary';
import { createIcon } from '@/shared/icons';
import { t } from '@/shared/i18n';
import { toRomaji } from '@/shared/romaji';

/**
 * The dictionary card's styles and DOM live here rather than inside `Overlay` so the options
 * preview can render the same card playback shows. `DICT_CARD_CSS` is injected into the overlay's
 * shadow root and into the options document; colours stay on the card's own custom properties so
 * both contexts get the same dark surface regardless of theme.
 */
export const DICT_CARD_CSS = `
.dict-card { --card-bg: rgba(18,20,26,.97); --card-fg: #e8eaed; --card-muted: #99a3b0; --card-accent: #7fd3ff; --card-line: rgba(255,255,255,.12); --card-tile-bg: #f6f7f9; --card-radius: 16px; position: absolute; z-index: 5; width: 320px; max-width: 92%; max-height: 62vh; overflow-y: auto; padding: 10px 20px 18px; border-radius: var(--card-radius); background: var(--card-bg); border: 1px solid rgba(255,255,255,.14); color: var(--card-fg); font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; font-size: 12px; line-height: 1.5; text-align: center; pointer-events: auto; box-shadow: 0 18px 48px rgba(0,0,0,.6); transform: translate(-50%, -100%); }
.dict-card[hidden] { display: none; }
.dict-card .top { display: flex; align-items: center; justify-content: space-between; min-height: 26px; }
.dict-card .lv { padding: 1px 8px; border-radius: 99px; border: 1px solid rgba(127,211,255,.42); color: var(--card-accent); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.dict-card .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.06); color: var(--card-muted); cursor: pointer; transition: background 120ms, color 120ms; }
.dict-card .icon-btn:hover { background: rgba(127,211,255,.16); color: var(--card-accent); }
.dict-card .icon-btn svg { width: 14px; height: 14px; display: block; }
.dict-card .word-line { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; justify-items: center; margin-top: 4px; }
.dict-card .word { grid-column: 2; font-size: 44px; line-height: 1.15; font-weight: 700; letter-spacing: .01em; overflow-wrap: anywhere; }
.dict-card .word-line .icon-btn { grid-column: 3; justify-self: start; margin-left: 6px; width: 30px; height: 30px; flex: none; }
.dict-card .word-line .icon-btn svg { width: 19px; height: 19px; }
.dict-card .pron { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 0 10px; margin-top: 6px; }
.dict-card .pron .reading { font-size: 18px; font-weight: 600; color: var(--card-accent); letter-spacing: .02em; white-space: nowrap; }
.dict-card .pron .romaji { font-size: 16px; color: var(--card-muted); letter-spacing: .09em; white-space: nowrap; }
.dict-card .meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--card-line); }
.dict-card .pos { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.dict-card .pos span { padding: 0 6px; border-radius: 4px; background: rgba(255,255,255,.08); color: #b9c0c9; font-size: 10px; line-height: 1.7; }
.dict-card .gloss { font-size: 14px; font-weight: 500; line-height: 1.45; }
.dict-card .ex { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--card-line); text-align: left; }
.dict-card .ex-jp { display: flex; align-items: flex-start; gap: 6px; font-size: 12.5px; line-height: 1.55; }
.dict-card .ex-jp .text { flex: 1; min-width: 0; }
.dict-card .ex-jp .icon-btn { width: 22px; height: 22px; flex: none; margin-top: -2px; }
.dict-card .ex-jp .icon-btn svg { width: 12px; height: 12px; }
.dict-card .ex-en { margin-top: 2px; font-size: 11.5px; line-height: 1.5; color: var(--card-muted); }
/* Image card: the picture anchors the word, so it gets its own light tile — OpenMoji
   graphics are drawn for light surfaces and look muddy directly on the dark card. */
.dict-card.has-image { max-height: 70vh; }
.dict-card .img-tile { display: flex; align-items: center; justify-content: center; width: 100px; height: 100px; margin: 6px auto 0; border-radius: 20px; background: var(--card-tile-bg); opacity: 0; transition: opacity 160ms ease-out; }
.dict-card .img-tile.ready { opacity: 1; }
.dict-card .img-tile img { display: block; width: 84px; height: 84px; }
.dict-card.has-image .word { font-size: 38px; }
.dict-card .credit { margin-top: 10px; font-size: 9.5px; letter-spacing: .02em; color: var(--card-muted); opacity: .62; }
.dict-card .credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .dict-card .img-tile { transition: none; } }
`;

type SpeechLanguage = 'ja' | 'en' | 'th';

export type DictCardOptions = {
  /** `zh-CN` picks the Chinese glosses when the entry has them; anything else uses English. */
  uiLanguage?: string;
  /** Draw the romaji line under a Japanese reading. */
  romaji?: boolean;
  /** Show the close button; only surfaces that can dismiss the card should pass this. */
  closable?: boolean;
  onClose?: () => void;
  /** Defaults to the browser speech synthesizer. */
  onSpeak?: (text: string, language: SpeechLanguage) => void;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const speechLanguage = (entry: DictEntry): SpeechLanguage =>
  entry.lang === 'en' ? 'en' : entry.lang === 'th' ? 'th' : 'ja';

const speakText = (text: string, language: SpeechLanguage): void => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'en' ? 'en-US' : 'ja-JP';
  utterance.rate = language === 'en' ? 0.95 : 0.9;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(language));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
};

/**
 * Fill `card` with one dictionary entry, exactly as playback renders it. Callers own positioning,
 * visibility and the hide timer; this only builds content.
 */
export const renderDictCard = (
  card: HTMLElement,
  entry: DictEntry,
  options: DictCardOptions = {},
): void => {
  const {
    uiLanguage,
    romaji = false,
    closable = false,
    onClose,
    onSpeak = speakText,
  } = options;
  card.textContent = '';
  // Romaji is a Japanese-reading aid; other languages show their IPA instead.
  const isJa = !entry.lang || entry.lang === 'ja';
  const language = speechLanguage(entry);
  const reading = isJa && entry.r && entry.r !== entry.w ? entry.r : '';
  const roman = isJa && romaji ? toRomaji(entry.r || entry.w) : '';
  const ipa = isJa ? '' : (entry.ipa ?? '');
  const glosses = uiLanguage === 'zh-CN' && entry.z?.length ? entry.z : entry.g;

  card.classList.toggle('has-image', Boolean(entry.img));

  const iconButton = (name: 'close' | 'speaker', label: string): HTMLButtonElement => {
    const button = el('button', 'icon-btn');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(createIcon(name));
    return button;
  };

  const speakButton = (text: string, label: string): HTMLButtonElement => {
    const button = iconButton('speaker', label);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onSpeak(text, language);
    });
    return button;
  };

  const top = el('div', 'top');
  // `lv` is a language-specific band (JLPT); other languages leave it at 0 and get no badge.
  if (entry.lv > 0) top.appendChild(el('span', 'lv', `N${entry.lv}`));
  if (closable) {
    const close = iconButton('close', t('overlay.card.close'));
    if (onClose) close.addEventListener('click', onClose);
    top.appendChild(close);
  }
  card.appendChild(top);

  // A reviewed image turns the card into a mnemonic flashcard; words without one keep
  // the text-only layout. The word stays the largest text in both.
  if (entry.img) card.appendChild(imageTile(card, entry, glosses[0]));

  const wordLine = el('div', 'word-line');
  wordLine.append(
    el('span', 'word', entry.w),
    speakButton(entry.w, t('overlay.card.speakWord', { word: entry.w })),
  );
  card.appendChild(wordLine);

  const pron = el('div', 'pron');
  if (reading) pron.appendChild(el('span', 'reading', reading));
  if (ipa) pron.appendChild(el('span', 'reading', ipa));
  if (roman) pron.appendChild(el('span', 'romaji', roman));
  if (pron.childElementCount) card.appendChild(pron);

  const meta = el('div', 'meta');
  const badges = [...entry.p, ...(entry.tags ?? []).map((tag) => tag.toUpperCase())];
  if (badges.length) {
    const pos = el('div', 'pos');
    for (const badge of badges) pos.appendChild(el('span', '', badge));
    meta.appendChild(pos);
  }
  if (glosses.length) meta.appendChild(el('span', 'gloss', glosses.join(', ')));
  if (meta.childElementCount) card.appendChild(meta);

  // The image already adds height; one example keeps the flashcard scannable.
  for (const example of entry.img ? entry.x.slice(0, 1) : entry.x) {
    const box = el('div', 'ex');
    const jp = el('div', 'ex-jp');
    jp.append(
      el('span', 'text', example.j),
      speakButton(example.j, t('overlay.card.speakExample')),
    );
    box.append(jp, el('div', 'ex-en', example.e));
    card.appendChild(box);
  }
  if (entry.img) card.appendChild(imageCredit());
};

/** Light tile + fixed box so the async SVG never shifts the card. */
const imageTile = (card: HTMLElement, entry: DictEntry, hint?: string): HTMLDivElement => {
  const tile = el('div', 'img-tile');
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL(`vocab/openmoji/${entry.img}.svg`);
  img.alt = hint ?? t('overlay.card.imageAlt', { word: entry.w });
  img.decoding = 'async';
  img.addEventListener('load', () => tile.classList.add('ready'));
  img.addEventListener('error', () => {
    // A missing file must not leave a blank tile or a stretched text layout.
    tile.remove();
    card.querySelector('.credit')?.remove();
    card.classList.remove('has-image');
  });
  tile.appendChild(img);
  return tile;
};

const imageCredit = (): HTMLDivElement => {
  const credit = el('div', 'credit');
  const link = document.createElement('a');
  link.href = 'https://openmoji.org';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'OpenMoji';
  credit.append(
    document.createTextNode(t('overlay.card.imageCreditLead')),
    link,
    document.createTextNode(' · CC BY-SA 4.0'),
  );
  return credit;
};
