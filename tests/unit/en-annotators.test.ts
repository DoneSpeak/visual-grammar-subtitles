import { describe, expect, it } from 'vitest';

import { chunks, expressions, levels, local } from '@/languages/en/annotators';
import { CHUNK_GROUP_KEY, EXPRESSION_ELEMENT, LEVEL_ELEMENT } from '@/languages/en/features';
import { EnLexicon } from '@/languages/en/lexicon';
import { tokenize } from '@/languages/en/tokenizer';
import type { DictEntry } from '@/shared/dictionary';
import type { Pos, Token } from '@/shared/types';

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
  entry('like', ['VERB']),
  entry('tea', ['NOUN']),
  entry('coffee', ['NOUN']),
  entry('need', ['VERB']),
  entry('give', ['VERB']),
]);

const tokensFor = (line: string): Token[] => tokenize(line, LEXICON);

const token = (surface: string, pos: Pos, extra: Partial<Token> = {}): Token => ({
  surface,
  pos,
  baseForm: surface.toLowerCase(),
  ...extra,
});

const groupOf = (tokens: Token[], surface: string): string | undefined =>
  tokens.find((candidate) => candidate.surface === surface)?.groups?.[CHUNK_GROUP_KEY];

const grammarOf = (tokens: Token[], surface: string): string[] | undefined =>
  tokens.find((candidate) => candidate.surface === surface)?.grammar;

describe('English chunk annotator', () => {
  it('marks NP, VP and PP spans', () => {
    const annotated = chunks(tokensFor('The quick brown fox jumps over the lazy dog.'));
    const sentences = new Set(
      annotated.flatMap((candidate) => candidate.groups?.[CHUNK_GROUP_KEY] ?? []),
    );
    expect(sentences.size).toBe(3);

    expect(groupOf(annotated, 'The')).toBeDefined();
    expect(groupOf(annotated, 'fox')).toBe(groupOf(annotated, 'The'));
    expect(groupOf(annotated, 'jumps')).not.toBe(groupOf(annotated, 'fox'));
    expect(groupOf(annotated, 'over')).toBe(groupOf(annotated, 'dog'));
    expect(groupOf(annotated, 'over')).not.toBe(groupOf(annotated, 'jumps'));
  });

  it('writes contiguous token ranges and never spans punctuation', () => {
    const annotated = chunks(tokensFor('I like tea, and you like coffee.'));
    const comma = annotated.findIndex((candidate) => candidate.surface === ',');
    expect(annotated[comma].groups?.[CHUNK_GROUP_KEY]).toBeUndefined();

    const groups = new Set(
      annotated.flatMap((candidate) => candidate.groups?.[CHUNK_GROUP_KEY] ?? []),
    );
    for (const group of groups) {
      const indices = annotated.flatMap((candidate, index) =>
        candidate.groups?.[CHUNK_GROUP_KEY] === group ? [index] : [],
      );
      expect(indices.length).toBeGreaterThan(0);
      expect(indices[indices.length - 1] - indices[0] + 1).toBe(indices.length);
      expect(indices.every((index) => index < comma) || indices.every((index) => index > comma)).toBe(
        true,
      );
    }
  });

  it('does not call a bare adjective a noun phrase', () => {
    const annotated = chunks(tokensFor('very happy'));
    expect(annotated.every((candidate) => candidate.groups?.[CHUNK_GROUP_KEY] === undefined)).toBe(true);
  });
});

describe('English expression annotator', () => {
  it('matches phrasal verbs across whitespace', () => {
    const annotated = expressions(tokensFor('We need to give up now.'));
    expect(grammarOf(annotated, 'give')).toContain(EXPRESSION_ELEMENT);
    expect(grammarOf(annotated, 'up')).toContain(EXPRESSION_ELEMENT);
    expect(grammarOf(annotated, 'need')).toBeUndefined();
  });

  it('matches inflected forms through the lemma', () => {
    const annotated = expressions(tokensFor('He gave up.'));
    expect(grammarOf(annotated, 'gave')).toContain(EXPRESSION_ELEMENT);
    expect(grammarOf(annotated, 'up')).toContain(EXPRESSION_ELEMENT);
  });

  it('ignores punctuation but not whitespace', () => {
    const blocked = expressions(tokensFor('Give. up'));
    expect(blocked.some((candidate) => candidate.grammar?.includes(EXPRESSION_ELEMENT))).toBe(false);

    const acrossNewline = expressions(tokensFor('give\nup'));
    expect(grammarOf(acrossNewline, 'give')).toContain(EXPRESSION_ELEMENT);
  });

  it('matches multi-word idioms and collocations', () => {
    const annotated = expressions(tokensFor('In order to succeed, we need to give up.'));
    expect(grammarOf(annotated, 'In')).toContain(EXPRESSION_ELEMENT);
    expect(grammarOf(annotated, 'order')).toContain(EXPRESSION_ELEMENT);
    expect(grammarOf(annotated, 'to')).toContain(EXPRESSION_ELEMENT);
  });
});

describe('English exam annotator', () => {
  it('tags every dictionary word that carries an exam tag', () => {
    const tokens = [
      token('ability', 'NOUN', { dictIdx: 0 }),
      token('table', 'NOUN', { dictIdx: 1 }),
    ];
    const entries = [
      entry('ability', ['NOUN'], { tags: ['ielts', 'toefl'] }),
      entry('table', ['NOUN']),
    ];
    const annotated = levels(tokens, entries, { ielts: true, toefl: true });
    expect(annotated[0].grammar).toContain(LEVEL_ELEMENT);
    expect(annotated[1].grammar).toBeUndefined();
  });

  it('drops words whose only bands are switched off', () => {
    const tokens = [token('ability', 'NOUN', { dictIdx: 0 })];
    const entries = [entry('ability', ['NOUN'], { tags: ['ielts', 'toefl'] })];

    expect(levels(tokens, entries, { ielts: false, toefl: false })[0].grammar).toBeUndefined();
    expect(levels(tokens, entries, { ielts: false, toefl: true })[0].grammar).toContain(LEVEL_ELEMENT);
  });
});

describe('English local dispatch', () => {
  it('applies only the annotators the enabled features ask for', () => {
    const tokens = tokensFor('We need to give up now.');

    const expressionOnly = local(tokens, [], {}, ['expression']);
    expect(grammarOf(expressionOnly, 'give')).toContain(EXPRESSION_ELEMENT);
    expect(expressionOnly.every((candidate) => candidate.groups?.[CHUNK_GROUP_KEY] === undefined)).toBe(
      true,
    );

    const chunkOnly = local(tokens, [], {}, ['chunk']);
    expect(chunkOnly.find((candidate) => candidate.surface === 'give')?.groups?.[CHUNK_GROUP_KEY]).toBeDefined();
    expect(chunkOnly.some((candidate) => candidate.grammar?.includes(EXPRESSION_ELEMENT))).toBe(false);
  });

  it('applies exam tagging when exam is enabled', () => {
    const tokens = [token('ability', 'NOUN', { dictIdx: 0 })];
    const entries = [entry('ability', ['NOUN'], { tags: ['kaoyan'] })];
    expect(local(tokens, entries, { kaoyan: true }, ['exam'])[0].grammar).toContain(LEVEL_ELEMENT);
  });
});
