import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokenizerClient } from '@/features/overlay/tokenize/client';

type Request = { type: string; language: string; lines: string[] };

const reply = (msg: Request) => ({
  // Non-empty token arrays are what the client caches.
  result: msg.lines.map((line) => [{ surface: line, pos: 'X', baseForm: line }]),
  entries: [],
});

describe('tokenizer cache key', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keys cached lines by language and forwards the language on every request', async () => {
    const sendMessage = vi.fn(async (msg: Request) => reply(msg));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const client = new TokenizerClient();

    const ja = await client.tokenizeLine('ja', '同じ行');
    const en = await client.tokenizeLine('en', '同じ行');

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, { type: 'tokenize', language: 'ja', lines: ['同じ行'] });
    expect(sendMessage).toHaveBeenNthCalledWith(2, { type: 'tokenize', language: 'en', lines: ['同じ行'] });
    expect(client.peek('ja', '同じ行')).toBe(ja);
    expect(client.peek('en', '同じ行')).toBe(en);
    expect(client.peek('fr', '同じ行')).toBeUndefined();

    // A hit in one language must not be served to another.
    await client.tokenizeLine('ja', '同じ行');
    expect(sendMessage).toHaveBeenCalledTimes(2);
    await client.tokenizeLine('fr', '同じ行');
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'tokenize', language: 'fr', lines: ['同じ行'] });
  });

  it('warms the cache per language', async () => {
    const sendMessage = vi.fn(async (msg: Request) => reply(msg));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const client = new TokenizerClient();

    await client.warmup('ja', [{ text: '一行' }, { text: '二行' }]);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'tokenize', language: 'ja', lines: ['一行', '二行'] });
    expect(client.peek('ja', '一行')?.tokens).toHaveLength(1);
    expect(client.peek('en', '一行')).toBeUndefined();
  });
});
