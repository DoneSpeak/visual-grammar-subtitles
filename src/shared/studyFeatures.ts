import { defaultPosColors, POS_GROUPS } from './posColors';
import type { ElementStyle } from './elementStyle';
import type { PosGroup } from './types';

/**
 * Feature points: the composable units study modes are built from.
 *
 * A preset is a list of feature ids. Each feature owns a small set of elements and one source of
 * truth for them, so the options page can group them by where the data comes from and tell the
 * user which ones need the remote grammar service.
 */

export type FeatureId =
  | 'pos'
  | 'nouns'
  | 'reading'
  | 'expression'
  | 'level'
  | 'chunk-rule'
  | 'syntax'
  | 'chunk';

export type FeatureGroupId = 'token' | 'rule' | 'remote';

export type StudyFeature = {
  id: FeatureId;
  group: FeatureGroupId;
  requires: 'local' | 'remote';
  /** Enabling this feature implies the dependency; disabling the dependency disables it. */
  dependsOn?: FeatureId;
  /** Both features draw the same elements, so only one may be on. */
  conflictsWith?: FeatureId[];
  elements: string[];
};

export const ROLE_ELEMENTS: string[] = [
  'syntax.role:topic',
  'syntax.role:subject',
  'syntax.role:object',
  'syntax.role:predicate',
  'syntax.role:modifier',
  'syntax.role:adverbial',
];

export const POS_ELEMENT: Record<PosGroup, string> = {
  noun: 'token.pos:NOUN',
  verb: 'token.pos:VERB',
  adj: 'token.pos:ADJ',
  adverb: 'token.pos:ADV',
  particle: 'token.pos:ADP',
  conjunction: 'token.pos:CCONJ',
  symbol: 'token.pos:PUNCT',
  other: 'token.pos:X',
};

/** Position within its bunsetsu, so a chunk renders as one block with rounded outer edges. */
export const CHUNK_ELEMENTS: string[] = [
  'chunk.bunsetsu:first',
  'chunk.bunsetsu:middle',
  'chunk.bunsetsu:last',
  'chunk.bunsetsu:only',
];

export const LEVEL_ELEMENT = 'token.level:plan';
export const EXPRESSION_ELEMENT = 'expression.grammar:all';
export const READING_ELEMENT = 'token.reading:ruby';

export const STUDY_FEATURES: StudyFeature[] = [
  { id: 'pos', group: 'token', requires: 'local', elements: POS_GROUPS.map((group) => POS_ELEMENT[group]) },
  { id: 'nouns', group: 'token', requires: 'local', dependsOn: 'pos', elements: [] },
  { id: 'reading', group: 'token', requires: 'local', elements: [READING_ELEMENT] },
  { id: 'expression', group: 'rule', requires: 'local', elements: [EXPRESSION_ELEMENT] },
  { id: 'level', group: 'rule', requires: 'local', elements: [LEVEL_ELEMENT] },
  {
    id: 'chunk-rule',
    group: 'rule',
    requires: 'local',
    conflictsWith: ['chunk'],
    elements: [...CHUNK_ELEMENTS],
  },
  { id: 'syntax', group: 'remote', requires: 'remote', elements: ROLE_ELEMENTS },
  {
    id: 'chunk',
    group: 'remote',
    requires: 'remote',
    conflictsWith: ['chunk-rule'],
    elements: [...CHUNK_ELEMENTS],
  },
];

export const FEATURE_BY_ID: Record<FeatureId, StudyFeature> = Object.fromEntries(
  STUDY_FEATURES.map((feature) => [feature.id, feature]),
) as Record<FeatureId, StudyFeature>;

export const FEATURE_GROUP_ORDER: FeatureGroupId[] = ['token', 'rule', 'remote'];

/**
 * Merge precedence, low to high, per visual property.
 *
 * A fragment can match several features at once (`勉強` is a noun, a predicate and part of an
 * expression). Every property takes the value from the highest entry that sets it explicitly;
 * nothing is multiplied or stacked.
 */
export const FEATURE_ORDER: FeatureId[] = [
  'pos',
  'nouns',
  'reading',
  'chunk-rule',
  'chunk',
  'level',
  'expression',
  'syntax',
];

export const featureRank = (id: FeatureId): number => FEATURE_ORDER.indexOf(id);

export const isFeatureId = (value: unknown): value is FeatureId =>
  typeof value === 'string' && value in FEATURE_BY_ID;

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
export const DEFAULT_FEATURE_ELEMENTS: Record<string, ElementStyle> = (() => {
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

/** Defaults for every element the given features bring in. */
export const defaultElementsFor = (features: FeatureId[]): Record<string, ElementStyle> => {
  const elements: Record<string, ElementStyle> = {};
  for (const feature of features) {
    for (const id of FEATURE_BY_ID[feature].elements) {
      elements[id] = DEFAULT_FEATURE_ELEMENTS[id] ?? {};
    }
  }
  return elements;
};

export const elementsForFeatures = (features: FeatureId[]): string[] =>
  features.flatMap((feature) => FEATURE_BY_ID[feature].elements);

/** The feature that owns an element id, for grouping the palette and reporting overrides. */
export const featureOfElement = (elementId: string): FeatureId | undefined =>
  STUDY_FEATURES.find((feature) => feature.elements.includes(elementId))?.id;

export const featuresRequireRemote = (features: FeatureId[]): boolean =>
  features.some((feature) => FEATURE_BY_ID[feature].requires === 'remote');

export const localFeatures = (features: FeatureId[]): FeatureId[] =>
  features.filter((feature) => FEATURE_BY_ID[feature].requires === 'local');

/**
 * Applies the registry's dependency and exclusivity rules to a requested feature set.
 * Returns the features that are actually in effect.
 */
export const resolveFeatures = (requested: FeatureId[]): FeatureId[] => {
  const enabled = new Set(requested.filter(isFeatureId));
  for (const feature of STUDY_FEATURES) {
    if (feature.dependsOn && !enabled.has(feature.dependsOn)) enabled.delete(feature.id);
  }
  for (const feature of STUDY_FEATURES) {
    if (!enabled.has(feature.id)) continue;
    for (const rival of feature.conflictsWith ?? []) enabled.delete(rival);
  }
  return FEATURE_ORDER.filter((feature) => enabled.has(feature));
};

export const isFeatureEnabled = (features: FeatureId[], id: FeatureId): boolean =>
  resolveFeatures(features).includes(id);

/**
 * A user toggle: turning a feature on displaces its rival and pulls in its dependency, so a click
 * always lands. Turning one off drops whatever depended on it.
 */
export const toggleFeatureIn = (features: FeatureId[], id: FeatureId): FeatureId[] => {
  if (resolveFeatures(features).includes(id)) {
    return resolveFeatures(features.filter((feature) => feature !== id));
  }
  const feature = FEATURE_BY_ID[id];
  const next = features.filter(
    (other) => other !== id && !(feature.conflictsWith ?? []).includes(other),
  );
  if (feature.dependsOn) next.push(feature.dependsOn);
  next.push(id);
  return resolveFeatures(next);
};
