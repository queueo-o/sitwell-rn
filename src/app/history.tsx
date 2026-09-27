import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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
  // LIFO: deleting several in a row queues them, and each undo reveals the
  // next one rather than stranding the earlier deletions with no way back.
  const [undoStack, setUndoStack] = useState<SessionRecord[]>([]);
  const pendingUndo = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;

  const sessions = useMemo(() => {
    const today = startOfDay(new Date());
    return p.visibleHistory.filter((s) => {
      if (filter === 'high') return s.score > 90;
      if (filter === 'week') {
        const from = new Date(today);
        from.setDate(from.getDate() - 6);
        return startOfDay(s.startedAt).getTime() >= from.getTime();
      }
      if (filter === 'month') {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        return startOfDay(s.startedAt).getTime() >= from.getTime();
      }
      return true;
    });
  }, [p.visibleHistory, filter]);

  const handleDelete = useCallback(
    (record: SessionRecord) => {
      p.removeSession(record.id);
      setUndoStack((s) => [...s, record]);
    },
    [p],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((s) => {
      const next = s.slice(0, -1);
      const restored = s[s.length - 1];
      if (restored) p.restoreSession(restored);
      return next;
    });
  }, [p]);

  // Dismissing means "done undoing" — drop the whole queue rather than making
  // the user swat away one toast per deletion.
  const handleDismissUndo = useCallback(() => setUndoStack([]), []);

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
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 70 }]}
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
              <SwipeRow record={item} c={c} onDelete={handleDelete} />
            </>
          );
        }}
      />

      {/* Keyed on depth so each undo remounts the toast: fresh slide-in and a
          fresh 5s timer for the next item in the queue. */}
      <BottomToast
        key={undoStack.length}
        visible={pendingUndo !== null}
        message={
          undoStack.length > 1
            ? `Deleted ${pendingUndo?.name ?? ''} session · ${undoStack.length - 1} more`
            : `Deleted ${pendingUndo?.name ?? ''} session.`
        }
        tone="neutral"
        actionLabel="UNDO"
        onAction={handleUndo}
        onDismiss={handleDismissUndo}
        autoHideMs={5000}
        c={c}
        bottomOffset={tabBarHeight}
      />
    </View>
  );
}

const DISMISS_PX = 110;
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 };

function SwipeRow({
  record,
  c,
  onDelete,
}: {
  record: SessionRecord;
  c: AppColors;
  onDelete: (r: SessionRecord) => void;
}) {
  const tx = useSharedValue(0);
  const opacity = useSharedValue(1);

  const remove = useCallback(() => onDelete(record), [onDelete, record]);

  /**
   * Left-only. A single negative activeOffsetX means the pan only claims the
   * gesture on a leftward drag, so rightward swipes and vertical scrolls both
   * stay with the FlatList — without that the row and the list fight over
   * every touch, which is what left rows stranded half-swiped.
   */
  const pan = Gesture.Pan()
    .activeOffsetX(-16)
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      // Clamp at 0 so the row can never be dragged to the right.
      tx.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      const go = e.translationX < -DISMISS_PX || e.velocityX < -800;
      if (go) {
        tx.value = withTiming(-520, { duration: 170 });
        opacity.value = withTiming(0, { duration: 170 }, (done) => {
          if (done) runOnJS(remove)();
        });
      } else {
        tx.value = withSpring(0, SPRING);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  // Backdrop fades in as the row travels, so the intent reads before release.
  const hintStyle = useAnimatedStyle(() => ({
    opacity: Math.min(-tx.value / DISMISS_PX, 1),
  }));

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
      {/* Revealed on the right as the row slides left. */}
      <Animated.View style={[styles.deleteHint, { backgroundColor: `${c.pink}2E` }, hintStyle]}>
        <Ionicons name="trash" size={18} color={c.pink} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }, rowStyle]}>
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
            <Text style={[styles.meta, { color: c.textMuted }]}>{record.slouches} slouches</Text>
          </View>
        </Animated.View>
      </GestureDetector>
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
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
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
