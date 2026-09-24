import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Approximate height of the bottom tab bar, for positioning things above it.
 * Avoids depending on @react-navigation/bottom-tabs directly — safe-area-context
 * is already a dependency and this only needs to be close enough for layout.
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return (Platform.OS === 'ios' ? 49 : 56) + insets.bottom;
}
