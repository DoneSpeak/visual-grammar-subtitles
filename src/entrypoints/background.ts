import { defineBackground } from 'wxt/utils/define-background';
import kuromoji from '@sglkc/kuromoji';
import type { IpadicFeatures } from '@sglkc/kuromoji';
import type { DictEntry, DictFile } from '@/shared/dictionary';
import { DictIndex } from '@/shared/dictionary';
import type { Token } from '@/shared/types';
import { pageKeyFromUrl } from '@/shared/storage';
import { listDir, mergeSeries, searchSeries } from '@/features/scraper/kitsunekko';
import { translateToEnglish } from '@/shared/translate';
import { importKitsunekkoArchive, loadKitsunekkoIndex } from '@/shared/kitsunekkoLibrary';
import { fetchPgcSeason } from '@/shared/bilibiliPgc';

export default defineBackground(() => {

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const translationCache = new Map<string, string | null>();

/** Search-as-you-type retries the same prefixes, so cache both hits and misses. */
const translateCached = (query: string): Promise<string | null> => {
  const key = query.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  const cached = translationCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return translateToEnglish(query)
    .catch((err) => {
      console.warn('[jp-sub] translate failed', err);
      return null;
    })
    .then((result) => {
      translationCache.set(key, result);
      return result;
    });
};

type Tokenizer = { tokenize: (text: string) => IpadicFeatures[] };

let tokenizerPromise: Promise<{ tokenizer: Tokenizer | null; error?: string }> | null = null;

// kuromoji joins dicPath with a slash-collapsing regex, turning
// "chrome-extension://<id>/dict/..." into "chrome-extension:/<id>/dict/...".
const normalizeExtensionUrl = (url: string): string => url.replace(/^chrome-extension:\/+/, 'chrome-extension://');

const rawFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') return rawFetch(normalizeExtensionUrl(input), init);
  if (input instanceof URL) return rawFetch(normalizeExtensionUrl(input.href), init);
  return rawFetch(input, init);
}) as typeof fetch;

const getTokenizer = (): Promise<{ tokenizer: Tokenizer | null; error?: string }> => {
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = new Promise((resolve) => {
    kuromoji.builder({ dicPath: chrome.runtime.getURL('dict/') }).build((err, built) => {
      if (err) {
        const error = `kuromoji init failed: ${String(err)}`;
        console.error('[jp-sub]', error);
        resolve({ tokenizer: null, error });
        return;
      }
      resolve({ tokenizer: built as unknown as Tokenizer });
    });
  });
  return tokenizerPromise;
};

const toToken = (raw: IpadicFeatures): Token => ({
  surface: raw.surface_form ?? '',
  pos: raw.pos ?? '',
  posDetail1: raw.pos_detail_1 ?? '',
  conjType: raw.conjugated_type ?? '',
  conjForm: raw.conjugated_form ?? '',
  baseForm: raw.basic_form ?? '',
  reading: raw.reading ?? '',
});

let dictPromise: Promise<DictIndex | null> | null = null;

const getDictIndex = (): Promise<DictIndex | null> => {
  if (dictPromise) return dictPromise;
  dictPromise = fetch(chrome.runtime.getURL('dict/jlpt-dict.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<DictFile>;
    })
    .then((file) => new DictIndex(file.entries))
    .catch((err) => {
      console.error('[jp-sub] dictionary load failed', err);
      return null;
    });
  return dictPromise;
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'pageKey') {
    const url = sender.tab?.url ?? '';
    sendResponse({ key: url ? pageKeyFromUrl(url) : '', url });
    return true;
  }

  if (msg?.type === 'openOptions') {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'bilibiliPgcSeason') {
    void fetchPgcSeason({ epId: msg.epId, seasonId: msg.seasonId }).then((season) => {
      sendResponse(season ?? { error: 'bilibili 番剧信息获取失败' });
    });
    return true;
  }

  if (msg?.type === 'tokenize') {
    const lines: string[] = msg.lines ?? [];
    void Promise.all([getTokenizer(), getDictIndex()]).then(([{ tokenizer, error }, dict]) => {
      if (!tokenizer) {
        sendResponse({ error: error ?? 'tokenizer unavailable' });
        return;
      }
      try {
        const entries: DictEntry[] = [];
        const result = lines.map((line) =>
          tokenizer.tokenize(line).map((raw) => {
            const token = toToken(raw);
            const idx = dict?.find(token);
            if (idx !== undefined && dict) {
              token.dictIdx = entries.length;
              entries.push(dict.entry(idx));
            }
            return token;
          }),
        );
        sendResponse({ result, entries });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    });
    return true;
  }

  if (msg?.type === 'translateQuery') {
    void translateCached(String(msg.query ?? '')).then((query) => sendResponse({ query }));
    return true;
  }

  if (msg?.type === 'kitsuSearch') {
    const raw = String(msg.query ?? '');
    void Promise.all([loadKitsunekkoIndex(), translateCached(raw)])
      .then(([index, english]) => {
        const hits = mergeSeries([searchSeries(index, raw), english ? searchSeries(index, english) : []]);
        sendResponse({ hits: hits.slice(0, 40), translated: english ?? undefined });
      })
      .catch((err) => sendResponse({ error: errText(err) }));
    return true;
  }

  if (msg?.type === 'kitsuList') {
    void listDir(msg.path)
      .then((listing) => sendResponse(listing))
      .catch((err) => sendResponse({ error: errText(err) }));
    return true;
  }

  if (msg?.type === 'kitsuImport') {
    void importKitsunekkoArchive(msg.dir, msg.file)
      .then(({ pack, entries, errors }) =>
        sendResponse({
          packTitle: pack.title,
          entries: entries.map((entry) => ({ id: entry.id, name: entry.name })),
          errors,
        }),
      )
      .catch((err) => sendResponse({ error: errText(err) }));
    return true;
  }

  return false;
});
});
