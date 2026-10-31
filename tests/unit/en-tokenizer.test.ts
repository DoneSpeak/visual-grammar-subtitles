import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnLexicon } from '@/languages/en/lexicon';
import { createEnRuntime, createTokenizer, tokenize } from '@/languages/en/tokenizer';
import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

const entry = (w: string, p: string[], extra: Partial<DictEntry> = {}): DictEntry => ({
  id: `en:${w}`,
  w,
  r: '',
  lv: 0,
  p,
  g: [],
  x: [],
  lang: 'en',
  ...extra,
});

const LEXICON = new EnLexicon([
  entry('quick', ['ADJ']),
  entry('brown', ['ADJ']),
  entry('fox', ['NOUN']),
  entry('jump', ['VERB']),
  entry('lazy', ['ADJ']),
  entry('dog', ['NOUN']),
  entry('work', ['VERB']),
  entry('run', ['VERB']),
  entry('go', ['VERB']),
  entry('need', ['VERB']),
  entry('give', ['VERB']),
  entry('store', ['NOUN']),
  entry('like', ['VERB']),
]);

const words = (text: string, lexicon: EnLexicon | null = LEXICON): Token[] =>
  tokenize(text, lexicon).filter((token) => /\S/.test(token.surface));

const posOf = (text: string, word = text): string | undefined =>
  words(text).find((token) => token.surface.toLowerCase() === word)?.pos;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('English tokenizer', () => {
  it.each([
    'The quick brown fox jumps over the lazy dog.',
    "I don't know, it's well-known.",
    'Line one\nLine two\twith  spaces',
    '3.14% e-mail and a URL: https://example.com/a?b=c',
    '“Curly” quotes — and an em-dash…',
    '',
  ])('reconstructs every surface exactly: %j', (line) => {
    const tokens = tokenize(line, LEXICON);
    expect(tokens.map((token) => token.surface).join('')).toBe(line);
  });

  it('emits whitespace as SYM/SPACE and punctuation as PUNCT', () => {
    const tokens = tokenize('Hello,\nworld', null);
    const space = tokens.find((token) => token.surface === '\n');
    expect(space).toMatchObject({ pos: 'SYM', posRaw: 'SPACE' });
    expect(tokens.find((token) => token.surface === ',')).toMatchObject({ pos: 'PUNCT' });
  });

  it('assigns sensible UPOS to a real sentence', () => {
    const line = 'The quick brown fox jumps over the lazy dog.';
    expect(posOf(line, 'the')).toBe('DET');
    expect(posOf(line, 'quick')).toBe('ADJ');
    expect(posOf(line, 'brown')).toBe('ADJ');
    expect(posOf(line, 'fox')).toBe('NOUN');
    expect(posOf(line, 'jumps')).toBe('VERB');
    expect(posOf(line, 'over')).toBe('ADP');
    expect(posOf(line, 'lazy')).toBe('ADJ');
    expect(posOf(line, 'dog')).toBe('NOUN');
  });

  it('resolves inflected forms through the lexicon and records morphology', () => {
    const worked = words('They worked.').find((token) => token.surface === 'worked');
    expect(worked).toMatchObject({ pos: 'VERB', baseForm: 'work', morph: { Tense: 'Past' } });

    const running = words('is running').find((token) => token.surface === 'running');
    expect(running).toMatchObject({ pos: 'VERB', baseForm: 'run', morph: { VerbForm: 'Ger' } });
  });

  it('does not strip an ending without lexicon confirmation', () => {
    const worked = tokenize('worked', null)[0];
    expect(worked).toMatchObject({ pos: 'VERB', baseForm: 'worked', morph: { Tense: 'Past' } });
  });

  it('marks negated auxiliaries with Polarity=Neg', () => {
    const dont = words("I don't know.").find((token) => token.surface === "don't");
    expect(dont).toMatchObject({ pos: 'AUX', baseForm: 'do', morph: { Polarity: 'Neg' } });

    const not = words('I will not go.').find((token) => token.surface === 'not');
    expect(not).toMatchObject({ pos: 'PART', morph: { Polarity: 'Neg' } });
  });

  it('treats "to" as a preposition or an infinitive marker by context', () => {
    const infinitive = words('I want to go').find((token) => token.surface === 'to');
    expect(infinitive).toMatchObject({ pos: 'PART', morph: { VerbForm: 'Inf' } });

    const preposition = words('to the store').find((token) => token.surface === 'to');
    expect(preposition).toMatchObject({ pos: 'ADP' });
  });

  it('uses suffix rules only where they are reliable', () => {
    expect(posOf('quickly')).toBe('ADV');
    expect(posOf('happiness')).toBe('NOUN');
    expect(posOf('famous')).toBe('ADJ');
    expect(posOf('zorblat')).toBe('X');
    expect(posOf('zorbing')).toBe('X');
  });

  it('keeps unknown words at X instead of guessing', () => {
    const tokens = words('The flibbertigibbet snorf.');
    expect(tokens.find((token) => token.surface === 'flibbertigibbet')?.pos).toBe('X');
    expect(tokens.find((token) => token.surface === 'snorf')?.pos).toBe('X');
  });

  it('exposes the tokenizer through the runtime factory and degrades without chrome', async () => {
    vi.stubGlobal('chrome', undefined);
    const runtime = await createEnRuntime();
    expect(runtime.lexicon).toBeNull();
    const tokenizer = createTokenizer(null);
    expect(tokenizer.tokenize('Hello world').map((token) => token.surface).join('')).toBe('Hello world');
  });
});
