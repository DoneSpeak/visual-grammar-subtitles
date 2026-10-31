import * as React from 'react';

import {
  defaultPosColors,
  loadPosColors,
  normalizePosColor,
  savePosColors,
  type PosColors,
} from '@/shared/posColors';
import type { PosGroup } from '@/shared/types';

export type PosColorsController = {
  colors: PosColors;
  /** Live update while the colour picker is open; saved on `commit`. */
  change: (group: PosGroup, value: string) => void;
  commit: (group: PosGroup, value: string) => Promise<void>;
  reset: () => Promise<void>;
};

export const usePosColors = (): PosColorsController => {
  const [colors, setColors] = React.useState<PosColors>(() => defaultPosColors());
  const colorsRef = React.useRef(colors);

  React.useEffect(() => {
    void loadPosColors().then((loaded) => {
      colorsRef.current = loaded;
      setColors(loaded);
    });
  }, []);

  const change = React.useCallback((group: PosGroup, value: string) => {
    const color = normalizePosColor(value);
    if (!color) return;
    const next = { ...colorsRef.current, [group]: color };
    colorsRef.current = next;
    setColors(next);
  }, []);

  const commit = React.useCallback(async (group: PosGroup, value: string) => {
    const color = normalizePosColor(value);
    if (color) colorsRef.current = { ...colorsRef.current, [group]: color };
    await savePosColors(colorsRef.current);
  }, []);

  const reset = React.useCallback(async () => {
    const next = defaultPosColors();
    colorsRef.current = next;
    setColors(next);
    await savePosColors(next);
  }, []);

  return { colors, change, commit, reset };
};
