import type { LanguageId } from '@/languages/types';
import type { DictEntry, DictLine } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

export type { DictLine };

type TokenizeResponse = { result?: Token[][]; entries?: DictEntry[]; error?: string };

const CHUNK = 80;
const EMPTY: DictLine = { tokens: [], entries: [] };

/**
 * Tokenization runs in the background service worker: content scripts cannot construct a Worker
 * from an extension URL, and the SW avoids a dictionary load per frame. Dictionary lookups ride
 * along with the tokenized line.
 *
 * Cache entries are keyed by language first: the same surface line tokenized as Japanese and as
 * English is different data, and a layer can switch language without a reload.
 */
export class TokenizerClient {
  private cache = new Map<string, DictLine>();
  private ready = new Map<LanguageId, Promise<boolean>>();

  private static key(language: LanguageId, line: string): string {
    return `${language}\u0000${line}`;
  }

  start(language: LanguageId): Promise<boolean> {
    const cached = this.ready.get(language);
    if (cached) return cached;
    const pending = this.request(language, ['テスト']).then((res) => res !== null);
    this.ready.set(language, pending);
    return pending;
  }

  /** Dict indices reference `entries` from the same response, so every line
   *  keeps the full array even when it only uses part of it. */
  private async request(language: LanguageId, lines: string[]): Promise<DictLine[] | null> {
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'tokenize', language, lines })) as
        | TokenizeResponse
        | undefined;
      if (!res || res.error || !res.result) {
        console.warn('[jp-sub] tokenizer unavailable', language, res?.error);
        return null;
      }
      const entries = res.entries ?? [];
      return res.result.map((tokens) => ({ tokens, entries }));
    } catch (e) {
      console.warn('[jp-sub] tokenizer request failed', e);
      return null;
    }
  }

  async tokenizeLine(language: LanguageId, line: string): Promise<DictLine> {
    const cached = this.peek(language, line);
    if (cached) return cached;
    const res = await this.request(language, [line]);
    const parsed = res?.[0] ?? EMPTY;
    if (parsed.tokens.length) this.cache.set(TokenizerClient.key(language, line), parsed);
    return parsed;
  }

  /** Synchronous cache probe so a re-render (e.g. settings toggle) does not flash plain text. */
  peek(language: LanguageId, line: string): DictLine | undefined {
    return this.cache.get(TokenizerClient.key(language, line));
  }

  async warmup(language: LanguageId, cues: { text: string }[]): Promise<void> {
    const lines = [
      ...new Set(
        cues
          .flatMap((c) => c.text.split('\n'))
          .filter((l) => l && !this.cache.has(TokenizerClient.key(language, l))),
      ),
    ];
    for (let i = 0; i < lines.length; i += CHUNK) {
      const batch = lines.slice(i, i + CHUNK);
      const res = await this.request(language, batch);
      if (!res) return;
      batch.forEach((line, idx) => {
        if (res[idx]?.tokens.length) this.cache.set(TokenizerClient.key(language, line), res[idx]);
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
