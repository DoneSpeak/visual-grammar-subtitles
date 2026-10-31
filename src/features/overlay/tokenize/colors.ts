import { ja } from '@/languages/ja';
import type { PosGroup, Token } from '@/shared/types';
import { defaultPosColors, type PosColors } from '@/shared/posColors';

const COLOR_PLAIN = '#FFFFFF';
const DEFAULT_PALETTE = defaultPosColors();

export const posGroupOf = (token: Token): PosGroup => ja.posGroup(token);

export const isInflected = (token: Token): boolean => ja.isInflected(token);

export const colorFor = (group: PosGroup, colorize: boolean, colors: PosColors = DEFAULT_PALETTE): string =>
  colorize ? colors[group] : COLOR_PLAIN;
