import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import kuromoji from '@sglkc/kuromoji';
import type { IpadicFeatures } from '@sglkc/kuromoji';
import { it } from 'vitest';

/**
 * Regenerates `tests/fixtures/ja-learning-golden.json` from the real kuromoji tokenizer and the
 * bundled JLPT dictionary. Opt-in only — never runs as part of `pnpm test`, because a normal run
 * must not rewrite the snapshot it verifies:
 *
 *   UPDATE_GOLDEN=1 pnpm test -- ja-golden-update
 *
 * Requires `public/dict/` (built by `predev`/`prebuild`).
 */

import { annotateLocal } from '@/features/overlay/tokenize/local';
import { tokenElements, tokenStyle } from '@/features/overlay/tokenize/style';
import { DictIndex, type DictEntry, type DictFile } from '@/shared/dictionary';
import { defaultPreset, presetElements, type StudyPreset } from '@/shared/subtitleStyle';
import type { Token } from '@/shared/types';

const LINES = [
  'もう遅いよ、こんな時間に何してるの？',
  '私は彼のことを全然知らない。',
  '食べなければならない。',
  '静かな夜が続いていた。',
  '彼女はとても綺麗だった。',
  'ちょっと待ってください！',
  '本当にそう思う？',
  '東京に行ったことがありますか。',
];

const ANNOTATION_FEATURES = ['pos', 'chunk-rule', 'expression', 'level'] as const;

const toToken = (raw: IpadicFeatures): Token => ({
  surface: raw.surface_form ?? '',
  pos: raw.pos ?? '',
  posDetail1: raw.pos_detail_1 ?? '',
  conjType: raw.conjugated_type ?? '',
  conjForm: raw.conjugated_form ?? '',
  baseForm: raw.basic_form ?? '',
  reading: raw.reading ?? '',
});

const build = () =>
  new Promise<{ tokenize: (text: string) => IpadicFeatures[] }>((resolve, reject) => {
    kuromoji
      .builder({ dicPath: join(process.cwd(), 'public/dict/') })
      .build((err, built) => (err ? reject(err) : resolve(built as never)));
  });

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

const buildPresets = (): Record<string, StudyPreset> => ({
  'pos-basic': defaultPreset('pos-basic'),
  'chunk-focus': defaultPreset('chunk-focus'),
  'expression-focus': defaultPreset('expression-focus'),
  'reading-assist': defaultPreset('reading-assist'),
  custom: customPreset(),
});

const LEVELS: Record<number, boolean> = { 3: true, 4: true };

it.runIf(process.env.UPDATE_GOLDEN === '1')('generates the ja learning golden fixture', async () => {
  const tokenizer = await build();
  const dictFile = JSON.parse(
    readFileSync(join(process.cwd(), 'public/dict/jlpt-dict.json'), 'utf8'),
  ) as DictFile;
  const index = new DictIndex(dictFile.entries);

  const cases = LINES.map((line, caseIndex) => {
    const entries: DictEntry[] = [];
    const tokens = tokenizer.tokenize(line).map((features) => {
      const token = toToken(features);
      const found = index.find(token);
      if (found === undefined) return token;
      entries.push(index.entry(found));
      return { ...token, dictIdx: entries.length - 1 };
    });
    return { id: `case-${caseIndex + 1}`, line, tokens, entries };
  });

  const presets = buildPresets();
  const annotations: Record<string, unknown[]> = {};
  const expected: Record<string, Record<string, unknown[]>> = {};

  for (const testCase of cases) {
    const annotated = annotateLocal(testCase.tokens, testCase.entries, LEVELS, [...ANNOTATION_FEATURES]);
    annotations[testCase.id] = annotated.map((token) => ({
      surface: token.surface,
      ...(token.grammar ? { grammar: token.grammar } : {}),
      ...(token.groups ? { groups: token.groups } : {}),
    }));
    expected[testCase.id] = {};
    for (const [presetName, preset] of Object.entries(presets)) {
      const elements = presetElements(preset);
      expected[testCase.id][presetName] = annotated.map((_, index) => ({
        matched: tokenElements(annotated, index, preset.features),
        style: tokenStyle(annotated, index, preset, elements) ?? null,
      }));
    }
  }

  const fixture = {
    note: 'Japanese learning-output characterization. `tokens` are real kuromoji output plus the bundled JLPT dictionary lookup; `annotations`/`expected` are what the renderer must keep producing.',
    levels: LEVELS,
    cases,
    annotations,
    expected,
  };

  mkdirSync(join(process.cwd(), 'tests/fixtures'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'tests/fixtures/ja-learning-golden.json'),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
});
