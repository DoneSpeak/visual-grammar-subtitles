import { describe, expect, it } from 'vitest';

import { en } from '@/languages/en';
import { enFeatures } from '@/languages/en/features';
import { enGB, zhCN } from '@/shared/i18n/catalog';
import type { Token } from '@/shared/types';

const token = (surface: string, pos: Token['pos'], extra: Partial<Token> = {}): Token => ({
  surface,
  pos,
  baseForm: surface.toLowerCase(),
  ...extra,
});

describe('English language pack contract', () => {
  it('identifies itself', () => {
    expect(en.id).toBe('en');
    expect(en.shortLabel).toBe('EN');
    expect(en.displayName).toBe('English');
  });

  it('implements every capability the renderer calls', () => {
    expect(typeof en.detect).toBe('function');
    expect(typeof en.toPos).toBe('function');
    expect(typeof en.posGroup).toBe('function');
    expect(typeof en.isInflected).toBe('function');
    expect(en.functionWords).toBeInstanceOf(Set);
    expect(typeof en.lookupKeys).toBe('function');
    for (const method of ['chunks', 'expressions', 'levels', 'local'] as const) {
      expect(typeof en.annotators[method]).toBe('function');
    }
    expect(typeof en.text.segment).toBe('function');
    expect(typeof en.text.classifyBreak).toBe('function');
    expect(typeof en.presentation.reading.align).toBe('function');
    expect(en.features).toBe(enFeatures);
  });

  it('maps native and UPOS tags without guessing', () => {
    expect(en.toPos('NOUN')).toBe('NOUN');
    expect(en.toPos('NNP')).toBe('PROPN');
    expect(en.toPos('VBZ')).toBe('VERB');
    expect(en.toPos('nonsense')).toBe('X');
    expect(en.posGroup(token('run', 'VERB'))).toBe('verb');
  });

  it('only reports inflection it can support', () => {
    expect(en.isInflected(token('ran', 'VERB', { baseForm: 'run', morph: { Tense: 'Past' } }))).toBe(true);
    expect(en.isInflected(token('run', 'VERB', { baseForm: 'run' }))).toBe(false);
  });

  it('skips dictionary lookup for function words only', () => {
    expect(en.lookupKeys(token('the', 'ADP', { baseForm: 'the' }))).toEqual([]);
    expect(en.lookupKeys(token('Runs', 'VERB', { baseForm: 'run' }))).toEqual(['run', 'runs']);
  });
});

describe('English detection', () => {
  it('scores spaced Latin text highly and caps below certainty', () => {
    expect(en.detect('hello world')).toBeGreaterThan(0.5);
    expect(en.detect('hello world')).toBeLessThanOrEqual(0.95);
  });

  it('rejects kana and Han-only text', () => {
    expect(en.detect('こんにちは')).toBe(0);
    expect(en.detect('漢字だけ')).toBe(0);
    expect(en.detect('漢字だけ')).toBeLessThan(0.5);
  });

  it('does not carry regex state between calls', () => {
    expect(en.detect('hello こんにちは')).toBe(0);
    expect(en.detect('hello こんにちは')).toBe(0);
    expect(en.detect('hello world')).toBeGreaterThan(0.5);
    expect(en.detect('hello かな')).toBe(0);
  });

  it('needs at least three Latin letters', () => {
    expect(en.detect('a b')).toBe(0);
    expect(en.detect('1234')).toBe(0);
    expect(en.detect('')).toBe(0);
  });

  it('damps a single unspaced Latin word', () => {
    expect(en.detect('hello')).toBeGreaterThan(0.5);
    expect(en.detect('hello')).toBeLessThan(0.95);
  });
});

describe('English text and presentation rules', () => {
  it('uses the English locale and segmenter', () => {
    expect(en.text.locale).toBe('en');
    const line = 'Hello, world!';
    expect(en.text.segment(line).join('')).toBe(line);
  });

  it('keeps closing punctuation off the start of a line and openings off the end', () => {
    expect(en.text.classifyBreak(')')).toEqual({ noLineStart: true, noLineEnd: false });
    expect(en.text.classifyBreak('(')).toEqual({ noLineStart: false, noLineEnd: true });
    expect(en.text.classifyBreak('world')).toEqual({ noLineStart: false, noLineEnd: false });
  });

  it('hides readings and has no ruby split', () => {
    expect(en.presentation.reading.layout).toBe('hidden');
    expect(en.presentation.reading.align('hello', '/həˈləʊ/')).toBeNull();
  });
});

describe('English feature registry', () => {
  it('declares the local and remote layers in merge order', () => {
    expect(enFeatures.features.map((feature) => feature.id)).toEqual([
      'pos',
      'exam',
      'chunk',
      'expression',
      'syntax',
    ]);
    expect(enFeatures.order).toEqual(['pos', 'exam', 'chunk', 'expression', 'syntax']);
    expect(enFeatures.features.find((feature) => feature.id === 'syntax')?.requires).toBe('remote');
  });

  it('names its expression, level and chunk layers', () => {
    expect(enFeatures.expressionElement).toBe('expression.phrase:all');
    expect(enFeatures.levelElement).toBe('exam.tags:all');
    expect(enFeatures.chunkGroupKey).toBe('chunk.phrase');
  });

  it('gives every declared element a default style', () => {
    for (const feature of enFeatures.features) {
      for (const element of feature.elements) {
        expect(enFeatures.elementDefaults[element], element).toBeDefined();
      }
    }
  });

  it('ships its built-in modes with labels in both languages', () => {
    expect(enFeatures.builtIns.map((seed) => seed.id)).toEqual([
      'plain',
      'pos-basic',
      'phrase-focus',
      'chunk-focus',
      'syntax-focus',
    ]);
    expect(enFeatures.defaultPresetId).toBe('pos-basic');
    for (const seed of enFeatures.builtIns) {
      expect(enGB[seed.labelKey], seed.labelKey).toBeTruthy();
      expect(zhCN[seed.labelKey], seed.labelKey).toBeTruthy();
      expect(enGB[seed.detailKey], seed.detailKey).toBeTruthy();
      expect(zhCN[seed.detailKey], seed.detailKey).toBeTruthy();
    }
  });
});
