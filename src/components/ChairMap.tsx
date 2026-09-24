import { StyleSheet, Text, View } from 'react-native';

import { SensorConfig, deviationThreshold } from '@/models/sensorConfig';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';

/**
 * Compact six-sensor chair map for the Home screen: backrest above, seat
 * below. The full-size version with readings lives on the Sensors tab.
 */
export function ChairMap({ c }: { c: AppColors }) {
  const p = usePosture();
  const upper = p.sensors.filter((s) => s.displayName.endsWith('_UPPER'));
  const lower = p.sensors.filter((s) => s.displayName.endsWith('_LOWER'));

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: c.textMuted }]}>CHAIR MAP</Text>
        <Text style={[styles.legend, { color: c.textMuted }]}>
          backrest · seat
        </Text>
      </View>

      <View style={[styles.zone, { backgroundColor: c.surfaceDeep }]}>
        {upper.map((s) => (
          <Pad key={s.key} sensor={s} c={c} />
        ))}
      </View>
      <View style={[styles.zone, { backgroundColor: c.surfaceDeep }]}>
        {lower.map((s) => (
          <Pad key={s.key} sensor={s} c={c} />
        ))}
      </View>
    </View>
  );
}

function Pad({ sensor, c }: { sensor: SensorConfig; c: AppColors }) {
  const p = usePosture();
  const reading = p.readings[sensor.key];
  const baseline = p.baselines[sensor.key];

  let color = c.textMuted;
  if (reading !== undefined && baseline !== undefined && baseline > 0) {
    const dev = Math.abs((reading - baseline) / baseline);
    const limit = deviationThreshold(sensor.hardwareType);
    color = dev >= limit ? c.pink : dev >= limit * 0.6 ? c.amber : c.green;
  }

  return (
    <View style={styles.padWrap}>
      <View
        style={[
          styles.pad,
          {
            backgroundColor: sensor.isActive ? `${color}33` : 'transparent',
            borderColor: sensor.isActive ? color : c.border,
          },
        ]}>
        <View
          style={[
            styles.dot,
            { backgroundColor: sensor.isActive ? color : c.border },
          ]}
        />
      </View>
      <Text style={[styles.padLabel, { color: c.textMuted }]} numberOfLines={1}>
        {sensor.displayName.replace('_UPPER', '').replace('_LOWER', '')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  legend: { fontSize: 9 },
  zone: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderRadius: 10,
    paddingVertical: 8,
  },
  padWrap: { alignItems: 'center', gap: 3 },
  pad: {
    width: 40,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  padLabel: { fontSize: 8, fontWeight: '600' },
});
