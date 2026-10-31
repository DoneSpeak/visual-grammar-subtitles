import type { ElementStyle } from '@/shared/elementStyle';
import { defaultPosColors, POS_GROUPS } from '@/shared/posColors';
import {
  chunkElements,
  POS_ELEMENT,
  READING_ELEMENT,
  ROLE_ELEMENTS,
  SEGMENTATION_ELEMENT,
  TH_ASPECT_ELEMENTS,
  TH_CLAUSE_ELEMENTS,
  TH_EXPRESSION_ELEMENT,
  TH_PRONUNCIATION_ELEMENTS,
  type FeatureRegistry,
  type StudyFeature,
} from '@/shared/studyFeatures';

/**
 * Thai feature registry.
 *
 * The six modes follow `specs/261031-thai-subtitle-six-learning-modes.md`:
 *
 * 1. word segmentation — the tokenizer's boundaries, marked lightly;
 * 2. semantic chunks — meaning units, local rules;
 * 3. syntax — conditional/result clauses and sentence roles, remote heuristic;
 * 4. aspect and function words — ถ้า/ก็/ก่อน/เดี๋ยว/เอง and the discontiguous กำลัง…อยู่ frame;
 * 5. pronunciation — syllable spans, tone marks and reading, remote;
 * 6. expressions — fixed spoken patterns, local rules.
 *
 * Part of speech stays as the token-level baseline. Unlike the English pack, nothing here assumes
 * SVO colouring: mode 1 and 2 are on by default because Thai has no written word spaces.
 */

/** Semantic-chunk group written by the local annotator and the Thai analyzer. */
export const CHUNK_GROUP_KEY = 'chunk.semantic';

export const STUDY_FEATURES: StudyFeature[] = [
  {
    id: 'pos',
    group: 'token',
    sources: ['local'],
    elements: POS_GROUPS.map((group) => POS_ELEMENT[group]),
    labelKey: 'modes.th.feature.pos',
    detailKey: 'modes.th.feature.posDetail',
  },
  {
    id: 'segmentation',
    group: 'rule',
    sources: ['local'],
    elements: [SEGMENTATION_ELEMENT],
    labelKey: 'modes.th.feature.segmentation',
    detailKey: 'modes.th.feature.segmentationDetail',
  },
  {
    id: 'chunk',
    group: 'rule',
    sources: ['local'],
    elements: chunkElements(CHUNK_GROUP_KEY),
    labelKey: 'modes.th.feature.chunk',
    detailKey: 'modes.th.feature.chunkDetail',
  },
  {
    id: 'aspect',
    group: 'rule',
    sources: ['local'],
    elements: [...TH_ASPECT_ELEMENTS],
    labelKey: 'modes.th.feature.aspect',
    detailKey: 'modes.th.feature.aspectDetail',
  },
  {
    id: 'expression',
    group: 'rule',
    sources: ['local'],
    elements: [TH_EXPRESSION_ELEMENT],
    labelKey: 'modes.th.feature.expression',
    detailKey: 'modes.th.feature.expressionDetail',
  },
  {
    id: 'syntax',
    group: 'remote',
    sources: ['remote'],
    elements: [...ROLE_ELEMENTS, ...TH_CLAUSE_ELEMENTS],
    labelKey: 'modes.th.feature.syntax',
    detailKey: 'modes.th.feature.syntaxDetail',
  },
  {
    id: 'reading',
    group: 'remote',
    sources: ['remote'],
    elements: [READING_ELEMENT, ...TH_PRONUNCIATION_ELEMENTS],
    labelKey: 'modes.th.feature.reading',
    detailKey: 'modes.th.feature.readingDetail',
  },
];

/**
 * Merge precedence, low to high. Aspect and expressions override the part of speech; syntax
 * roles override both; clauses only draw the underline, so they sit with the roles they annotate.
 */
export const FEATURE_ORDER: string[] = [
  'pos',
  'segmentation',
  'chunk',
  'aspect',
  'expression',
  'syntax',
  'reading',
];

const ROLE_COLORS: Record<string, string> = {
  'syntax.role:topic': '#C084FC',
  'syntax.role:subject': '#60A5FA',
  'syntax.role:object': '#FACC15',
  'syntax.role:predicate': '#FB923C',
  'syntax.role:modifier': '#4ADE80',
  'syntax.role:adverbial': '#22D3EE',
};

/** Clauses underline only, so they never replace the role colour underneath. */
const CLAUSE_COLORS: Record<string, string> = {
  'syntax.clause:condition': '#A78BFA',
  'syntax.clause:result': '#FB7185',
  'syntax.clause:continuation': '#34D399',
};

/** Function words carry a light background; the colour names the function, not the POS. */
const ASPECT_COLORS: Record<string, string> = {
  'aspect.function:conditional': '#A78BFA40',
  'aspect.function:connective': '#F472B640',
  'aspect.function:sequence': '#34D39940',
  'aspect.function:prospective': '#FBBF2440',
  'aspect.function:emphasis': '#FB923C40',
  'aspect.function:progressive': '#22D3EE40',
};

const TONE_COLORS: Record<string, string> = {
  'pronunciation.tone:mid': '#94A3B8',
  'pronunciation.tone:low': '#60A5FA',
  'pronunciation.tone:falling': '#F87171',
  'pronunciation.tone:high': '#FBBF24',
  'pronunciation.tone:rising': '#34D399',
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

  // Word boundaries are the baseline: a light dotted rule under every word, nothing more.
  elements[SEGMENTATION_ELEMENT] = {
    underline: { enabled: true, style: 'dotted', color: '#7DD3FC', thicknessPx: 1, offsetPx: 2 },
  };

  for (const id of ROLE_ELEMENTS) {
    const role = id.split(':')[1];
    elements[id] = {
      color: ROLE_COLORS[id] ?? '#FFFFFF',
      underline: { enabled: true, style: 'solid', thicknessPx: 2, offsetPx: 3 },
    };
  }
  for (const id of TH_CLAUSE_ELEMENTS) {
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
  for (const id of TH_ASPECT_ELEMENTS) {
    elements[id] = { backgroundColor: ASPECT_COLORS[id] ?? '#FFFFFF40', radiusPx: 4 };
  }
  elements[TH_EXPRESSION_ELEMENT] = { backgroundColor: '#F472B640', radiusPx: 4 };

  for (const position of ['first', 'middle', 'last', 'only'] as const) {
    elements[`${CHUNK_GROUP_KEY}:${position}`] = {
      backgroundColor: CHUNK_BACKGROUND,
      radiusPx: position === 'middle' ? 0 : 6,
      radiusSides:
        position === 'first' ? 'start' : position === 'last' ? 'end' : position === 'only' ? 'all' : undefined,
      underline: chunkUnderline(4),
    };
  }

  elements[READING_ELEMENT] = { color: '#FFFFFFB8' };
  elements['pronunciation.syllable:syllable'] = {
    underline: { enabled: true, style: 'dotted', color: '#93C5FD', thicknessPx: 1, offsetPx: 2 },
  };
  // Tone colours are off by default: playback only hints at syllable boundaries, and the user
  // turns tone marking on once the analyzer has supplied trustworthy tone labels.
  for (const id of TH_PRONUNCIATION_ELEMENTS) {
    if (id in TONE_COLORS) elements[id] = { enabled: false, color: TONE_COLORS[id] };
  }
  return elements;
})();

export const BUILT_INS: FeatureRegistry['builtIns'] = [
  { id: 'plain', features: [], labelKey: 'modes.mode.plain', detailKey: 'modes.modeDetail.plain' },
  {
    id: 'segmentation-focus',
    features: ['segmentation'],
    labelKey: 'modes.th.mode.segmentation',
    detailKey: 'modes.th.modeDetail.segmentation',
  },
  {
    id: 'chunk-focus',
    features: ['chunk'],
    labelKey: 'modes.th.mode.chunk',
    detailKey: 'modes.th.modeDetail.chunk',
  },
  {
    id: 'basic-focus',
    features: ['segmentation', 'chunk'],
    labelKey: 'modes.th.mode.basic',
    detailKey: 'modes.th.modeDetail.basic',
  },
  {
    id: 'syntax-focus',
    features: ['syntax'],
    labelKey: 'modes.th.mode.syntax',
    detailKey: 'modes.th.modeDetail.syntax',
  },
  {
    id: 'aspect-focus',
    features: ['aspect'],
    labelKey: 'modes.th.mode.aspect',
    detailKey: 'modes.th.modeDetail.aspect',
  },
  {
    id: 'pronunciation-focus',
    features: ['reading'],
    labelKey: 'modes.th.mode.pronunciation',
    detailKey: 'modes.th.modeDetail.pronunciation',
  },
  {
    id: 'expression-focus',
    features: ['expression'],
    labelKey: 'modes.th.mode.expression',
    detailKey: 'modes.th.modeDetail.expression',
  },
];

export const thFeatures: FeatureRegistry = {
  features: STUDY_FEATURES,
  order: FEATURE_ORDER,
  elementDefaults: DEFAULT_ELEMENTS,
  expressionElement: TH_EXPRESSION_ELEMENT,
  levelElement: null,
  chunkGroupKey: CHUNK_GROUP_KEY,
  builtIns: BUILT_INS,
  // Normal playback: see the words, then understand the line. Spec §5.
  defaultPresetId: 'basic-focus',
};
