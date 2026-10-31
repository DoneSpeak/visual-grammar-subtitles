import type { ElementStyle } from './elementStyle';
import type { MessageKey } from './i18n';
import type { PosGroup } from './types';

/**
 * Feature points: the composable units study modes are built from.
 *
 * A preset is a list of feature ids. Each feature owns a small set of elements and one source of
 * truth for them, so the options page can group them by where the data comes from and tell the
 * user which ones need the remote grammar service.
 *
 * The feature list itself is per language: `FeatureRegistry` carries one language's features,
 * merge order, element defaults and built-in preset seeds. The helpers below are the neutral
 * rules (dependencies, exclusivity, precedence) that every registry shares.
 */

export type FeatureId = string;

export type FeatureGroupId = 'token' | 'rule' | 'remote';

/**
 * Where a feature's data can come from. A feature may be produced by client rules, by the remote
 * grammar service, or by both; the options page shows the combination as a badge.
 */
export type FeatureSource = 'local' | 'remote';

/** Stable display order, local first. */
export const FEATURE_SOURCES: FeatureSource[] = ['local', 'remote'];

export type StudyFeature = {
  id: FeatureId;
  group: FeatureGroupId;
  sources: FeatureSource[];
  /** Enabling this feature implies the dependency; disabling the dependency disables it. */
  dependsOn?: FeatureId;
  /** Both features draw the same elements, so only one may be on. */
  conflictsWith?: FeatureId[];
  elements: string[];
  /** Language-specific label; falls back to the options page's id→key map when absent. */
  labelKey?: MessageKey;
  detailKey?: MessageKey;
};

/** A built-in mode a language starts with; labels go through i18n. */
export type BuiltInPresetSeed = {
  id: string;
  features: FeatureId[];
  labelKey: MessageKey;
  detailKey: MessageKey;
};

export type FeatureRegistry = {
  features: StudyFeature[];
  /** Merge precedence, low to high. */
  order: FeatureId[];
  elementDefaults: Record<string, ElementStyle>;
  /** Element a local expression annotator tags; `grammar` carries this id. Null if unsupported. */
  expressionElement: string | null;
  /** Element a study-band annotator tags. Null if the language has no bands. */
  levelElement: string | null;
  /** `Token.groups` key the chunk annotator writes; null when the language has no chunks. */
  chunkGroupKey: string | null;
  builtIns: BuiltInPresetSeed[];
  defaultPresetId: string;
};

/** Syntax-role vocabulary, shared by every language's grammar provider. */
export const ROLE_ELEMENTS: string[] = [
  'syntax.role:topic',
  'syntax.role:subject',
  'syntax.role:object',
  'syntax.role:predicate',
  'syntax.role:modifier',
  'syntax.role:adverbial',
];

/**
 * English sentence-role vocabulary: 主谓宾定状补.
 *
 * Separate from `ROLE_ELEMENTS` because English marks 定语 (`attributive`) and 补语
 * (`complement`) as first-class roles, while Japanese uses `modifier` and has no complement.
 */
export const EN_ROLE_ELEMENTS: string[] = [
  'syntax.role:subject',
  'syntax.role:predicate',
  'syntax.role:object',
  'syntax.role:attributive',
  'syntax.role:adverbial',
  'syntax.role:complement',
];

/** English clause types, layered on top of the roles rather than replacing them. */
export const EN_CLAUSE_ELEMENTS: string[] = [
  'syntax.clause:attributive',
  'syntax.clause:nominal',
  'syntax.clause:adverbial',
];

/** English phrase structure (mode 4): nested NP/VP/PP spans from the grammar service. */
export const EN_STRUCTURE_ELEMENTS: string[] = [
  'phrase.structure:NP',
  'phrase.structure:VP',
  'phrase.structure:PP',
];

/** English word-form layer (mode 5): contractions, modals, negation, auxiliaries, verb forms. */
export const EN_MORPH_ELEMENTS: string[] = [
  'morph.form:contraction',
  'morph.form:modal',
  'morph.form:negation',
  'morph.form:auxiliary',
  'morph.form:verbForm',
];

/**
 * Thai learning layers.
 *
 * The wire format is the same `layer:label` vocabulary every language writes into `Token.grammar`;
 * Thai simply declares layers the other packs do not use. The renderer matches an element against
 * the labels a token carries, so a Thai-only layer needs no renderer branch.
 */

/** Mode 1: word boundaries. Every word token carries this label; no analyzer is involved. */
export const SEGMENTATION_ELEMENT = 'token.segment:word';

/** Mode 3: the conditional frame and the clauses it governs. */
export const TH_CLAUSE_ELEMENTS: string[] = [
  'syntax.clause:condition',
  'syntax.clause:result',
  'syntax.clause:continuation',
];

/**
 * Mode 4: function words that carry tense/aspect, sequence, condition and emphasis.
 * `progressive` is deliberately one element: กำลัง and อยู่ bind the two ends of one frame.
 */
export const TH_ASPECT_ELEMENTS: string[] = [
  'aspect.function:conditional',
  'aspect.function:connective',
  'aspect.function:sequence',
  'aspect.function:prospective',
  'aspect.function:emphasis',
  'aspect.function:progressive',
];

/** Mode 5: syllable spans and the five tones the analyzer can establish confidently. */
export const TH_PRONUNCIATION_ELEMENTS: string[] = [
  'pronunciation.syllable:syllable',
  'pronunciation.tone:mid',
  'pronunciation.tone:low',
  'pronunciation.tone:falling',
  'pronunciation.tone:high',
  'pronunciation.tone:rising',
];

/** Mode 6: fixed spoken patterns. Labels under this layer all render through one element. */
export const TH_EXPRESSION_ELEMENT = 'expression.pattern:all';

/** The eight colour groups are universal, so their element ids are shared. */
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

export const READING_ELEMENT = 'token.reading:ruby';

export const FEATURE_GROUP_ORDER: FeatureGroupId[] = ['token', 'rule', 'remote'];

/** Position elements of a chunk group, derived from its `Token.groups` key. */
export const chunkElements = (groupKey: string): string[] =>
  ['first', 'middle', 'last', 'only'].map((position) => `${groupKey}:${position}`);

export const featureById = (registry: FeatureRegistry, id: FeatureId): StudyFeature | undefined =>
  registry.features.find((feature) => feature.id === id);

export const isFeatureId = (registry: FeatureRegistry, value: unknown): value is FeatureId =>
  typeof value === 'string' && registry.features.some((feature) => feature.id === value);

export const featureRank = (registry: FeatureRegistry, id: FeatureId): number => registry.order.indexOf(id);

/** The feature that owns an element id, for grouping the palette and reporting overrides. */
export const featureOfElement = (registry: FeatureRegistry, elementId: string): FeatureId | undefined =>
  registry.features.find((feature) => feature.elements.includes(elementId))?.id;

/** Defaults for every element the given features bring in. */
export const defaultElementsFor = (
  registry: FeatureRegistry,
  features: FeatureId[],
): Record<string, ElementStyle> => {
  const elements: Record<string, ElementStyle> = {};
  for (const id of features) {
    const feature = featureById(registry, id);
    for (const element of feature?.elements ?? []) {
      elements[element] = registry.elementDefaults[element] ?? {};
    }
  }
  return elements;
};

export const elementsForFeatures = (registry: FeatureRegistry, features: FeatureId[]): string[] =>
  features.flatMap((id) => featureById(registry, id)?.elements ?? []);

export const featureHasSource = (
  feature: StudyFeature | undefined,
  source: FeatureSource,
): boolean => !!feature?.sources.includes(source);

/** Features the client can produce, including the ones the service can also produce. */
export const localFeatures = (registry: FeatureRegistry, features: FeatureId[]): FeatureId[] =>
  features.filter((id) => featureHasSource(featureById(registry, id), 'local'));

/** Features only the client can produce; safe to run on top of a remote document. */
export const localExclusiveFeatures = (
  registry: FeatureRegistry,
  features: FeatureId[],
): FeatureId[] =>
  features.filter((id) => {
    const feature = featureById(registry, id);
    return feature?.sources.length === 1 && feature.sources[0] === 'local';
  });

/** Features only the service can produce; these are dropped when it is unavailable. */
export const remoteOnlyFeatures = (
  registry: FeatureRegistry,
  features: FeatureId[],
): FeatureId[] =>
  features.filter((id) => {
    const feature = featureById(registry, id);
    return feature?.sources.length === 1 && feature.sources[0] === 'remote';
  });

export const featuresUseRemote = (registry: FeatureRegistry, features: FeatureId[]): boolean =>
  features.some((id) => featureHasSource(featureById(registry, id), 'remote'));

/** Deduplicated sources behind a feature list, in display order. */
export const sourcesForFeatures = (
  registry: FeatureRegistry,
  features: FeatureId[],
): FeatureSource[] => {
  const present = new Set<FeatureSource>();
  for (const id of features) {
    for (const source of featureById(registry, id)?.sources ?? []) present.add(source);
  }
  return FEATURE_SOURCES.filter((source) => present.has(source));
};

/**
 * Applies the registry's dependency and exclusivity rules to a requested feature set.
 * Returns the features that are actually in effect.
 */
export const resolveFeatures = (registry: FeatureRegistry, requested: FeatureId[]): FeatureId[] => {
  const enabled = new Set(requested.filter((id) => isFeatureId(registry, id)));
  for (const feature of registry.features) {
    if (feature.dependsOn && !enabled.has(feature.dependsOn)) enabled.delete(feature.id);
  }
  for (const feature of registry.features) {
    if (!enabled.has(feature.id)) continue;
    for (const rival of feature.conflictsWith ?? []) enabled.delete(rival);
  }
  return registry.order.filter((feature) => enabled.has(feature));
};

export const isFeatureEnabled = (
  registry: FeatureRegistry,
  features: FeatureId[],
  id: FeatureId,
): boolean => resolveFeatures(registry, features).includes(id);

/**
 * A user toggle: turning a feature on displaces its rival and pulls in its dependency, so a click
 * always lands. Turning one off drops whatever depended on it.
 */
export const toggleFeatureIn = (
  registry: FeatureRegistry,
  features: FeatureId[],
  id: FeatureId,
): FeatureId[] => {
  const resolved = resolveFeatures(registry, features);
  if (resolved.includes(id)) return resolveFeatures(registry, resolved.filter((feature) => feature !== id));
  const feature = featureById(registry, id);
  if (!feature) return resolved;
  const next = resolved.filter((other) => !(feature.conflictsWith ?? []).includes(other));
  if (feature.dependsOn) next.push(feature.dependsOn);
  next.push(id);
  return resolveFeatures(registry, next);
};
