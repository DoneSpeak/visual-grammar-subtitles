import { defaultPosColors, POS_GROUPS } from '@/shared/posColors';
import type { ElementStyle } from '@/shared/elementStyle';
import {
  chunkElements,
  EN_CLAUSE_ELEMENTS,
  EN_ROLE_ELEMENTS,
  POS_ELEMENT,
  type FeatureRegistry,
  type StudyFeature,
} from '@/shared/studyFeatures';

/**
 * English feature registry: the local layers the pack can produce and the modes it ships with.
 *
 * English has no ruby and no JLPT bands, so the palette omits the reading element and replaces
 * study-plan levels with exam vocabulary tags. Chunk elements are namespaced by `chunk.phrase` so
 * they never collide with Japanese bunsetsu elements in the per-language preset buckets.
 */

/** Layer a phrase annotation lands in; also the key of `Token.groups`. */
export const CHUNK_GROUP_KEY = 'chunk.phrase';

export const LEVEL_ELEMENT = 'exam.tags:all';
export const EXPRESSION_ELEMENT = 'expression.phrase:all';

export const CHUNK_ELEMENTS: string[] = chunkElements(CHUNK_GROUP_KEY);

export const STUDY_FEATURES: StudyFeature[] = [
  {
    id: 'pos',
    group: 'token',
    requires: 'local',
    elements: POS_GROUPS.map((group) => POS_ELEMENT[group]),
    labelKey: 'modes.en.feature.pos',
    detailKey: 'modes.en.feature.posDetail',
  },
  {
    id: 'exam',
    group: 'rule',
    requires: 'local',
    elements: [LEVEL_ELEMENT],
    labelKey: 'modes.en.feature.exam',
    detailKey: 'modes.en.feature.examDetail',
  },
  {
    id: 'chunk',
    group: 'rule',
    requires: 'local',
    elements: [...CHUNK_ELEMENTS],
    labelKey: 'modes.en.feature.chunk',
    detailKey: 'modes.en.feature.chunkDetail',
  },
  {
    id: 'expression',
    group: 'rule',
    requires: 'local',
    elements: [EXPRESSION_ELEMENT],
    labelKey: 'modes.en.feature.expression',
    detailKey: 'modes.en.feature.expressionDetail',
  },
  {
    id: 'syntax',
    group: 'remote',
    requires: 'remote',
    elements: [...EN_ROLE_ELEMENTS, ...EN_CLAUSE_ELEMENTS],
    labelKey: 'modes.en.feature.syntax',
    detailKey: 'modes.en.feature.syntaxDetail',
  },
];

/** Merge precedence, low to high. */
export const FEATURE_ORDER: string[] = ['pos', 'exam', 'chunk', 'expression', 'syntax'];

const ROLE_COLORS: Record<string, string> = {
  topic: '#C084FC',
  subject: '#60A5FA',
  object: '#FACC15',
  predicate: '#FB923C',
  modifier: '#4ADE80',
  attributive: '#4ADE80',
  adverbial: '#22D3EE',
  complement: '#F472B6',
};

/** Clauses underline only, so they never override the role colour underneath. */
const CLAUSE_COLORS: Record<string, string> = {
  'syntax.clause:attributive': '#A78BFA',
  'syntax.clause:nominal': '#FB7185',
  'syntax.clause:adverbial': '#34D399',
};

const CHUNK_BACKGROUND = '#38BDF84D';

const chunkUnderline = (offsetPx: number) => ({
  enabled: true,
  style: 'solid' as const,
  color: '#7DD3FC',
  thicknessPx: 2,
  offsetPx,
});

/** Built-in element palette. User edits are stored as overrides on top of this. */
const DEFAULT_ELEMENTS: Record<string, ElementStyle> = (() => {
  const posColors = defaultPosColors();
  const elements: Record<string, ElementStyle> = {};
  for (const group of POS_GROUPS) elements[POS_ELEMENT[group]] = { color: posColors[group] };
  for (const id of EN_ROLE_ELEMENTS) {
    const role = id.split(':')[1];
    elements[id] = {
      color: ROLE_COLORS[role] ?? '#FFFFFF',
      underline: { enabled: true, style: 'solid', thicknessPx: 2, offsetPx: 3 },
    };
  }
  for (const id of EN_CLAUSE_ELEMENTS) {
    elements[id] = {
      underline: {
        enabled: true,
        style: 'dashed',
        color: CLAUSE_COLORS[id],
        thicknessPx: 2,
        offsetPx: 4,
      },
    };
  }
  elements['chunk.phrase:first'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'start',
    underline: chunkUnderline(4),
  };
  elements['chunk.phrase:middle'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 0,
    underline: chunkUnderline(4),
  };
  elements['chunk.phrase:last'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'end',
    underline: chunkUnderline(4),
  };
  elements['chunk.phrase:only'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'all',
    underline: chunkUnderline(4),
  };
  elements[EXPRESSION_ELEMENT] = { backgroundColor: '#F472B640', radiusPx: 4 };
  elements[LEVEL_ELEMENT] = {
    backgroundColor: '#FBBF2433',
    radiusPx: 3,
    underline: { enabled: true, style: 'solid', color: '#FBBF24', thicknessPx: 2, offsetPx: 3 },
  };
  return elements;
})();

export const BUILT_INS: FeatureRegistry['builtIns'] = [
  { id: 'plain', features: [], labelKey: 'modes.en.mode.plain', detailKey: 'modes.en.modeDetail.plain' },
  {
    id: 'pos-basic',
    features: ['pos'],
    labelKey: 'modes.en.mode.pos-basic',
    detailKey: 'modes.en.modeDetail.pos-basic',
  },
  {
    id: 'phrase-focus',
    features: ['expression'],
    labelKey: 'modes.en.mode.phrase-focus',
    detailKey: 'modes.en.modeDetail.phrase-focus',
  },
  {
    id: 'chunk-focus',
    features: ['chunk'],
    labelKey: 'modes.en.mode.chunk-focus',
    detailKey: 'modes.en.modeDetail.chunk-focus',
  },
  {
    id: 'syntax-focus',
    features: ['syntax'],
    labelKey: 'modes.en.mode.syntax-focus',
    detailKey: 'modes.en.modeDetail.syntax-focus',
  },
];

export const enFeatures: FeatureRegistry = {
  features: STUDY_FEATURES,
  order: FEATURE_ORDER,
  elementDefaults: DEFAULT_ELEMENTS,
  expressionElement: EXPRESSION_ELEMENT,
  levelElement: LEVEL_ELEMENT,
  chunkGroupKey: CHUNK_GROUP_KEY,
  builtIns: BUILT_INS,
  defaultPresetId: 'pos-basic',
};
