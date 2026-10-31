import type { ElementStyle, StudyPreset } from '@/shared/subtitleStyle';
import {
  featureOfElement,
  featureRank,
  POS_ELEMENT,
  type FeatureId,
  type FeatureRegistry,
} from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';
import { isInflected, posGroupOf } from './colors';

export type MatchedElement = { feature: FeatureId; element: string };

const grammarLabel = (token: Token, prefix: string): string | undefined =>
  token.grammar?.find((label) => label.startsWith(prefix));

/**
 * Position within the chunk holds the style: the outer tokens round only their outer corners,
 * so a chunk paints as one continuous block without any spacing that would break line layout.
 */
export const chunkElementAt = (
  tokens: Token[],
  index: number,
  groupKey: string,
): string | undefined => {
  const group = tokens[index]?.groups?.[groupKey];
  if (!group) return undefined;
  let start = index;
  let end = index;
  while (start > 0 && tokens[start - 1].groups?.[groupKey] === group) start--;
  while (end < tokens.length - 1 && tokens[end + 1].groups?.[groupKey] === group) end++;
  const size = end - start + 1;
  if (size === 1) return `${groupKey}:only`;
  if (index === start) return `${groupKey}:first`;
  return index === end ? `${groupKey}:last` : `${groupKey}:middle`;
};

/** The enabled feature that owns this language's chunk positions, if any. */
const chunkFeatureOf = (
  registry: FeatureRegistry,
  groupKey: string,
  features: FeatureId[],
): FeatureId | undefined => {
  const probe = `${groupKey}:first`;
  const owners = registry.features.filter((feature) => feature.elements.includes(probe));
  // Two chunk features conflict, so at most one is enabled; take the highest-ranked one anyway.
  return owners
    .filter((feature) => features.includes(feature.id))
    .sort((a, b) => featureRank(registry, b.id) - featureRank(registry, a.id))[0]?.id;
};

/** Every element this token belongs to. Elements are not mutually exclusive. */
export const tokenElements = (
  registry: FeatureRegistry,
  tokens: Token[],
  index: number,
  features: FeatureId[],
): MatchedElement[] => {
  const token = tokens[index];
  if (!token) return [];
  const matched: MatchedElement[] = [];
  if (features.includes('pos')) matched.push({ feature: 'pos', element: POS_ELEMENT[posGroupOf(token)] });
  const role = grammarLabel(token, 'syntax.role:');
  if (features.includes('syntax') && role) matched.push({ feature: 'syntax', element: role });
  // Expression and band layers are language-owned: the registry names the element, and the
  // feature that draws it is whatever declares that element.
  for (const element of [registry.expressionElement, registry.levelElement]) {
    if (!element) continue;
    const feature = featureOfElement(registry, element);
    if (feature && features.includes(feature) && token.grammar?.includes(element)) {
      matched.push({ feature, element });
    }
  }
  if (registry.chunkGroupKey) {
    const chunkFeature = chunkFeatureOf(registry, registry.chunkGroupKey, features);
    if (chunkFeature) {
      const element = chunkElementAt(tokens, index, registry.chunkGroupKey);
      if (element) matched.push({ feature: chunkFeature, element });
    }
  }
  return matched;
};

const MERGE_PROPERTIES = [
  'color',
  'backgroundColor',
  'underline',
  'fontScale',
  'opacity',
  'radiusPx',
  'radiusSides',
  'textColorMode',
] as const;

/** Elements are on unless switched off; an off element contributes no property at all. */
export const elementEnabled = (
  elements: Record<string, ElementStyle>,
  id: string,
): boolean => elements[id]?.enabled !== false;

/**
 * One winner per property (spec §9.3). A fragment matching several features takes the value from
 * the highest-ranked feature that sets that property explicitly; values never multiply or stack.
 */
export const resolveElementStyle = (
  registry: FeatureRegistry,
  matched: MatchedElement[],
  elements: Record<string, ElementStyle>,
): ElementStyle => {
  const ordered = matched
    .filter((match) => elementEnabled(elements, match.element))
    .sort((a, b) => featureRank(registry, a.feature) - featureRank(registry, b.feature));
  const style: ElementStyle = {};
  for (const property of MERGE_PROPERTIES) {
    for (const match of ordered) {
      const value = elements[match.element]?.[property];
      if (value !== undefined) {
        (style as Record<string, unknown>)[property] = value;
      }
    }
  }
  // Underline-only means the underline carries the mark; the text keeps the base colour.
  if (style.textColorMode === 'underline-only') delete style.color;
  return style;
};

/** Sorts a token's matches by precedence, high to low — used by the options conflict hints. */
export const matchedByPriority = (
  registry: FeatureRegistry,
  matched: MatchedElement[],
): MatchedElement[] =>
  [...matched].sort((a, b) => featureRank(registry, b.feature) - featureRank(registry, a.feature));

/**
 * Resolved style for one token. Tokens outside the preset's focus element are dimmed, the
 * inflected-verb hint stays as a fallback when nothing else sets opacity or underline.
 */
export const tokenStyle = (
  registry: FeatureRegistry,
  tokens: Token[],
  index: number,
  preset: StudyPreset,
  elements: Record<string, ElementStyle>,
): ElementStyle | undefined => {
  const token = tokens[index];
  if (!token) return undefined;
  const matched = tokenElements(registry, tokens, index, preset.features);
  const style = resolveElementStyle(registry, matched, elements);
  const focus = preset.base.focusElement;
  // Focusing an element that is switched off must not dim the whole line.
  if (focus && elementEnabled(elements, focus) && !matched.some((match) => match.element === focus)) {
    style.opacity = style.opacity ?? preset.base.dimOpacity;
  }
  if (
    preset.features.includes('pos') &&
    elementEnabled(elements, POS_ELEMENT.verb) &&
    posGroupOf(token) === 'verb' &&
    isInflected(token) &&
    style.opacity === undefined &&
    style.underline === undefined
  ) {
    style.opacity = 0.78;
    style.underline = { enabled: true, style: 'solid' };
  }
  return Object.keys(style).length ? style : undefined;
};
