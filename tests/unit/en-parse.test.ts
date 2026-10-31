import { describe, expect, it } from 'vitest';

import { local } from '@/languages/en/annotators';
import { CHUNK_GROUP_KEY } from '@/languages/en/features';
import { EnLexicon } from '@/languages/en/lexicon';
import { parse } from '@/languages/en/parse';
import { tokenize } from '@/languages/en/tokenizer';
import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';

const entry = (w: string, p: string[]): DictEntry => ({
  id: `en:${w}`,
  w,
  r: '',
  lv: 0,
  p,
  g: [],
  x: [],
  lang: 'en',
});

const LEXICON = new EnLexicon([
  entry('make', ['VERB']),
  entry('offer', ['NOUN']),
  entry('refuse', ['VERB']),
  entry('fox', ['NOUN']),
  entry('jump', ['VERB']),
  entry('quick', ['ADJ']),
  entry('lazy', ['ADJ']),
  entry('dog', ['NOUN']),
  entry('sleep', ['VERB']),
  entry('happy', ['ADJ']),
  entry('give', ['VERB']),
  entry('book', ['NOUN']),
  entry('run', ['VERB']),
  entry('fast', ['ADV']),
  entry('read', ['VERB']),
  entry('morning', ['NOUN']),
]);

const tokensFor = (line: string): Token[] => tokenize(line, LEXICON);
const word = (tokens: Token[], surface: string): Token | undefined =>
  tokens.find((token) => token.surface === surface);
const grammarOf = (tokens: Token[], surface: string): string[] =>
  word(tokens, surface)?.grammar ?? [];
const groupOf = (tokens: Token[], surface: string): string | undefined =>
  word(tokens, surface)?.groups?.[CHUNK_GROUP_KEY];

const ALL = ['syntax', 'clause', 'structure', 'morph', 'chunk'] as const;

describe('English shallow parser: spec sentence', () => {
  const line = "I'm gonna make him an offer he can't refuse.";
  const tokens = tokensFor(line);
  const annotated = local(tokens, [], {}, [...ALL]);

  it('segments the spec sentence into the expected tokens', () => {
    expect(tokens.filter((token) => token.pos !== 'SYM').map((token) => token.surface)).toEqual([
      "I'm",
      'gonna',
      'make',
      'him',
      'an',
      'offer',
      'he',
      "can't",
      'refuse',
      '.',
    ]);
  });

  it('marks subject, predicate and two objects', () => {
    expect(grammarOf(annotated, "I'm")).toContain('syntax.role:subject');
    expect(grammarOf(annotated, 'gonna')).toContain('syntax.role:predicate');
    expect(grammarOf(annotated, 'make')).toContain('syntax.role:predicate');
    expect(grammarOf(annotated, 'him')).toContain('syntax.role:object');
    expect(grammarOf(annotated, 'an')).toContain('syntax.role:object');
    expect(grammarOf(annotated, 'offer')).toContain('syntax.role:object');
  });

  it('marks the contact relative clause and its roles', () => {
    for (const surface of ['he', "can't", 'refuse']) {
      expect(grammarOf(annotated, surface)).toContain('syntax.clause:attributive');
      expect(grammarOf(annotated, surface)).toContain('syntax.role:attributive');
    }
    expect(grammarOf(annotated, 'he')).toContain('syntax.role:subject');
    expect(grammarOf(annotated, "can't")).toContain('syntax.role:predicate');
    expect(grammarOf(annotated, 'refuse')).toContain('syntax.role:predicate');
    expect(grammarOf(annotated, 'make')).not.toContain('syntax.clause:attributive');
  });

  it('marks VP and nested NPs', () => {
    for (const surface of ["I'm", 'gonna', 'make']) {
      expect(grammarOf(annotated, surface)).toContain('phrase.structure:VP');
    }
    expect(grammarOf(annotated, 'an')).toContain('phrase.structure:NP');
    expect(grammarOf(annotated, 'offer')).toContain('phrase.structure:NP');
    // The relative clause extends its head: `an offer he can't refuse` is one outer NP.
    expect(grammarOf(annotated, 'he')).toContain('phrase.structure:NP');
    expect(grammarOf(annotated, 'refuse')).toContain('phrase.structure:NP');
  });

  it('marks contractions, modals, negation and verb forms', () => {
    expect(grammarOf(annotated, "I'm")).toContain('morph.form:contraction');
    expect(grammarOf(annotated, 'gonna')).toEqual(
      expect.arrayContaining(['morph.form:contraction', 'morph.form:modal']),
    );
    expect(grammarOf(annotated, "can't")).toEqual(
      expect.arrayContaining([
        'morph.form:contraction',
        'morph.form:modal',
        'morph.form:negation',
      ]),
    );
    expect(grammarOf(annotated, 'make')).toContain('morph.form:verbForm');
    expect(grammarOf(annotated, 'refuse')).toContain('morph.form:verbForm');
  });

  it('chunks the spec sentence into three clause-aware groups', () => {
    const ids = [groupOf(annotated, "I'm"), groupOf(annotated, 'gonna'), groupOf(annotated, 'make'),
      groupOf(annotated, 'him'), groupOf(annotated, 'an'), groupOf(annotated, 'offer')];
    expect(new Set(ids.slice(0, 2)).size).toBe(1);
    expect(new Set(ids.slice(2)).size).toBe(1);
    expect(ids[0]).not.toBe(ids[2]);
    const clause = ['he', "can't", 'refuse'].map((surface) => groupOf(annotated, surface));
    expect(new Set(clause).size).toBe(1);
    expect(clause[0]).not.toBe(ids[2]);
    expect(word(annotated, '.')?.groups?.[CHUNK_GROUP_KEY]).toBeUndefined();
  });
});

describe('English shallow parser: conservative cases', () => {
  it('leaves a greeting without roles or clauses', () => {
    const annotated = parse(tokensFor('Hello.'));
    expect(annotated.every((token) => !token.grammar?.length)).toBe(true);
  });

  it('does not invent roles for a verbless string', () => {
    const annotated = local(tokensFor('very happy'), [], {}, [...ALL]);
    expect(annotated.every((token) => !token.grammar?.length)).toBe(true);
  });

  it('does not treat an object pronoun as a contact relative clause', () => {
    const annotated = local(tokensFor('I told him he was wrong.'), [], {}, [...ALL]);
    expect(grammarOf(annotated, 'he')).not.toContain('syntax.clause:attributive');
  });

  it('marks the complement after a copula, not an object', () => {
    const annotated = local(tokensFor('She is happy.'), [], {}, [...ALL]);
    expect(grammarOf(annotated, 'happy')).toContain('syntax.role:complement');
    expect(grammarOf(annotated, 'happy')).not.toContain('syntax.role:object');
  });

  it('marks a trailing adverb as adverbial', () => {
    const annotated = local(tokensFor('He runs fast.'), [], {}, [...ALL]);
    expect(grammarOf(annotated, 'fast')).toContain('syntax.role:adverbial');
    expect(grammarOf(annotated, 'fast')).not.toContain('syntax.role:object');
  });

  it('keeps the greedy NP/VP/PP chunks for a plain sentence', () => {
    const annotated = local(tokensFor('The quick brown fox jumps over the lazy dog.'), [], {}, ['chunk']);
    expect(groupOf(annotated, 'The')).toBe(groupOf(annotated, 'fox'));
    expect(groupOf(annotated, 'jumps')).not.toBe(groupOf(annotated, 'fox'));
    expect(groupOf(annotated, 'over')).toBe(groupOf(annotated, 'dog'));
    expect(new Set(annotated.flatMap((token) => token.groups?.[CHUNK_GROUP_KEY] ?? [])).size).toBe(3);
  });
});
