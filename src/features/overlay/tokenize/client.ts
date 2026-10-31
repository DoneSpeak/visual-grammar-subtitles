import type { DictEntry, DictLine } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

export type { DictLine };

type TokenizeResponse = { result?: Token[][]; entries?: DictEntry[]; error?: string };

const CHUNK = 80;
const EMPTY: DictLine = { tokens: [], entries: [] };

/** Tokenization runs in the background service worker: content scripts cannot
 *  construct a Worker from an extension URL, and the SW avoids a dictionary
 *  load per frame. Dictionary lookups ride along with the tokenized line. */
export class TokenizerClient {
  private cache = new Map<string, DictLine>();
  private readyPromise: Promise<boolean> | null = null;

  start(): Promise<boolean> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.request(['テスト']).then((res) => res !== null);
    return this.readyPromise;
  }

  /** Dict indices reference `entries` from the same response, so every line
   *  keeps the full array even when it only uses part of it. */
  private async request(lines: string[]): Promise<DictLine[] | null> {
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'tokenize', lines })) as TokenizeResponse | undefined;
      if (!res || res.error || !res.result) {
        console.warn('[jp-sub] tokenizer unavailable', res?.error);
        return null;
      }
      const entries = res.entries ?? [];
      return res.result.map((tokens) => ({ tokens, entries }));
    } catch (e) {
      console.warn('[jp-sub] tokenizer request failed', e);
      return null;
    }
  }

  async tokenizeLine(line: string): Promise<DictLine> {
    const cached = this.peek(line);
    if (cached) return cached;
    const res = await this.request([line]);
    const parsed = res?.[0] ?? EMPTY;
    if (parsed.tokens.length) this.cache.set(line, parsed);
    return parsed;
  }

  /** Synchronous cache probe so a re-render (e.g. settings toggle) does not flash plain text. */
  peek(line: string): DictLine | undefined {
    return this.cache.get(line);
  }

  async warmup(cues: { text: string }[]): Promise<void> {
    const lines = [...new Set(cues.flatMap((c) => c.text.split('\n')).filter((l) => l && !this.cache.has(l)))];
    for (let i = 0; i < lines.length; i += CHUNK) {
      const batch = lines.slice(i, i + CHUNK);
      const res = await this.request(batch);
      if (!res) return;
      batch.forEach((line, idx) => {
        if (res[idx]?.tokens.length) this.cache.set(line, res[idx]);
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}