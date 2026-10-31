import * as React from 'react';

import { applyTheme, resolvedTheme, saveThemeMode, watchTheme, type ThemeMode } from '@/shared/theme';

export type ResolvedTheme = 'light' | 'dark';

/**
 * Follows the stored theme and the OS preference. shared/theme.ts owns the storage
 * contract; this hook only exposes it as React state.
 */
export const useTheme = () => {
  const [mode, setModeState] = React.useState<ThemeMode>('system');
  const [resolved, setResolved] = React.useState<ResolvedTheme>(() => resolvedTheme('system'));

  React.useEffect(() => {
    return watchTheme((next) => {
      setModeState(next);
      setResolved(resolvedTheme(next));
    });
  }, []);

  const setMode = React.useCallback((next: ThemeMode) => {
    applyTheme(next);
    setModeState(next);
    setResolved(resolvedTheme(next));
    void saveThemeMode(next);
  }, []);

  return { mode, resolved, setMode };
};
