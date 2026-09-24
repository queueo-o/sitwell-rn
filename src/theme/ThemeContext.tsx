/**
 * Manual light/dark override. Ported from lib/providers/theme_notifier.dart.
 *
 * Follows the OS until the user flips the switch in Settings, after which the
 * explicit choice wins for the rest of the session.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

interface ThemeContextValue {
  isDark: boolean;
  /** True while still following the OS setting. */
  followingSystem: boolean;
  toggle: () => void;
  useSystem: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(null);

  const isDark = override ?? system !== 'light';

  const toggle = useCallback(() => setOverride((prev) => !(prev ?? system !== 'light')), [system]);
  const useSystem = useCallback(() => setOverride(null), []);

  const value = useMemo(
    () => ({ isDark, followingSystem: override === null, toggle, useSystem }),
    [isDark, override, toggle, useSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Null-safe: components rendered outside the provider fall back to the OS. */
export function useThemeMode(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
