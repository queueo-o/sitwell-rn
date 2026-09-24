import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { SensorConfig, deviationThreshold } from '@/models/sensorConfig';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';

type Status = 'good' | 'off' | 'bad' | 'idle';

function statusFor(
  sensor: SensorConfig,
  reading: number | undefined,
  baseline: number | undefined,
): Status {
  if (!sensor.isActive) return 'idle';
  if (reading === undefined || baseline === undefined || baseline <= 0) return 'idle';
  const dev = Math.abs((reading - baseline) / baseline);
  const limit = deviationThreshold(sensor.hardwareType);
  if (dev >= limit) return 'bad';
  if (dev >= limit * 0.6) return 'off';
  return 'good';
}

function colorFor(s: Status, c: AppColors): string {
  switch (s) {
    case 'good':
      return c.green;
    case 'off':
      return c.amber;
    case 'bad':
      return c.pink;
    default:
      return c.textMuted;
  }
}

/**
 * Chair seen from the front: backrest panel above, trapezoid seat below,
 * with the six pads placed where they physically sit.
 *
 *   Backrest  S1 · S2 across the shoulders, S3 (velostat) centred lower
 *   Seat      S1 · S2 at the back of the seat, S3 (velostat) centred front
 */
export function ChairMap({ c, compact = false }: { c: AppColors; compact?: boolean }) {
  const p = usePosture();
  const [w, setW] = useState(0);

  const upper = p.sensors.filter((s) => s.displayName.endsWith('_UPPER'));
  const lower = p.sensors.filter((s) => s.displayName.endsWith('_LOWER'));

  const height = compact ? 190 : 260;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  // Geometry, in the measured width.
  const backW = w * 0.56;
  const backX = (w - backW) / 2;
  const backH = height * 0.42;
  const backY = 4;

  const seatTopW = w * 0.58;
  const seatBotW = w * 0.82;
  const seatY = backY + backH + height * 0.045;
  const seatH = height * 0.44;

  const pad = compact ? 9 : 13;
  const padBig = compact ? 13 : 19;

  const seatPath = [
    `M ${(w - seatTopW) / 2} ${seatY}`,
    `L ${(w + seatTopW) / 2} ${seatY}`,
    `L ${(w + seatBotW) / 2} ${seatY + seatH}`,
    `L ${(w - seatBotW) / 2} ${seatY + seatH}`,
    'Z',
  ].join(' ');

  const pads =
    w === 0
      ? []
      : [
          // Backrest: two shoulders then the centred velostat.
          // The 0.62 keeps each label clear of the panel edge below it.
          { s: upper[0], x: backX + backW * 0.22, y: backY + backH * 0.26, r: pad },
          { s: upper[1], x: backX + backW * 0.78, y: backY + backH * 0.26, r: pad },
          { s: upper[2], x: w / 2, y: backY + backH * 0.62, r: padBig },
          // Seat: two at the back then the centred velostat toward the front
          { s: lower[0], x: w / 2 - seatTopW * 0.26, y: seatY + seatH * 0.2, r: pad },
          { s: lower[1], x: w / 2 + seatTopW * 0.26, y: seatY + seatH * 0.2, r: pad },
          { s: lower[2], x: w / 2, y: seatY + seatH * 0.6, r: padBig },
        ].filter((entry) => entry.s !== undefined);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.textPri }]}>
          {compact ? 'Chair Map' : 'Live Sensor Map'}
        </Text>
        <View style={styles.legend}>
          <LegendDot color={c.green} label="Good" c={c} />
          <LegendDot color={c.amber} label="Off" c={c} />
          <LegendDot color={c.pink} label="Bad" c={c} />
        </View>
      </View>

      <View onLayout={onLayout} style={{ height }}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {/* Backrest */}
            <Rect
              x={backX}
              y={backY}
              width={backW}
              height={backH}
              rx={16}
              fill={c.surfaceDeep}
              stroke={c.border}
              strokeWidth={1}
            />
            {/* Seat */}
            <Path d={seatPath} fill={c.surfaceDeep} stroke={c.border} strokeWidth={1} />
            {/* Front lip */}
            <Line
              x1={(w - seatBotW) / 2 + 6}
              y1={seatY + seatH - 2}
              x2={(w + seatBotW) / 2 - 6}
              y2={seatY + seatH - 2}
              stroke={c.accent}
              strokeOpacity={0.5}
              strokeWidth={2}
            />

            {pads.map(({ s, x, y, r }) => {
              const sensor = s as SensorConfig;
              const status = statusFor(
                sensor,
                p.readings[sensor.key],
                p.baselines[sensor.key],
              );
              const color = colorFor(status, c);
              return (
                <Circle
                  key={sensor.key}
                  cx={x}
                  cy={y}
                  r={r}
                  fill={status === 'idle' ? c.border : color}
                  fillOpacity={status === 'idle' ? 0.6 : 0.85}
                  stroke={color}
                  strokeWidth={2}
                />
              );
            })}

            {pads.map(({ s, x, y, r }) => {
              const sensor = s as SensorConfig;
              return (
                <SvgText
                  key={`t-${sensor.key}`}
                  x={x}
                  y={y + r + 13}
                  fill={c.textMuted}
                  fontSize={compact ? 8 : 10}
                  fontWeight="bold"
                  textAnchor="middle">
                  {sensor.displayName.replace('_UPPER', '').replace('_LOWER', '')}
                </SvgText>
              );
            })}
          </Svg>
        )}
      </View>
    </View>
  );
}

function LegendDot({ color, label, c }: { color: string; label: string; c: AppColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '600' },
});
