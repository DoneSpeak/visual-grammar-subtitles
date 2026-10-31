import { describe, expect, it } from 'vitest';

import { th } from '@/languages/th';
import { aspect, chunks, expressions, segmentation } from '@/languages/th/annotators';
import { thFeatures } from '@/languages/th/features';
import { tokenize } from '@/languages/th/tokenizer';
import { enGB, zhCN } from '@/shared/i18n/catalog';
import {
  SEGMENTATION_ELEMENT,
  TH_ASPECT_ELEMENTS,
  TH_CLAUSE_ELEMENTS,
  TH_EXPRESSION_ELEMENT,
  TH_PRONUNCIATION_ELEMENTS,
} from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';

const REFERENCE = 'ถ้าเหนื่อยก็พักก่อน เดี๋ยวฉันช่วยเอง';

const labels = (tokens: Token[], layer: string): string[] =>
  tokens.flatMap((token) => (token.grammar ?? []).filter((label) => label.startsWith(`${layer}:`)));

const chunkTexts = (tokens: Token[]): string[] => {
  const groups = new Map<string, string>();
  for (const token of tokens) {
    const id = token.groups?.['chunk.semantic'];
    if (id) groups.set(id, (groups.get(id) ?? '') + token.surface);
  }
  return [...groups.values()];
};

describe('Thai language pack contract', () => {
  it('identifies itself and wires the local annotators', () => {
    expect(th.id).toBe('th');
    expect(th.shortLabel).toBe('TH');
    expect(th.text.locale).toBe('th');
    for (const method of ['chunks', 'expressions', 'levels', 'local'] as const) {
      expect(typeof th.annotators[method]).toBe('function');
    }
    expect(th.features).toBe(thFeatures);
  });

  it('scores Thai letters above Latin ones and ignores non-letters', () => {
    expect(th.detect(REFERENCE)).toBeGreaterThan(0.9);
    expect(th.detect('hello world')).toBe(0);
    expect(th.detect('1234')).toBe(0);
  });

  it('shows the analyzer reading as ruby only when one exists', () => {
    expect(th.presentation.reading.layout).toBe('ruby');
    expect(th.presentation.reading.align('ถ้า', 'thâa')).toEqual({ prefix: '', base: 'ถ้า', ruby: 'thâa', suffix: '' });
    expect(th.presentation.reading.align('ถ้า', '')).toBeNull();
  });
});

describe('Thai local annotators on the reference line', () => {
  const tokens = tokenize(REFERENCE);

  it('tokenizes the line into the nine words plus the original space', () => {
    expect(tokens.map((token) => token.surface)).toEqual([
      'ถ้า',
      'เหนื่อย',
      'ก็',
      'พัก',
      'ก่อน',
      ' ',
      'เดี๋ยว',
      'ฉัน',
      'ช่วย',
      'เอง',
    ]);
    expect(tokens[0].pos).toBe('SCONJ');
    expect(tokens[2].pos).toBe('CCONJ');
    expect(tokens[8].pos).toBe('VERB');
  });

  it('marks a word boundary without touching the original text', () => {
    const annotated = segmentation(tokens);
    expect(labels(annotated, 'token.segment')).toHaveLength(9);
    expect(annotated.map((token) => token.surface).join('')).toBe(REFERENCE);
    expect(annotated[5].grammar).toBeUndefined();
  });

  it('groups the line into the four chunks from the spec', () => {
    expect(chunkTexts(chunks(tokens))).toEqual(['ถ้าเหนื่อย', 'ก็พักก่อน', 'เดี๋ยว', 'ฉันช่วยเอง']);
  });

  it('tags conditional, connective, sequence, prospective and emphasis words', () => {
    const annotated = aspect(tokens);
    const bySurface = new Map(annotated.map((token) => [token.surface, labels([token], 'aspect.function')]));
    expect(bySurface.get('ถ้า')).toEqual(['aspect.function:conditional']);
    expect(bySurface.get('ก็')).toEqual(['aspect.function:connective']);
    expect(bySurface.get('ก่อน')).toEqual(['aspect.function:sequence']);
    expect(bySurface.get('เดี๋ยว')).toEqual(['aspect.function:prospective']);
    expect(bySurface.get('เอง')).toEqual(['aspect.function:emphasis']);
  });

  it('tags both ends of a discontiguous progressive frame', () => {
    const annotated = aspect(tokenize('ฉันกำลังกินข้าวอยู่'));
    expect(annotated.filter((token) => labels([token], 'aspect.function').includes('aspect.function:progressive')).map((token) => token.surface)).toEqual(['กำลัง', 'อยู่']);
  });

  it('marks the fixed spoken patterns without breaking them into words', () => {
    const annotated = expressions(tokens);
    expect(labels(annotated, 'expression.pattern')).toHaveLength(9);
  });

  it('applies only the features it is asked for', () => {
    const onlyChunks = th.annotators.local(tokens, [], {}, ['chunk']);
    expect(chunkTexts(onlyChunks)).toHaveLength(4);
    expect(labels(onlyChunks, 'token.segment')).toHaveLength(0);
    expect(labels(onlyChunks, 'aspect.function')).toHaveLength(0);
  });
});

describe('Thai feature registry', () => {
  it('declares the six modes in merge order', () => {
    expect(thFeatures.features.map((feature) => feature.id)).toEqual([
      'pos',
      'segmentation',
      'chunk',
      'aspect',
      'expression',
      'syntax',
      'reading',
    ]);
    expect(thFeatures.order).toEqual([
      'pos',
      'segmentation',
      'chunk',
      'aspect',
      'expression',
      'syntax',
      'reading',
    ]);
    for (const id of ['syntax', 'reading']) {
      expect(thFeatures.features.find((feature) => feature.id === id)?.sources).toEqual(['remote']);
    }
  });

  it('names the Thai-specific layers', () => {
    expect(thFeatures.chunkGroupKey).toBe('chunk.semantic');
    expect(thFeatures.expressionElement).toBe(TH_EXPRESSION_ELEMENT);
    expect(thFeatures.levelElement).toBeNull();
    expect(thFeatures.features.find((feature) => feature.id === 'syntax')?.elements).toEqual(
      expect.arrayContaining([...TH_CLAUSE_ELEMENTS]),
    );
    expect(thFeatures.features.find((feature) => feature.id === 'reading')?.elements).toEqual(
      expect.arrayContaining([...TH_PRONUNCIATION_ELEMENTS]),
    );
  });

  it('gives every declared element a default style', () => {
    for (const feature of thFeatures.features) {
      for (const element of feature.elements) {
        expect(thFeatures.elementDefaults[element], element).toBeDefined();
      }
    }
    expect(thFeatures.elementDefaults[SEGMENTATION_ELEMENT]).toBeDefined();
    for (const element of TH_ASPECT_ELEMENTS) {
      expect(thFeatures.elementDefaults[element], element).toBeDefined();
    }
  });

  it('ships word segmentation plus chunking as the default playback mode', () => {
    expect(thFeatures.defaultPresetId).toBe('basic-focus');
    expect(thFeatures.builtIns.map((seed) => seed.id)).toEqual([
      'plain',
      'segmentation-focus',
      'chunk-focus',
      'basic-focus',
      'syntax-focus',
      'aspect-focus',
      'pronunciation-focus',
      'expression-focus',
    ]);
    expect(thFeatures.builtIns.find((seed) => seed.id === 'basic-focus')?.features).toEqual([
      'segmentation',
      'chunk',
    ]);
  });

  it('labels every built-in mode in both UI languages', () => {
    for (const seed of thFeatures.builtIns) {
      expect(enGB[seed.labelKey], seed.labelKey).toBeTruthy();
      expect(zhCN[seed.labelKey], seed.labelKey).toBeTruthy();
      expect(enGB[seed.detailKey], seed.detailKey).toBeTruthy();
      expect(zhCN[seed.detailKey], seed.detailKey).toBeTruthy();
    }
  });

  it('labels every Thai feature and element in both UI languages', () => {
    for (const feature of thFeatures.features) {
      const { labelKey, detailKey } = feature;
      expect(labelKey, feature.id).toBeDefined();
      expect(detailKey, feature.id).toBeDefined();
      expect(enGB[labelKey!], labelKey).toBeTruthy();
      expect(zhCN[labelKey!], labelKey).toBeTruthy();
      expect(enGB[detailKey!], detailKey).toBeTruthy();
      expect(zhCN[detailKey!], detailKey).toBeTruthy();
    }
  });
});
