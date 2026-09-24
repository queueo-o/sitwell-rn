import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePosture } from '@/state/PostureContext';
import { useAppColors } from '@/theme/useAppColors';

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const c = useAppColors();
  const p = usePosture();

  // Slide-in toast for the newest notification.
  const toastY = useRef(new Animated.Value(-120)).current;
  const lastNotifId = useRef(0);

  useEffect(() => {
    if (!p.notification || p.notification.id === lastNotifId.current) return;
    lastNotifId.current = p.notification.id;
    Animated.sequence([
      Animated.timing(toastY, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(toastY, { toValue: -120, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [p.notification, toastY]);

  const scoreColor = !p.isCalibrated
    ? c.textMuted
    : p.postureScore >= 90
      ? c.green
      : p.postureScore >= 70
        ? c.accent
        : p.postureScore >= 50
          ? c.amber
          : c.pink;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            backgroundColor: p.notification?.level === 'suggestion' ? c.accent : c.pink,
            transform: [{ translateY: toastY }],
          },
        ]}>
        <Text style={styles.toastText}>{p.notification?.message}</Text>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Connection */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: p.isConnected ? c.green : c.textMuted }]} />
            <Text style={[styles.cardLabel, { color: c.textMuted }]}>
              {p.isConnected ? p.deviceName.toUpperCase() : 'NOT CONNECTED'}
            </Text>
            {p.isDemoMode && (
              <View style={[styles.pill, { backgroundColor: c.surfaceDeep }]}>
                <Text style={[styles.pillText, { color: c.accent }]}>DEMO</Text>
              </View>
            )}
          </View>
          {p.isConnected && (
            <Text style={[styles.sub, { color: c.textMuted, marginTop: 6 }]}>
              {p.firmwareVersion} · {p.batteryPercent}% · {p.lastSyncLabel}
            </Text>
          )}
        </View>

        {!p.isConnected ? (
          <Pressable onPress={p.connect} style={[styles.primaryBtn, { backgroundColor: c.accent }]}>
            <Ionicons name="bluetooth" size={18} color={c.bg} />
            <Text style={[styles.primaryBtnText, { color: c.bg }]}>CONNECT</Text>
          </Pressable>
        ) : (
          <>
            {/* Score */}
            <View style={[styles.scoreCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>
                {p.isCalibrated ? p.postureScore : '--'}
              </Text>
              <Text style={[styles.scoreLabel, { color: c.textPri }]}>{p.postureLabel}</Text>
              {p.isCalibrated && (
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: p.postureGood ? c.green : c.pink },
                  ]}>
                  <Text style={styles.statusPillText}>
                    {p.postureGood ? 'POSTURE OK' : 'ADJUST POSITION'}
                  </Text>
                </View>
              )}
            </View>

            {/* Session stats */}
            <View style={styles.statRow}>
              <Stat label="ELAPSED" value={formatDuration(p.sessionDurationMs)} c={c} />
              <Stat label="SLOUCHES" value={String(p.slouchCount)} c={c} />
              <Stat label="GOAL LEFT" value={formatDuration(p.goalTimeLeftMs)} c={c} />
            </View>

            {/* Hardware check */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardLabel, { color: c.textMuted }]}>SENSOR CHECK</Text>
              <Text style={[styles.sub, { color: c.textPri, marginTop: 6 }]}>
                {p.hardwareCheckMessage}
              </Text>
            </View>

            {/* Session controls */}
            {!p.sessionActive ? (
              <Pressable
                onPress={p.startSession}
                style={[styles.primaryBtn, { backgroundColor: c.accent }]}>
                <Ionicons name="play" size={18} color={c.bg} />
                <Text style={[styles.primaryBtnText, { color: c.bg }]}>START SESSION</Text>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <Pressable
                  onPress={p.isPaused ? p.resumeSession : p.pauseSession}
                  style={[styles.secondaryBtn, { borderColor: c.border, backgroundColor: c.surface }]}>
                  <Ionicons name={p.isPaused ? 'play' : 'pause'} size={18} color={c.textPri} />
                  <Text style={[styles.secondaryBtnText, { color: c.textPri }]}>
                    {p.isPaused ? 'RESUME' : 'PAUSE'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={p.endSession}
                  style={[styles.secondaryBtn, { borderColor: c.pink, backgroundColor: c.surface }]}>
                  <Ionicons name="stop" size={18} color={c.pink} />
                  <Text style={[styles.secondaryBtnText, { color: c.pink }]}>END</Text>
                </Pressable>
              </View>
            )}

            <Pressable onPress={p.disconnect} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: c.textMuted }]}>Disconnect</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: ReturnType<typeof useAppColors>;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.statValue, { color: c.textPri }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  sub: { fontSize: 13 },
  pill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  scoreCard: { borderRadius: 18, borderWidth: 1, padding: 26, alignItems: 'center', gap: 6 },
  scoreValue: { fontSize: 72, fontWeight: '800', letterSpacing: -2 },
  scoreLabel: { fontSize: 15, fontWeight: '600' },
  statusPill: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusPillText: { color: '#04121F', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  linkBtn: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 13 },

  toast: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 10,
    borderRadius: 12,
    padding: 14,
  },
  toastText: { color: '#04121F', fontSize: 13, fontWeight: '600' },
});
