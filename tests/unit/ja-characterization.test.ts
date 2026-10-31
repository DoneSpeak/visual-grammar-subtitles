import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { annotateLocal } from '@/features/overlay/tokenize/local';
import { tokenElements, tokenStyle, type MatchedElement } from '@/features/overlay/tokenize/style';
import type { DictEntry } from '@/shared/dictionary';
import type { ElementStyle } from '@/shared/elementStyle';
import type { FeatureId } from '@/shared/studyFeatures';
import { defaultPreset, presetElements, type StudyPreset } from '@/shared/subtitleStyle';
import type { Token } from '@/shared/types';

/**
 * Learning-output characterization for Japanese.
 *
 * The fixture freezes real kuromoji tokens (plus the bundled JLPT dictionary lookup) and the
 * learning output they must keep producing: annotations (grammar tags, chunk groups), matched
 * elements and the resolved ElementStyle per token. Refactors of the language seam must leave
 * `annotations` and `expected` byte-identical — only `tokens` may be migrated when the Token
 * shape itself changes. Regenerate with `tests/unit/zz-golden-gen.test.ts` only for a deliberate
 * behaviour change, and explain it in the commit message.
 */

type GoldenToken = Token;
type GoldenAnnotation = { surface: string; grammar?: string[]; groups?: Record<string, string> };
type GoldenMatch = { matched: MatchedElement[]; style: ElementStyle | null };

type GoldenFixture = {
  levels: Record<number, boolean>;
  cases: { id: string; line: string; tokens: GoldenToken[]; entries: DictEntry[] }[];
  annotations: Record<string, GoldenAnnotation[]>;
  expected: Record<string, Record<string, GoldenMatch[]>>;
};

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/ja-learning-golden.json'), 'utf8'),
) as GoldenFixture;

const ANNOTATION_FEATURES: FeatureId[] = ['pos', 'chunk-rule', 'expression', 'level'];

const customPreset = (): StudyPreset => ({
  ...defaultPreset('expression-focus'),
  features: [...ANNOTATION_FEATURES],
  base: { dimOpacity: 0.35, focusElement: 'token.pos:NOUN' },
  elements: {
    'token.pos:NOUN': { color: '#112233', opacity: 0.6 },
    'expression.grammar:all': { backgroundColor: '#F472B640', radiusPx: 4, color: '#ABCDEF' },
    'token.level:plan': { underline: { enabled: true, style: 'solid', color: '#FF00FF' } },
  },
  customized: true,
});

const PRESETS: Record<string, () => StudyPreset> = {
  'pos-basic': () => defaultPreset('pos-basic'),
  'chunk-focus': () => defaultPreset('chunk-focus'),
  'expression-focus': () => defaultPreset('expression-focus'),
  'reading-assist': () => defaultPreset('reading-assist'),
  custom: customPreset,
};

describe('ja learning output', () => {
  it.each(fixture.cases)('$id $line keeps its local annotations', (testCase) => {
    const annotated = annotateLocal(testCase.tokens, testCase.entries, fixture.levels, ANNOTATION_FEATURES);
    const actual = annotated.map((token) => ({
      surface: token.surface,
      ...(token.grammar ? { grammar: token.grammar } : {}),
      ...(token.groups ? { groups: token.groups } : {}),
    }));
    expect(actual).toEqual(fixture.annotations[testCase.id]);
  });

  for (const presetName of Object.keys(PRESETS)) {
    it.each(fixture.cases)(`$id $line resolves the same elements and styles (${presetName})`, (testCase) => {
      const preset = PRESETS[presetName]();
      const elements = presetElements(preset);
      const annotated = annotateLocal(testCase.tokens, testCase.entries, fixture.levels, preset.features);
      const actual = annotated.map((_, index) => ({
        matched: tokenElements(annotated, index, preset.features),
        style: tokenStyle(annotated, index, preset, elements) ?? null,
      }));
      expect(actual).toEqual(fixture.expected[testCase.id][presetName]);
    });
  }
});
