import { Ionicons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import {
  SessionRecord,
  activeLabel,
  durationLabel,
  timeLabel,
} from '@/models/sessionRecord';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';

const TREND_ICON = {
  improved: 'trending-up',
  declined: 'trending-down',
  stable: 'remove',
} as const;

function dayLabel(d: Date): string {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfRecord = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfToday.getTime() - startOfRecord.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function HistoryScreen() {
  const c = useAppColors();
  const p = usePosture();

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.list}
      data={p.sessionHistory}
      keyExtractor={(s) => String(s.id)}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: c.textMuted }]}>No sessions recorded yet.</Text>
      }
      renderItem={({ item, index }) => {
        const prev = p.sessionHistory[index - 1];
        const showDay = !prev || dayLabel(prev.startedAt) !== dayLabel(item.startedAt);
        return (
          <>
            {showDay && (
              <Text style={[styles.day, { color: c.textMuted }]}>
                {dayLabel(item.startedAt).toUpperCase()}
              </Text>
            )}
            <SessionRow record={item} c={c} />
          </>
        );
      }}
    />
  );
}

function SessionRow({ record, c }: { record: SessionRecord; c: AppColors }) {
  const scoreColor =
    record.score >= 90
      ? c.green
      : record.score >= 70
        ? c.accent
        : record.score >= 50
          ? c.amber
          : c.pink;

  const trendColor =
    record.trend === 'improved' ? c.green : record.trend === 'declined' ? c.pink : c.textMuted;

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.scoreBox, { backgroundColor: c.surfaceDeep }]}>
        <Text style={[styles.score, { color: scoreColor }]}>{record.score}</Text>
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: c.textPri }]}>{record.name}</Text>
          <Ionicons name={TREND_ICON[record.trend]} size={14} color={trendColor} />
        </View>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          {timeLabel(record.startedAt)} · {durationLabel(record)} total
        </Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          {activeLabel(record)} active · {record.slouches} slouches
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, paddingBottom: 32 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  day: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  scoreBox: { width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 20, fontWeight: '800' },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 11 },
});
