import { nlpMessage } from '@/nlp/background';
import { defineBackground } from 'wxt/utils/define-background';
import { loadLanguageRuntime } from '@/languages/tokenizers';
import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';
import { pageKeyFromUrl } from '@/shared/storage';
import { listDir, mergeSeries, searchSeries } from '@/features/scraper/kitsunekko';
import { translateToEnglish } from '@/shared/translate';
import { importKitsunekkoArchive, loadKitsunekkoIndex } from '@/shared/kitsunekkoLibrary';
import { providerFor } from '@/features/scraper/providers';
import { PROVIDER_KEYS_KEY, sanitizeProviderKeys } from '@/shared/providerSettings';
import { importLibraryFiles } from '@/shared/library';
import { fetchPgcSeason } from '@/shared/bilibiliPgc';
import { initI18n, t } from '@/shared/i18n';

export default defineBackground(() => {
// Service-worker errors are generated at request time, so the stored language must be loaded first.
void initI18n();

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

// kuromoji joins dicPath with a slash-collapsing regex, turning
// "chrome-extension://<id>/dict/..." into "chrome-extension:/<id>/dict/...".
const normalizeExtensionUrl = (url: string): string => url.replace(/^chrome-extension:\/+/, 'chrome-extension://');

const rawFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') return rawFetch(normalizeExtensionUrl(input), init);
  if (input instanceof URL) return rawFetch(normalizeExtensionUrl(input.href), init);
  return rawFetch(input, init);
}) as typeof fetch;

const languageOf = (value: unknown): string => (typeof value === 'string' && value ? value : 'ja');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'nlp') {
    void nlpMessage(msg).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }

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
      sendResponse(season ?? { error: t('errors.bilibiliInfo') });
    });
    return true;
  }

  if (msg?.type === 'lookupTokens') {
    const tokens = msg.tokens as Token[];
    if (!Array.isArray(tokens) || tokens.length > 20000) { sendResponse({ error: 'Invalid tokens' }); return false; }
    void loadLanguageRuntime(languageOf(msg.language)).then((runtime) => {
      const lexicon = runtime?.lexicon ?? null;
      const entries: DictEntry[] = [];
      const result = tokens.map((token) => {
        const index = lexicon?.find(token);
        if (index === undefined || !lexicon) return token;
        const dictIdx = entries.length;
        entries.push(lexicon.entry(index));
        return { ...token, dictIdx };
      });
      sendResponse({ tokens: result, entries });
    });
    return true;
  }

  if (msg?.type === 'tokenize') {
    const lines: string[] = msg.lines ?? [];
    void loadLanguageRuntime(languageOf(msg.language)).then((runtime) => {
      if (!runtime) {
        sendResponse({ error: 'tokenizer unavailable' });
        return;
      }
      try {
        const entries: DictEntry[] = [];
        const result = lines.map((line) =>
          runtime.tokenizer.tokenize(line).map((token) => {
            const idx = runtime.lexicon?.find(token);
            if (idx !== undefined && runtime.lexicon) {
              token.dictIdx = entries.length;
              entries.push(runtime.lexicon.entry(idx));
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

  // Provider traffic stays in the service worker: MV3 content scripts cannot fetch cross-origin
  // even with host permissions, and the API key must never leave storage.
  if (
    msg?.type === 'providerSearch' ||
    msg?.type === 'providerList' ||
    msg?.type === 'providerImport'
  ) {
    const language = typeof msg.language === 'string' ? msg.language : '';
    const descriptor = providerFor(language);
    const resolve = async () => {
      if (!descriptor || (typeof msg.provider === 'string' && msg.provider !== descriptor.id)) {
        return { error: 'no-provider' } as const;
      }
      const raw = await chrome.storage.local.get(PROVIDER_KEYS_KEY);
      const key = sanitizeProviderKeys(raw[PROVIDER_KEYS_KEY])[descriptor.id] ?? '';
      if (descriptor.requiresKey && !key) return { error: 'no-key' } as const;
      return { provider: descriptor.create(key, language), descriptor } as const;
    };
    void resolve()
      .then(async (found) => {
        if ('error' in found) {
          sendResponse({ error: found.error });
          return;
        }
        const { provider, descriptor } = found;
        if (msg.type === 'providerSearch') {
          const hits = await provider.search(String(msg.query ?? '').trim());
          sendResponse({ hits });
          return;
        }
        if (msg.type === 'providerList') {
          const files = await provider.listEpisodes(msg.hit, {});
          sendResponse({ files });
          return;
        }
        const fetched = await provider.fetch(msg.file);
        if (!fetched.length) {
          sendResponse({ error: 'empty-file' });
          return;
        }
        const files = fetched.map((item) => new File([item.text], item.name, { type: 'text/plain' }));
        const { pack, added, errors } = await importLibraryFiles(files, {
          title: String(msg.hit?.title ?? ''),
          language,
          origin: {
            kind: 'provider',
            provider: descriptor.id,
            seriesId: msg.hit?.id,
            release: msg.file?.release,
            url: msg.file?.url,
            sourceUrl: msg.file?.sourceUrl,
            importedAt: Date.now(),
          },
        });
        sendResponse({
          packTitle: pack.title,
          entries: added.map((entry) => ({ id: entry.id, name: entry.name })),
          errors: errors.length,
        });
      })
      .catch((err) => sendResponse({ error: errText(err) }));
    return true;
  }

  return false;
});
});
