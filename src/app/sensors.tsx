import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SensorConfig, deviationThreshold, pressureNorm } from '@/models/sensorConfig';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';

/** Green / amber / pink by how far the reading has drifted from baseline. */
function statusColor(
  sensor: SensorConfig,
  reading: number | undefined,
  baseline: number | undefined,
  c: AppColors,
): string {
  if (reading === undefined || baseline === undefined || baseline <= 0) return c.textMuted;
  const dev = Math.abs((reading - baseline) / baseline);
  const limit = deviationThreshold(sensor.hardwareType);
  if (dev >= limit) return c.pink;
  if (dev >= limit * 0.6) return c.amber;
  return c.green;
}

export default function SensorsScreen() {
  const c = useAppColors();
  const p = usePosture();

  const upper = p.sensors.filter((s) => s.displayName.endsWith('_UPPER'));
  const lower = p.sensors.filter((s) => s.displayName.endsWith('_LOWER'));

  if (!p.isConnected) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Ionicons name="bluetooth-outline" size={44} color={c.textMuted} />
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          Connect to view the sensor map.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.scroll}>
      {/* Calibration status */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.textMuted }]}>CALIBRATION</Text>
        {p.isCalibrating ? (
          <>
            <Text style={[styles.body, { color: c.textPri }]}>
              Hold your normal posture… {Math.round(p.calibrationProgress * 100)}%
            </Text>
            <View style={[styles.track, { backgroundColor: c.surfaceDeep }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: c.accent, width: `${p.calibrationProgress * 100}%` },
                ]}
              />
            </View>
          </>
        ) : (
          <Text style={[styles.body, { color: c.textPri }]}>
            {p.isCalibrated ? 'Calibrated — baselines captured.' : p.hardwareCheckMessage}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={p.calibrate}
          disabled={!p.canCalibrate || p.isCalibrating}
          style={[
            styles.btn,
            {
              backgroundColor: p.canCalibrate && !p.isCalibrating ? c.accent : c.surface,
              borderColor: c.border,
            },
          ]}>
          <Text
            style={[
              styles.btnText,
              { color: p.canCalibrate && !p.isCalibrating ? c.bg : c.textMuted },
            ]}>
            CALIBRATE
          </Text>
        </Pressable>
        <Pressable
          onPress={p.resetCalibration}
          style={[styles.btn, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.btnText, { color: c.textPri }]}>RESET</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={p.runHardwareCheck}
        style={[styles.btnWide, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="refresh" size={16} color={c.textPri} />
        <Text style={[styles.btnText, { color: c.textPri }]}>RUN SENSOR CHECK</Text>
      </Pressable>

      {/* Chair map */}
      <Text style={[styles.section, { color: c.textMuted }]}>BACKREST</Text>
      <View style={styles.grid}>
        {upper.map((s) => (
          <SensorTile key={s.key} sensor={s} c={c} />
        ))}
      </View>

      <Text style={[styles.section, { color: c.textMuted }]}>SEAT</Text>
      <View style={styles.grid}>
        {lower.map((s) => (
          <SensorTile key={s.key} sensor={s} c={c} />
        ))}
      </View>
    </ScrollView>
  );
}

function SensorTile({ sensor, c }: { sensor: SensorConfig; c: AppColors }) {
  const p = usePosture();
  const reading = p.readings[sensor.key];
  const baseline = p.baselines[sensor.key];
  const color = statusColor(sensor, reading, baseline, c);
  const norm = reading !== undefined ? pressureNorm(reading) : 0;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: c.surface,
          borderColor: sensor.isActive ? color : c.border,
          opacity: sensor.isActive ? 1 : 0.45,
        },
      ]}>
      <View style={styles.tileHead}>
        <View style={[styles.tileDot, { backgroundColor: color }]} />
        <Text style={[styles.tileName, { color: c.textPri }]}>{sensor.displayName}</Text>
      </View>
      <Text style={[styles.tileValue, { color }]}>{reading ?? '—'}</Text>
      <View style={[styles.track, { backgroundColor: c.surfaceDeep }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${norm * 100}%` }]} />
      </View>
      {baseline !== undefined && (
        <Text style={[styles.tileMeta, { color: c.textMuted }]}>
          baseline {Math.round(baseline)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  body: { fontSize: 13 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 8 },

  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, gap: 6 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileDot: { width: 7, height: 7, borderRadius: 4 },
  tileName: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tileValue: { fontSize: 22, fontWeight: '800' },
  tileMeta: { fontSize: 9 },

  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
