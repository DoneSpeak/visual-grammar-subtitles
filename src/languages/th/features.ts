import { defaultPosColors, POS_GROUPS } from '@/shared/posColors';
import { POS_ELEMENT, ROLE_ELEMENTS, type FeatureRegistry } from '@/shared/studyFeatures';

/** Keyed by element id so reordering `ROLE_ELEMENTS` never shifts the palette. */
const ROLE_COLORS: Record<string, string> = {
  'syntax.role:topic': '#C084FC',
  'syntax.role:subject': '#60A5FA',
  'syntax.role:object': '#FACC15',
  'syntax.role:predicate': '#FB923C',
  'syntax.role:modifier': '#4ADE80',
  'syntax.role:adverbial': '#22D3EE',
};

export const thFeatures: FeatureRegistry = {
  features: [
    { id: 'pos', group: 'token', requires: 'local', elements: POS_GROUPS.map(g => POS_ELEMENT[g]) },
    { id: 'syntax', group: 'remote', requires: 'remote', elements: ROLE_ELEMENTS },
  ],
  order: ['pos', 'syntax'],
  elementDefaults: {
    ...Object.fromEntries(POS_GROUPS.map(g => [POS_ELEMENT[g], { color: defaultPosColors()[g] }])),
    ...Object.fromEntries(ROLE_ELEMENTS.map((id) => [id, {
      color: ROLE_COLORS[id] ?? '#FFFFFF',
      underline: { enabled: true, style: 'solid' as const, thicknessPx: 2, offsetPx: 3 },
    }])),
  },
  expressionElement: null, levelElement: null, chunkGroupKey: null,
  builtIns: [
    { id: 'plain', features: [], labelKey: 'modes.mode.plain', detailKey: 'modes.modeDetail.plain' },
    { id: 'pos-basic', features: ['pos'], labelKey: 'modes.mode.pos-basic', detailKey: 'modes.th.posDetail' },
    { id: 'syntax-focus', features: ['syntax'], labelKey: 'modes.mode.syntax-focus', detailKey: 'modes.th.syntaxDetail' },
  ],
  defaultPresetId: 'pos-basic',
};
