import { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Bucket, formatMinutes } from '@/models/insights';
import { AppColors } from '@/theme/colors';

const HEIGHT = 160;
const LABEL_H = 18;
const TOP_PAD = 10; // keeps the topmost y-label from clipping the SVG edge
const LEFT_PAD = 36;
const CORNER = 4;

/** Bar with rounded top corners, square where it meets the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(CORNER, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/**
 * Total session time per bucket. Bars are anchored to the baseline and sit
 * well clear of each other; tapping one reveals its value.
 */
export function TimeBarChart({ buckets, c }: { buckets: Bucket[]; c: AppColors }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const plotTop = TOP_PAD;
  const plotBottom = HEIGHT - LABEL_H;
  const plotH = plotBottom - plotTop;
  const plotW = Math.max(width - LEFT_PAD, 0);
  const n = buckets.length;
  const maxMin = buckets.reduce((a, b) => Math.max(a, b.minutes), 0);

  const slot = n > 0 ? plotW / n : 0;
  const barW = slot * 0.5;

  const ticks = Array.from(new Set([0, Math.floor(maxMin / 2), maxMin]));

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT }}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((tick) => {
            const frac = maxMin > 0 ? tick / maxMin : 0;
            const y = plotBottom - plotH * frac;
            return (
              <G key={tick}>
                <Line
                  x1={LEFT_PAD}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={c.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={LEFT_PAD - 4}
                  y={y + 3}
                  fill={c.textMuted}
                  fontSize={9}
                  textAnchor="end">
                  {formatMinutes(tick)}
                </SvgText>
              </G>
            );
          })}

          {buckets.map((b, i) => {
            const cx = LEFT_PAD + slot * i + slot / 2;
            const h = maxMin > 0 && b.minutes > 0 ? plotH * (b.minutes / maxMin) : 0;
            return (
              <G key={`${b.label}-${i}`}>
                {h > 0 && (
                  <Path
                    d={barPath(cx - barW / 2, plotBottom - h, barW, h)}
                    fill={c.green}
                    fillOpacity={selected === null || selected === i ? 1 : 0.45}
                  />
                )}
                <SvgText
                  x={cx}
                  y={plotBottom + 13}
                  fill={c.textMuted}
                  fontSize={9}
                  textAnchor="middle">
                  {b.label}
                </SvgText>
              </G>
            );
          })}

          {/* Selected value above the bar */}
          {selected !== null &&
            (() => {
              const b = buckets[selected];
              if (!b || b.minutes === 0 || maxMin === 0) return null;
              const cx = LEFT_PAD + slot * selected + slot / 2;
              const h = plotH * (b.minutes / maxMin);
              const label = formatMinutes(b.minutes);
              const boxW = Math.max(label.length * 6 + 10, 32);
              const boxX = Math.min(
                Math.max(cx - boxW / 2, LEFT_PAD),
                Math.max(width - boxW, LEFT_PAD),
              );
              return (
                <G>
                  <Rect
                    x={boxX}
                    y={Math.max(plotBottom - h - 22, 0)}
                    width={boxW}
                    height={18}
                    rx={5}
                    fill={c.green}
                  />
                  <SvgText
                    x={boxX + boxW / 2}
                    y={Math.max(plotBottom - h - 9, 13)}
                    fill={c.bg}
                    fontSize={10}
                    fontWeight="bold"
                    textAnchor="middle">
                    {label}
                  </SvgText>
                </G>
              );
            })()}

          {/* Full-height hit targets, larger than the bars */}
          {buckets.map((b, i) => (
            <Rect
              key={`hit-${i}`}
              x={LEFT_PAD + slot * i}
              y={plotTop}
              width={slot}
              height={plotH}
              fill="transparent"
              onPress={() => setSelected(selected === i ? null : i)}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
