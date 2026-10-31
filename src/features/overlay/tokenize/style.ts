import type { ElementStyle, StudyPreset } from '@/shared/subtitleStyle';
import {
  EXPRESSION_ELEMENT,
  featureRank,
  LEVEL_ELEMENT,
  POS_ELEMENT,
  type FeatureId,
} from '@/shared/studyFeatures';
import type { Token } from '@/shared/types';
import { isInflected, posGroupOf } from './colors';

/** Layer a token's bunsetsu annotation lands in; also the key of `Token.groups`. */
export const CHUNK_GROUP_KEY = 'chunk.bunsetsu';

export type MatchedElement = { feature: FeatureId; element: string };

const grammarLabel = (token: Token, prefix: string): string | undefined =>
  token.grammar?.find((label) => label.startsWith(prefix));

/**
 * Position within the bunsetsu holds the style: the outer tokens round only their outer corners,
 * so a chunk paints as one continuous block without any spacing that would break line layout.
 */
export const chunkElementAt = (tokens: Token[], index: number): string | undefined => {
  const group = tokens[index]?.groups?.[CHUNK_GROUP_KEY];
  if (!group) return undefined;
  let start = index;
  let end = index;
  while (start > 0 && tokens[start - 1].groups?.[CHUNK_GROUP_KEY] === group) start--;
  while (end < tokens.length - 1 && tokens[end + 1].groups?.[CHUNK_GROUP_KEY] === group) end++;
  const size = end - start + 1;
  if (size === 1) return 'chunk.bunsetsu:only';
  if (index === start) return 'chunk.bunsetsu:first';
  return index === end ? 'chunk.bunsetsu:last' : 'chunk.bunsetsu:middle';
};

/** Every element this token belongs to. Elements are not mutually exclusive. */
export const tokenElements = (
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
  if (features.includes('expression') && token.grammar?.includes(EXPRESSION_ELEMENT)) {
    matched.push({ feature: 'expression', element: EXPRESSION_ELEMENT });
  }
  if (features.includes('level') && token.grammar?.includes(LEVEL_ELEMENT)) {
    matched.push({ feature: 'level', element: LEVEL_ELEMENT });
  }
  const chunkFeature = features.includes('chunk')
    ? 'chunk'
    : features.includes('chunk-rule')
      ? 'chunk-rule'
      : undefined;
  if (chunkFeature) {
    const element = chunkElementAt(tokens, index);
    if (element) matched.push({ feature: chunkFeature, element });
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
  matched: MatchedElement[],
  elements: Record<string, ElementStyle>,
): ElementStyle => {
  const ordered = matched
    .filter((match) => elementEnabled(elements, match.element))
    .sort((a, b) => featureRank(a.feature) - featureRank(b.feature));
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
export const matchedByPriority = (matched: MatchedElement[]): MatchedElement[] =>
  [...matched].sort((a, b) => featureRank(b.feature) - featureRank(a.feature));

/**
 * Resolved style for one token. Tokens outside the preset's focus element are dimmed, the
 * inflected-verb hint stays as a fallback when nothing else sets opacity or underline.
 */
export const tokenStyle = (
  tokens: Token[],
  index: number,
  preset: StudyPreset,
  elements: Record<string, ElementStyle>,
): ElementStyle | undefined => {
  const token = tokens[index];
  if (!token) return undefined;
  const matched = tokenElements(tokens, index, preset.features);
  const style = resolveElementStyle(matched, elements);
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
