import { defaultPosColors, POS_GROUPS } from '@/shared/posColors';
import type { ElementStyle } from '@/shared/elementStyle';
import {
  chunkElements,
  POS_ELEMENT,
  READING_ELEMENT,
  ROLE_ELEMENTS,
  type FeatureRegistry,
  type StudyFeature,
} from '@/shared/studyFeatures';

/**
 * Japanese feature registry: which study layers this language can produce, their merge
 * precedence, the element palette they draw from, and the built-in modes it ships with.
 *
 * The ids are Japanese-shaped on purpose: `chunk-rule` means bunsetsu grouping, `level` means
 * JLPT bands. Another language declares its own features against the same engine.
 */

/** Layer a bunsetsu annotation lands in; also the key of `Token.groups`. */
export const CHUNK_GROUP_KEY = 'chunk.bunsetsu';

export const LEVEL_ELEMENT = 'token.level:plan';
export const EXPRESSION_ELEMENT = 'expression.grammar:all';

/** Position within its bunsetsu, so a chunk renders as one block with rounded outer edges. */
export const CHUNK_ELEMENTS: string[] = chunkElements(CHUNK_GROUP_KEY);

export const STUDY_FEATURES: StudyFeature[] = [
  { id: 'pos', group: 'token', sources: ['local'], elements: POS_GROUPS.map((group) => POS_ELEMENT[group]) },
  { id: 'nouns', group: 'token', sources: ['local'], dependsOn: 'pos', elements: [] },
  { id: 'reading', group: 'token', sources: ['local'], elements: [READING_ELEMENT] },
  { id: 'expression', group: 'rule', sources: ['local'], elements: [EXPRESSION_ELEMENT] },
  { id: 'level', group: 'rule', sources: ['local'], elements: [LEVEL_ELEMENT] },
  {
    id: 'chunk-rule',
    group: 'rule',
    sources: ['local'],
    conflictsWith: ['chunk'],
    elements: [...CHUNK_ELEMENTS],
  },
  { id: 'syntax', group: 'remote', sources: ['remote'], elements: ROLE_ELEMENTS },
  {
    id: 'chunk',
    group: 'remote',
    sources: ['remote'],
    conflictsWith: ['chunk-rule'],
    elements: [...CHUNK_ELEMENTS],
  },
];

/**
 * Merge precedence, low to high, per visual property.
 *
 * A fragment can match several features at once (`勉強` is a noun, a predicate and part of an
 * expression). Every property takes the value from the highest entry that sets it explicitly;
 * nothing is multiplied or stacked.
 */
export const FEATURE_ORDER: string[] = [
  'pos',
  'nouns',
  'reading',
  'chunk-rule',
  'chunk',
  'level',
  'expression',
  'syntax',
];

const ROLE_COLORS: Record<string, string> = {
  topic: '#C084FC',
  subject: '#60A5FA',
  object: '#FACC15',
  predicate: '#FB923C',
  modifier: '#4ADE80',
  adverbial: '#22D3EE',
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
  for (const id of ROLE_ELEMENTS) {
    const role = id.split(':')[1];
    elements[id] = {
      color: ROLE_COLORS[role] ?? '#FFFFFF',
      underline: { enabled: true, style: 'solid', thicknessPx: 2, offsetPx: 3 },
    };
  }
  elements['chunk.bunsetsu:first'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'start',
    underline: chunkUnderline(4),
  };
  elements['chunk.bunsetsu:middle'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 0,
    underline: chunkUnderline(4),
  };
  elements['chunk.bunsetsu:last'] = {
    backgroundColor: CHUNK_BACKGROUND,
    radiusPx: 6,
    radiusSides: 'end',
    underline: chunkUnderline(4),
  };
  elements['chunk.bunsetsu:only'] = {
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
  elements[READING_ELEMENT] = { color: '#FFFFFFB8' };
  return elements;
})();

/**
 * `chunk-focus` uses the local rule-based grouping: it works with no grammar service, and the
 * remote GiNZA bunsetsu stays available as a separate feature.
 */
export const BUILT_INS: FeatureRegistry['builtIns'] = [
  { id: 'plain', features: [], labelKey: 'modes.mode.plain', detailKey: 'modes.modeDetail.plain' },
  { id: 'pos-basic', features: ['pos'], labelKey: 'modes.mode.pos-basic', detailKey: 'modes.modeDetail.pos-basic' },
  {
    id: 'syntax-focus',
    features: ['syntax'],
    labelKey: 'modes.mode.syntax-focus',
    detailKey: 'modes.modeDetail.syntax-focus',
  },
  {
    id: 'chunk-focus',
    features: ['chunk-rule'],
    labelKey: 'modes.mode.chunk-focus',
    detailKey: 'modes.modeDetail.chunk-focus',
  },
  {
    id: 'expression-focus',
    features: ['expression'],
    labelKey: 'modes.mode.expression-focus',
    detailKey: 'modes.modeDetail.expression-focus',
  },
  {
    id: 'reading-assist',
    features: ['reading'],
    labelKey: 'modes.mode.reading-assist',
    detailKey: 'modes.modeDetail.reading-assist',
  },
];

export const jaFeatures: FeatureRegistry = {
  features: STUDY_FEATURES,
  order: FEATURE_ORDER,
  elementDefaults: DEFAULT_ELEMENTS,
  expressionElement: EXPRESSION_ELEMENT,
  levelElement: LEVEL_ELEMENT,
  chunkGroupKey: CHUNK_GROUP_KEY,
  builtIns: BUILT_INS,
  defaultPresetId: 'pos-basic',
};
