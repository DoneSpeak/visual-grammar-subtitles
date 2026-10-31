import type { PosGroup } from './types';

export type PosColors = Record<PosGroup, string>;

export const POS_COLORS_KEY = 'ui:posColors';

export const isPosColorsKey = (key: string): boolean => key === POS_COLORS_KEY;

export const POS_GROUPS: PosGroup[] = [
  'noun',
  'verb',
  'adj',
  'adverb',
  'particle',
  'conjunction',
  'symbol',
  'other',
];

export const POS_GROUP_LABELS: Record<PosGroup, { name: string; detail: string }> = {
  noun: { name: '名词', detail: '名词 · 代名词' },
  verb: { name: '动词', detail: '动词' },
  adj: { name: '形容', detail: '形容词 · 形状词 · 连体词' },
  adverb: { name: '副词', detail: '副词' },
  particle: { name: '助词', detail: '助词 · 助动词' },
  conjunction: { name: '接续', detail: '接续词' },
  symbol: { name: '符号', detail: '标点 · 空白' },
  other: { name: '其他', detail: '感叹词等' },
};

/**
 * Video frames are arbitrary, so every colour sits in the mid-luminance band that clears
 * 3:1 against both white and near-black, and the layer's dark text-shadow carries the rest.
 */
const DEFAULT_POS_COLORS: PosColors = {
  noun: '#1E90FF',
  verb: '#E5533D',
  adj: '#B8860B',
  adverb: '#0F9D58',
  particle: '#8A8F98',
  conjunction: '#9B59B6',
  symbol: '#6E737C',
  other: '#FFFFFF',
};

export const defaultPosColors = (): PosColors => ({ ...DEFAULT_POS_COLORS });

/** Expands `#abc` and drops the `#`; returns null for anything that is not a hex colour. */
export const normalizePosColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return `#${digits.toUpperCase()}`;
};

export const loadPosColors = async (): Promise<PosColors> => {
  const raw = await chrome.storage.local.get(POS_COLORS_KEY);
  const saved = raw[POS_COLORS_KEY] as Partial<PosColors> | undefined;
  const base = defaultPosColors();
  if (!saved) return base;
  for (const group of POS_GROUPS) {
    const color = normalizePosColor(saved[group]);
    if (color) base[group] = color;
  }
  return base;
};

export const savePosColors = async (colors: PosColors): Promise<void> => {
  const next = defaultPosColors();
  for (const group of POS_GROUPS) {
    next[group] = normalizePosColor(colors[group]) ?? next[group];
  }
  await chrome.storage.local.set({ [POS_COLORS_KEY]: next });
};