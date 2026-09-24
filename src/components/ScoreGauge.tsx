import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { AppColors } from '@/theme/colors';

/**
 * 240° score gauge. Ported from _ScoreGaugePainter in home_screen.dart —
 * same sweep, stroke, glow and tip dot.
 */
const START_DEG = 150;
const SWEEP_DEG = 240;
const STROKE = 14;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path from startDeg sweeping sweepDeg clockwise. */
function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const clamped = Math.min(Math.max(sweepDeg, 0), 359.99);
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, startDeg + clamped);
  const largeArc = clamped > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function ScoreGauge({
  score,
  label,
  fill,
  c,
  size = 200,
  calibrated,
}: {
  score: number;
  label: string;
  fill: string;
  c: AppColors;
  size?: number;
  calibrated: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - STROKE - 6;
  const frac = calibrated ? Math.min(Math.max(score / 100, 0), 1) : 0;
  const sweep = SWEEP_DEG * frac;
  const tip = polar(cx, cy, r, START_DEG + sweep);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="tipGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Track */}
        <Path
          d={arcPath(cx, cy, r, START_DEG, SWEEP_DEG)}
          stroke={c.surfaceDeep}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />

        {frac > 0 && (
          <G>
            {/* Soft halo under the filled arc */}
            <Path
              d={arcPath(cx, cy, r, START_DEG, sweep)}
              stroke={fill}
              strokeOpacity={0.22}
              strokeWidth={STROKE + 12}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={arcPath(cx, cy, r, START_DEG, sweep)}
              stroke={fill}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
            {/* Tip marker */}
            <Circle cx={tip.x} cy={tip.y} r={11} fill="url(#tipGlow)" />
            <Circle cx={tip.x} cy={tip.y} r={5} fill="#FFFFFF" />
          </G>
        )}
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.value, { color: calibrated ? fill : c.textMuted }]}>
          {calibrated ? score : '--'}
        </Text>
        <Text style={[styles.label, { color: c.textPri }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  value: { fontSize: 52, fontWeight: '800', letterSpacing: -1.5 },
  label: { fontSize: 13, fontWeight: '600' },
});
