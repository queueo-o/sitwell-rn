import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BottomToast } from '@/components/BottomToast';
import { SessionRecord, activeLabel, timeLabel } from '@/models/sessionRecord';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';
import { useTabBarHeight } from '@/theme/useTabBarHeight';

const TREND_ICON = {
  improved: 'trending-up',
  declined: 'trending-down',
  stable: 'remove',
} as const;

type Filter = 'week' | 'month' | 'high' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'high', label: 'Score >90' },
  { id: 'all', label: 'All history' },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayLabel(d: Date): string {
  const today = startOfDay(new Date());
  const days = Math.round((today.getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function HistoryScreen() {
  const c = useAppColors();
  const p = usePosture();
  const tabBarHeight = useTabBarHeight();

  const [filter, setFilter] = useState<Filter>('all');
  const [pendingUndo, setPendingUndo] = useState<SessionRecord | null>(null);

  const sessions = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    return p.visibleHistory.filter((s) => {
      if (filter === 'high') return s.score > 90;
      if (filter === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);
        return startOfDay(s.startedAt).getTime() >= weekAgo.getTime();
      }
      if (filter === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 29);
        return startOfDay(s.startedAt).getTime() >= monthAgo.getTime();
      }
      return true;
    });
  }, [p.visibleHistory, filter]);

  const handleDelete = (record: SessionRecord) => {
    p.removeSession(record.id);
    setPendingUndo(record);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={styles.filterBar}>
        {FILTERS.map((f) => {
          const sel = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: sel ? `${c.accent}26` : c.surface,
                  borderColor: sel ? c.accent : c.border,
                },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  { color: sel ? c.accent : c.textMuted, fontWeight: sel ? '700' : '500' },
                ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 60 }]}
        data={sessions}
        keyExtractor={(s) => String(s.id)}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.textMuted }]}>
            {p.visibleHistory.length === 0
              ? 'No sessions recorded yet.'
              : 'No sessions match this filter.'}
          </Text>
        }
        renderItem={({ item, index }) => {
          const prev = sessions[index - 1];
          const showDay = !prev || dayLabel(prev.startedAt) !== dayLabel(item.startedAt);
          return (
            <>
              {showDay && (
                <Text style={[styles.day, { color: c.textMuted }]}>
                  {dayLabel(item.startedAt).toUpperCase()}
                </Text>
              )}
              <SwipeRow record={item} c={c} onDelete={() => handleDelete(item)} />
            </>
          );
        }}
      />

      <BottomToast
        visible={pendingUndo !== null}
        message={`Deleted ${pendingUndo?.name ?? ''} session.`}
        tone="neutral"
        actionLabel="UNDO"
        onAction={() => {
          if (pendingUndo) p.restoreSession(pendingUndo);
          setPendingUndo(null);
        }}
        onDismiss={() => setPendingUndo(null)}
        autoHideMs={5000}
        c={c}
        bottomOffset={tabBarHeight}
      />
    </View>
  );
}

/** Drag left or right past the threshold to delete. */
function SwipeRow({
  record,
  c,
  onDelete,
}: {
  record: SessionRecord;
  c: AppColors;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 120 || Math.abs(g.vx) > 0.8) {
          const to = g.dx > 0 ? 500 : -500;
          Animated.parallel([
            Animated.timing(translateX, { toValue: to, duration: 180, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          ]).start(onDelete);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

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
    <View style={styles.rowWrap}>
      <View style={[styles.deleteHint, { backgroundColor: `${c.pink}26` }]}>
        <Ionicons name="trash" size={16} color={c.pink} />
        <Ionicons name="trash" size={16} color={c.pink} />
      </View>

      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.row,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            opacity,
            transform: [{ translateX }],
          },
        ]}>
        <View style={[styles.scoreBox, { backgroundColor: c.surfaceDeep }]}>
          <Text style={[styles.score, { color: scoreColor }]}>{record.score}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: c.textPri }]}>{record.name}</Text>
            <Ionicons name={TREND_ICON[record.trend]} size={14} color={trendColor} />
            {record.isSeed && (
              <Text style={[styles.sampleTag, { color: c.textMuted }]}>sample</Text>
            )}
          </View>
          <Text style={[styles.meta, { color: c.textMuted }]}>
            {timeLabel(record.startedAt)} · {activeLabel(record)} active
          </Text>
          <Text style={[styles.meta, { color: c.textMuted }]}>
            {record.slouches} slouches
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  chipText: { fontSize: 12 },

  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  day: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 12, marginBottom: 4 },

  rowWrap: { position: 'relative' },
  deleteHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  scoreBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { fontSize: 20, fontWeight: '800' },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  sampleTag: { fontSize: 9, fontStyle: 'italic' },
  meta: { fontSize: 11 },
});
