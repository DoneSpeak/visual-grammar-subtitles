import { defaultPosColors, POS_GROUPS } from '@/shared/posColors';
import type { ElementStyle } from '@/shared/elementStyle';
import {
  chunkElements,
  EN_CLAUSE_ELEMENTS,
  EN_MORPH_ELEMENTS,
  EN_ROLE_ELEMENTS,
  EN_STRUCTURE_ELEMENTS,
  POS_ELEMENT,
  type FeatureRegistry,
  type StudyFeature,
} from '@/shared/studyFeatures';

/**
 * English feature registry.
 *
 * The modes follow `specs/261031-english-subtitle-six-learning-modes.md`: semantic chunking,
 * sentence roles, clause hierarchy, phrase structure, morphology, and collocations. Part of
 * speech stays as an extra mode because it is the token-level baseline every other layer builds
 * on. Layer ids match the analysis contract so remote annotations land in the local element
 * palette without a translation table.
 */

/** Layer a semantic chunk annotation lands in; also the key of `Token.groups`. */
export const CHUNK_GROUP_KEY = 'chunk.semantic';

export const LEVEL_ELEMENT = 'exam.tags:all';
export const EXPRESSION_ELEMENT = 'expression.collocation:all';

export const CHUNK_ELEMENTS: string[] = chunkElements(CHUNK_GROUP_KEY);

export const STUDY_FEATURES: StudyFeature[] = [
  {
    id: 'pos',
    group: 'token',
    sources: ['local'],
    elements: POS_GROUPS.map((group) => POS_ELEMENT[group]),
    labelKey: 'modes.en.feature.pos',
    detailKey: 'modes.en.feature.posDetail',
  },
  {
    id: 'exam',
    group: 'rule',
    sources: ['local'],
    elements: [LEVEL_ELEMENT],
    labelKey: 'modes.en.feature.exam',
    detailKey: 'modes.en.feature.examDetail',
  },
  {
    id: 'chunk',
    group: 'rule',
    sources: ['local'],
    elements: [...CHUNK_ELEMENTS],
    labelKey: 'modes.en.feature.chunk',
    detailKey: 'modes.en.feature.chunkDetail',
  },
  {
    id: 'expression',
    group: 'rule',
    sources: ['local'],
    elements: [EXPRESSION_ELEMENT],
    labelKey: 'modes.en.feature.expression',
    detailKey: 'modes.en.feature.expressionDetail',
  },
  {
    id: 'structure',
    group: 'remote',
    sources: ['local', 'remote'],
    elements: [...EN_STRUCTURE_ELEMENTS],
    labelKey: 'modes.en.feature.structure',
    detailKey: 'modes.en.feature.structureDetail',
  },
  {
    id: 'morph',
    group: 'remote',
    sources: ['local', 'remote'],
    elements: [...EN_MORPH_ELEMENTS],
    labelKey: 'modes.en.feature.morph',
    detailKey: 'modes.en.feature.morphDetail',
  },
  {
    id: 'clause',
    group: 'remote',
    sources: ['local', 'remote'],
    elements: [...EN_CLAUSE_ELEMENTS],
    labelKey: 'modes.en.feature.clause',
    detailKey: 'modes.en.feature.clauseDetail',
  },
  {
    id: 'syntax',
    group: 'remote',
    sources: ['local', 'remote'],
    elements: [...EN_ROLE_ELEMENTS],
    labelKey: 'modes.en.feature.syntax',
    detailKey: 'modes.en.feature.syntaxDetail',
  },
];

/**
 * Merge precedence, low to high. Clause ranks above roles because its elements only set the
 * underline: the role keeps the colour, the clause wins the underline it exists to draw.
 */
export const FEATURE_ORDER: string[] = [
  'pos',
  'exam',
  'chunk',
  'expression',
  'structure',
  'morph',
  'syntax',
  'clause',
];

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

/** Phrase structure is a nesting view: colour marks the phrase type, the tooltip carries nesting. */
const STRUCTURE_COLORS: Record<string, string> = {
  'phrase.structure:NP': '#A78BFA',
  'phrase.structure:VP': '#FB923C',
  'phrase.structure:PP': '#34D399',
};

/** Morphology colours the form, not the token's part of speech. */
const MORPH_COLORS: Record<string, string> = {
  'morph.form:contraction': '#F472B6',
  'morph.form:modal': '#C084FC',
  'morph.form:negation': '#F87171',
  'morph.form:auxiliary': '#60A5FA',
  'morph.form:verbForm': '#22D3EE',
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
  for (const id of EN_STRUCTURE_ELEMENTS) {
    elements[id] = {
      color: STRUCTURE_COLORS[id] ?? '#FFFFFF',
      underline: { enabled: true, style: 'dotted', thicknessPx: 2, offsetPx: 3 },
    };
  }
  for (const id of EN_MORPH_ELEMENTS) {
    elements[id] = { color: MORPH_COLORS[id] ?? '#FFFFFF' };
  }
  elements[`${CHUNK_GROUP_KEY}:first`] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'start',
    underline: chunkUnderline(4),
  };
  elements[`${CHUNK_GROUP_KEY}:middle`] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 0,
    underline: chunkUnderline(4),
  };
  elements[`${CHUNK_GROUP_KEY}:last`] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'end',
    underline: chunkUnderline(4),
  };
  elements[`${CHUNK_GROUP_KEY}:only`] = {
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
  {
    id: 'clause-focus',
    features: ['clause'],
    labelKey: 'modes.en.mode.clause-focus',
    detailKey: 'modes.en.modeDetail.clause-focus',
  },
  {
    id: 'structure-focus',
    features: ['structure'],
    labelKey: 'modes.en.mode.structure-focus',
    detailKey: 'modes.en.modeDetail.structure-focus',
  },
  {
    id: 'morph-focus',
    features: ['morph'],
    labelKey: 'modes.en.mode.morph-focus',
    detailKey: 'modes.en.modeDetail.morph-focus',
  },
  {
    id: 'collocation-focus',
    features: ['expression'],
    labelKey: 'modes.en.mode.collocation-focus',
    detailKey: 'modes.en.modeDetail.collocation-focus',
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
  // The spec's default view is semantic chunking: understand the line before parsing it.
  defaultPresetId: 'chunk-focus',
};
