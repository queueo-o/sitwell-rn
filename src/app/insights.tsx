import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiAnalysisCard } from '@/components/AiAnalysisCard';
import { ScoreLineChart } from '@/components/charts/ScoreLineChart';
import { TimeBarChart } from '@/components/charts/TimeBarChart';
import {
  PERIODS,
  Period,
  buildBuckets,
  formatMinutes,
  periodLabel,
  sessionsInWindow,
} from '@/models/insights';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';

export default function InsightsScreen() {
  const c = useAppColors();
  const p = usePosture();
  const [period, setPeriod] = useState<Period>('d7');

  const { inWindow, buckets, avgScore, totalMinutes } = useMemo(() => {
    const win = sessionsInWindow(p.sessionHistory, period);
    const scored = win.filter((s) => s.score > 0);
    return {
      inWindow: win,
      buckets: buildBuckets(win, period),
      avgScore:
        scored.length === 0
          ? 0
          : Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length),
      totalMinutes: win.reduce((a, s) => a + Math.floor(s.durationMs / 60000), 0),
    };
  }, [p.sessionHistory, period]);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.scroll}>
      {/* Period filter — one row above the charts */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderColor: c.border }]}>
        {PERIODS.map((item) => {
          const sel = item === period;
          return (
            <Pressable
              key={item}
              onPress={() => setPeriod(item)}
              style={[
                styles.tab,
                sel && { backgroundColor: `${c.accent}26`, borderColor: c.accent },
              ]}>
              <Text
                style={[
                  styles.tabText,
                  { color: sel ? c.accent : c.textMuted, fontWeight: sel ? '700' : '500' },
                ]}>
                {periodLabel(item)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AiAnalysisCard sessions={inWindow} />

      {inWindow.length === 0 ? (
        <View style={[styles.noData, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="bar-chart" size={44} color={c.textMuted} />
          <Text style={[styles.noDataTitle, { color: c.textPri }]}>No data yet</Text>
          <Text style={[styles.noDataBody, { color: c.textMuted }]}>
            Complete sessions to see your posture insights.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statRow}>
            <StatTile value={String(avgScore)} label="AVG SCORE" icon="speedometer" c={c} />
            <StatTile value={formatMinutes(totalMinutes)} label="TOTAL TIME" icon="time" c={c} />
            <StatTile
              value={String(inWindow.length)}
              label={inWindow.length === 1 ? 'SESSION' : 'SESSIONS'}
              icon="calendar"
              c={c}
            />
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.textPri }]}>Average Posture Score</Text>
            <ScoreLineChart buckets={buckets} c={c} />
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.textPri }]}>Total Session Time</Text>
            <TimeBarChart buckets={buckets} c={c} />
          </View>

          <Text style={[styles.hint, { color: c.textMuted }]}>
            Tap a point or bar to see its value.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function StatTile({
  value,
  label,
  icon,
  c,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  c: AppColors;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Ionicons name={icon} size={18} color={c.accent} />
      <Text style={[styles.statValue, { color: c.textPri }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },

  tabs: { flexDirection: 'row', gap: 4, borderRadius: 14, borderWidth: 1, padding: 6 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  tabText: { fontSize: 13 },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 1.1 },

  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },

  hint: { fontSize: 11, textAlign: 'center' },

  noData: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  noDataTitle: { fontSize: 17, fontWeight: '600' },
  noDataBody: { fontSize: 13, textAlign: 'center' },
});
