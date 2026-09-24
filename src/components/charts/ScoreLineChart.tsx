import { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Bucket } from '@/models/insights';
import { AppColors } from '@/theme/colors';

const HEIGHT = 160;
const LABEL_H = 18;
const TOP_PAD = 10; // keeps the topmost y-label from clipping the SVG edge
const LEFT_PAD = 30;
const EDGE = 12; // keeps first/last x-labels inside the box

/**
 * Average posture score over time. One series, so no legend — the card title
 * names it. Values are revealed by tapping a point rather than printing a
 * number on every one.
 */
export function ScoreLineChart({ buckets, c }: { buckets: Bucket[]; c: AppColors }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const plotTop = TOP_PAD;
  const plotBottom = HEIGHT - LABEL_H;
  const plotH = plotBottom - plotTop;
  const plotW = Math.max(width - LEFT_PAD - EDGE, 0);
  const n = buckets.length;

  const xFor = (i: number) => LEFT_PAD + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yFor = (score: number) => plotBottom - plotH * Math.min(Math.max(score / 100, 0), 1);

  const points = buckets
    .map((b, i) =>
      b.avgScore === null ? null : { i, x: xFor(i), y: yFor(b.avgScore), v: b.avgScore },
    )
    .filter((p): p is { i: number; x: number; y: number; v: number } => p !== null);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M${points[0].x},${plotBottom} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${
          points[points.length - 1].x
        },${plotBottom} Z`
      : '';

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT }}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {/* Recessive grid + y-axis at 0 / 50 / 100 */}
          {[0, 0.5, 1].map((v) => {
            const y = plotBottom - plotH * v;
            return (
              <G key={v}>
                <Line
                  x1={LEFT_PAD}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={c.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={LEFT_PAD - 5}
                  y={y + 3}
                  fill={c.textMuted}
                  fontSize={9}
                  textAnchor="end">
                  {v * 100}
                </SvgText>
              </G>
            );
          })}

          {points.length > 0 && (
            <>
              <Path d={areaPath} fill={c.accent} fillOpacity={0.14} />
              <Path
                d={linePath}
                stroke={c.accent}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p) => (
                <Circle
                  key={p.i}
                  cx={p.x}
                  cy={p.y}
                  r={selected === p.i ? 6 : 4}
                  fill={c.accent}
                  stroke={c.surface}
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {/* X-axis labels, clamped so the ends stay inside */}
          {buckets.map((b, i) => (
            <SvgText
              key={`${b.label}-${i}`}
              x={Math.min(Math.max(xFor(i), LEFT_PAD + EDGE), width - EDGE)}
              y={plotBottom + 13}
              fill={c.textMuted}
              fontSize={9}
              textAnchor="middle">
              {b.label}
            </SvgText>
          ))}

          {/* Selected value, drawn above the point */}
          {selected !== null &&
            points
              .filter((p) => p.i === selected)
              .map((p) => (
                <G key={`sel-${p.i}`}>
                  <Rect
                    x={Math.min(Math.max(p.x - 18, LEFT_PAD), Math.max(width - 36, LEFT_PAD))}
                    y={Math.max(p.y - 26, 0)}
                    width={36}
                    height={18}
                    rx={5}
                    fill={c.accent}
                  />
                  <SvgText
                    x={Math.min(Math.max(p.x, LEFT_PAD + 18), Math.max(width - 18, LEFT_PAD + 18))}
                    y={Math.max(p.y - 13, 13)}
                    fill={c.bg}
                    fontSize={10}
                    fontWeight="bold"
                    textAnchor="middle">
                    {Math.round(p.v)}
                  </SvgText>
                </G>
              ))}

          {/* Hit targets, larger than the marks */}
          {points.map((p) => (
            <Circle
              key={`hit-${p.i}`}
              cx={p.x}
              cy={p.y}
              r={16}
              fill="transparent"
              onPress={() => setSelected(selected === p.i ? null : p.i)}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
