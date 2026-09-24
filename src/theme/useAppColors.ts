import { useColorScheme } from 'react-native';

import { useThemeMode } from './ThemeContext';
import { AppColors, darkColors, lightColors } from './colors';

/**
 * Mirrors AppColors.of(context) from the Flutter app.
 * Honours the manual Settings override when one is set, otherwise the OS.
 */
export function useAppColors(): AppColors {
  const system = useColorScheme();
  const theme = useThemeMode();
  const isDark = theme ? theme.isDark : system !== 'light';
  return isDark ? darkColors : lightColors;
}
