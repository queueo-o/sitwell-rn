import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomToast } from '@/components/BottomToast';
import { ScoreGauge } from '@/components/ScoreGauge';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';
import { useTabBarHeight } from '@/theme/useTabBarHeight';

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
  const tabBarHeight = useTabBarHeight();

  const [toastId, setToastId] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (p.notification && p.notification.id !== toastId) {
      setToastId(p.notification.id);
      setToastVisible(true);
    }
  }, [p.notification, toastId]);

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
      {p.isConnected ? (
        <Connected c={c} scoreColor={scoreColor} />
      ) : (
        <ConnectGate c={c} />
      )}

      <BottomToast
        visible={toastVisible && p.notification !== null}
        message={p.notification?.message ?? ''}
        tone={p.notification?.level === 'suggestion' ? 'suggestion' : 'warning'}
        onDismiss={() => setToastVisible(false)}
        c={c}
        bottomOffset={tabBarHeight}
      />
    </View>
  );
}

// ── Pre-connection gate ─────────────────────────────────────────────────────

function ConnectGate({ c }: { c: AppColors }) {
  const p = usePosture();
  const connecting = p.connectionState === 'scanning' || p.connectionState === 'connecting';

  return (
    <View style={styles.gate}>
      <Image
        source={require('@/assets/images/sitwell-logo.png')}
        style={styles.gateLogo}
        resizeMode="contain"
      />
      <Text style={[styles.gateTitle, { color: c.textPri }]}>SitWell</Text>
      <Text style={[styles.gateBody, { color: c.textMuted }]}>
        Connect to your posture sensor to start monitoring.
      </Text>

      <View style={[styles.gateCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.gateRow}>
          <Ionicons name="bluetooth" size={16} color={c.accent} />
          <Text style={[styles.gateRowText, { color: c.textMuted }]}>
            Turn the chair unit on and keep it nearby
          </Text>
        </View>
        <View style={styles.gateRow}>
          <Ionicons name="hardware-chip" size={16} color={c.accent} />
          <Text style={[styles.gateRowText, { color: c.textMuted }]}>
            Look for &ldquo;Posture Check BT&rdquo;
          </Text>
        </View>
      </View>

      <Pressable
        onPress={p.connect}
        disabled={connecting}
        style={[styles.primaryBtn, { backgroundColor: connecting ? c.surfaceDeep : c.accent }]}>
        {connecting ? (
          <ActivityIndicator size="small" color={c.textMuted} />
        ) : (
          <Ionicons name="bluetooth" size={18} color={c.bg} />
        )}
        <Text style={[styles.primaryBtnText, { color: connecting ? c.textMuted : c.bg }]}>
          {connecting ? 'SEARCHING…' : 'CONNECT DEVICE'}
        </Text>
      </Pressable>

      {p.connectionError && !p.demoModeEnabled && (
        <Text style={[styles.gateError, { color: c.pink }]}>{p.connectionError}</Text>
      )}

      {p.demoModeEnabled ? (
        <Text style={[styles.gateNote, { color: c.accent }]}>
          Demo mode is on — connecting starts a simulated session.
        </Text>
      ) : (
        !p.bleAvailable && (
          <Text style={[styles.gateNote, { color: c.textMuted }]}>
            Bluetooth needs the development build, so connecting will not find the chair here.
            Turn on Demo mode in Settings to explore the app with simulated data.
          </Text>
        )
      )}
    </View>
  );
}

// ── Connected dashboard ─────────────────────────────────────────────────────

function Connected({ c, scoreColor }: { c: AppColors; scoreColor: string }) {
  const p = usePosture();

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: c.green }]} />
          <Text style={[styles.cardLabel, { color: c.textMuted }]}>
            {p.deviceName.toUpperCase()}
          </Text>
          {p.isDemoMode && (
            <View style={[styles.pill, { backgroundColor: c.surfaceDeep }]}>
              <Text style={[styles.pillText, { color: c.accent }]}>DEMO</Text>
            </View>
          )}
        </View>
        <Text style={[styles.sub, { color: c.textMuted, marginTop: 6 }]}>
          {p.firmwareVersion} · {p.batteryPercent}% · {p.lastSyncLabel}
        </Text>
      </View>

      {/* Score wheel */}
      <View style={[styles.gaugeCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <ScoreGauge
          score={p.postureScore}
          label={p.postureLabel}
          fill={scoreColor}
          c={c}
          calibrated={p.isCalibrated}
        />
        {p.isCalibrated && (
          <View style={[styles.statusPill, { backgroundColor: p.postureGood ? c.green : c.pink }]}>
            <Text style={styles.statusPillText}>
              {p.postureGood ? 'POSTURE OK' : 'ADJUST POSITION'}
            </Text>
          </View>
        )}
      </View>


      <View style={styles.statRow}>
        <Stat label="ELAPSED" value={formatDuration(p.sessionDurationMs)} c={c} />
        <Stat label="SLOUCHES" value={String(p.slouchCount)} c={c} />
        <Stat label="GOAL LEFT" value={formatDuration(p.goalTimeLeftMs)} c={c} />
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.cardLabel, { color: c.textMuted }]}>SENSOR CHECK</Text>
        <Text style={[styles.sub, { color: c.textPri, marginTop: 6 }]}>
          {p.hardwareCheckMessage}
        </Text>
      </View>

      {!p.sessionActive ? (
        <Pressable onPress={p.startSession} style={[styles.primaryBtn, { backgroundColor: c.accent }]}>
          <Ionicons name="play" size={18} color={c.bg} />
          <Text style={[styles.primaryBtnText, { color: c.bg }]}>START SESSION</Text>
        </Pressable>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={p.isPaused ? p.resumeSession : p.pauseSession}
            style={[styles.outlineBtn, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Ionicons name={p.isPaused ? 'play' : 'pause'} size={18} color={c.textPri} />
            <Text style={[styles.outlineBtnText, { color: c.textPri }]}>
              {p.isPaused ? 'RESUME' : 'PAUSE'}
            </Text>
          </Pressable>
          <Pressable
            onPress={p.endSession}
            style={[styles.outlineBtn, { borderColor: c.pink, backgroundColor: c.surface }]}>
            <Ionicons name="stop" size={18} color={c.pink} />
            <Text style={[styles.outlineBtnText, { color: c.pink }]}>END</Text>
          </Pressable>
        </View>
      )}

      {/* Matches the other buttons rather than sitting as a bare link. */}
      <Pressable
        onPress={p.disconnect}
        style={[styles.outlineBtnWide, { borderColor: c.border, backgroundColor: c.surface }]}>
        <Ionicons name="bluetooth" size={17} color={c.textPri} />
        <Text style={[styles.outlineBtnText, { color: c.textPri }]}>DISCONNECT</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.statValue, { color: c.textPri }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  gateLogo: { width: 92, height: 92, borderRadius: 24 },
  gateTitle: { fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  gateBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  gateCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginTop: 6,
  },
  gateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gateRowText: { flex: 1, fontSize: 12.5 },
  gateError: { fontSize: 12, textAlign: 'center' },
  gateNote: { fontSize: 11, textAlign: 'center', lineHeight: 16 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  sub: { fontSize: 13 },
  pill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  gaugeCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
  },
  statusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusPillText: { color: '#04121F', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  primaryBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2 },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  outlineBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});
