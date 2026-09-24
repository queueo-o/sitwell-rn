import { Image, StyleSheet, View } from 'react-native';

import { useAppColors } from '@/theme/useAppColors';

/** SitWell mark, shown in the header of every screen. */
export function Logo({ size = 28 }: { size?: number }) {
  const c = useAppColors();
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}>
      <Image
        source={require('@/assets/images/sitwell-logo.png')}
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderWidth: 1, marginLeft: 16 },
});
