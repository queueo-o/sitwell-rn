import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatMinutes } from '@/models/insights';
import { SensorConfig } from '@/models/sensorConfig';
import { usePosture } from '@/state/PostureContext';
import { AppColors } from '@/theme/colors';
import { useThemeMode } from '@/theme/ThemeContext';
import { useAppColors } from '@/theme/useAppColors';

const GOAL_OPTIONS = [30, 45, 60, 90, 120];

export default function SettingsScreen() {
  const c = useAppColors();
  const p = usePosture();
  const theme = useThemeMode();
  const [renaming, setRenaming] = useState<SensorConfig | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const openRename = (s: SensorConfig) => {
    setDraftName(s.displayName);
    setRenaming(s);
  };

  const commitRename = () => {
    const name = draftName.trim();
    if (renaming && name.length > 0) p.saveSensorName(renaming.key, name);
    setRenaming(null);
  };

  const doClear = async () => {
    setConfirmClear(false);
    await p.clearAllData();
    if (Platform.OS !== 'web') Alert.alert('All data cleared.');
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.scroll}>
      {/* ── Device ─────────────────────────────────────────────────────── */}
      <SectionLabel c={c}>DEVICE</SectionLabel>
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: p.isConnected ? `${c.accent}4D` : c.border },
        ]}>
        <View style={styles.deviceHead}>
          <View
            style={[styles.deviceIcon, { backgroundColor: `${c.accent}1F`, borderColor: `${c.accent}66` }]}>
            <Ionicons name="hardware-chip" size={24} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.deviceName, { color: c.textPri }]}>{p.deviceName}</Text>
            <View style={styles.statusRow}>
              <View
                style={[styles.dot, { backgroundColor: p.isConnected ? c.green : c.textMuted }]}
              />
              <Text style={[styles.small, { color: c.textMuted }]}>
                {p.isConnected ? 'Connected' : 'Disconnected'}
              </Text>
              {p.isDemoMode && (
                <Text style={[styles.small, { color: c.accent }]}>· demo</Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.tiny, { color: c.textMuted }]}>Battery</Text>
            <View style={styles.statusRow}>
              <Text style={[styles.deviceName, { color: c.textPri }]}>
                {p.isConnected ? `${p.batteryPercent}%` : '—'}
              </Text>
              <Ionicons
                name="battery-full"
                size={14}
                color={p.isConnected ? c.green : c.textMuted}
              />
            </View>
          </View>
        </View>

        <View style={[styles.kvBox, { backgroundColor: c.surfaceDeep }]}>
          <KvRow c={c} label="Firmware Version" value={p.firmwareVersion} />
          <KvRow c={c} label="Last Sync" value={p.lastSyncLabel} />
          <KvRow
            c={c}
            label="Bluetooth"
            value={p.bleAvailable ? 'Available' : 'Needs dev build'}
          />
        </View>

        <Pressable
          onPress={p.isConnected ? p.disconnect : p.connect}
          style={[styles.outlineBtn, { borderColor: c.border }]}>
          <Text style={[styles.outlineBtnText, { color: c.textPri }]}>
            {p.isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>
      </View>

      {/* ── Session ────────────────────────────────────────────────────── */}
      <SectionLabel c={c}>SESSION</SectionLabel>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.rowTitle, { color: c.textPri }]}>Session Goal</Text>
        <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>
          Target length for a monitoring session
        </Text>
        <View style={styles.chipRow}>
          {GOAL_OPTIONS.map((mins) => {
            const sel = p.sessionGoalMinutes === mins;
            return (
              <Pressable
                key={mins}
                onPress={() => p.saveSessionGoal(mins)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: sel ? `${c.accent}26` : c.surfaceDeep,
                    borderColor: sel ? c.accent : 'transparent',
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: sel ? c.accent : c.textMuted, fontWeight: sel ? '700' : '500' },
                  ]}>
                  {formatMinutes(mins)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      <SectionLabel c={c}>NOTIFICATIONS</SectionLabel>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        <ToggleRow
          c={c}
          title="Posture Reminders"
          subtitle="Alert when slouching is detected"
          value={p.postureReminders}
          onChange={p.savePostureReminders}
        />
        <Divider c={c} />
        <ToggleRow
          c={c}
          title="Session Summaries"
          subtitle="Recap when a session ends"
          value={p.sessionSummaries}
          onChange={p.saveSessionSummaries}
        />
        <Divider c={c} />
        <ToggleRow
          c={c}
          title="Streak Nudges"
          subtitle="Encourage daily consistency"
          value={p.streakNudges}
          onChange={p.saveStreakNudges}
        />
      </View>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <SectionLabel c={c}>APPEARANCE</SectionLabel>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        <View style={styles.row}>
          <Ionicons
            name={theme?.isDark ? 'moon' : 'sunny'}
            size={22}
            color={c.accent}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: c.textPri }]}>Dark Mode</Text>
            <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>
              {theme?.followingSystem
                ? 'Following system setting'
                : theme?.isDark
                  ? 'On'
                  : 'Off — using light theme'}
            </Text>
          </View>
          <Switch
            value={theme?.isDark ?? true}
            onValueChange={() => theme?.toggle()}
            trackColor={{ true: `${c.accent}80`, false: c.border }}
            thumbColor={theme?.isDark ? c.accent : c.textMuted}
          />
        </View>
        {!theme?.followingSystem && (
          <>
            <Divider c={c} />
            <Pressable onPress={() => theme?.useSystem()} style={styles.row}>
              <Ionicons
                name="phone-portrait"
                size={18}
                color={c.textMuted}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.small, { color: c.accent, flex: 1 }]}>
                Follow system setting again
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ── Sensors ────────────────────────────────────────────────────── */}
      <SectionLabel c={c}>SENSORS</SectionLabel>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        {p.sensors.map((s, i) => (
          <View key={s.key}>
            {i > 0 && <Divider c={c} />}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.textPri }]}>{s.displayName}</Text>
                <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>
                  {s.key.toUpperCase()} · {s.hardwareType}
                </Text>
              </View>
              <Pressable onPress={() => openRename(s)} hitSlop={8} style={{ padding: 8 }}>
                <Ionicons name="pencil" size={16} color={c.textMuted} />
              </Pressable>
              <Switch
                value={s.isActive}
                onValueChange={(v) => p.saveSensorActive(s.key, v)}
                trackColor={{ true: `${c.accent}80`, false: c.border }}
                thumbColor={s.isActive ? c.accent : c.textMuted}
              />
            </View>
          </View>
        ))}
      </View>

      {/* ── Privacy & data ─────────────────────────────────────────────── */}
      <SectionLabel c={c}>PRIVACY &amp; DATA</SectionLabel>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        <InfoRow
          c={c}
          icon="server"
          title="Data stored on device"
          subtitle="Session history and settings never leave your phone"
        />
        <Divider c={c} />
        <InfoRow
          c={c}
          icon="bluetooth"
          title="Sensor data is local"
          subtitle="Readings are received over Bluetooth and not uploaded"
        />
        <Divider c={c} />
        <InfoRow
          c={c}
          icon="sparkles"
          title="Optional OpenAI analysis"
          subtitle="Session summaries are sent only when you tap Analyze on Insights"
        />
        <Divider c={c} />
        <InfoRow
          c={c}
          icon="key"
          title="Your API key"
          subtitle="Held in this device's secure keychain; removed by Clear All Data"
        />
        <Divider c={c} />
        <View style={styles.row}>
          <Ionicons name="trash" size={18} color={c.pink} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: c.pink }]}>Clear All Data</Text>
            <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>
              Erase session history and reset all settings
            </Text>
          </View>
          <Pressable onPress={() => setConfirmClear(true)} hitSlop={8} style={{ padding: 8 }}>
            <Text style={[styles.clearBtn, { color: c.pink }]}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Rename dialog ──────────────────────────────────────────────── */}
      <Modal visible={renaming !== null} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.dialogTitle, { color: c.textPri }]}>Rename sensor</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              maxLength={16}
              placeholder="Sensor name"
              placeholderTextColor={c.textMuted}
              style={[
                styles.input,
                { color: c.textPri, backgroundColor: c.surfaceDeep, borderColor: c.border },
              ]}
            />
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setRenaming(null)} style={styles.dialogBtn}>
                <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={commitRename} style={styles.dialogBtn}>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Clear confirmation ─────────────────────────────────────────── */}
      <Modal visible={confirmClear} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.dialogTitle, { color: c.textPri }]}>Clear All Data?</Text>
            <Text style={[styles.small, { color: c.textMuted, lineHeight: 19 }]}>
              This will erase all session history and reset every setting to its default. This
              cannot be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setConfirmClear(false)} style={styles.dialogBtn}>
                <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={doClear} style={styles.dialogBtn}>
                <Text style={{ color: c.pink, fontWeight: '700' }}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function SectionLabel({ children, c }: { children: string; c: AppColors }) {
  return <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{children}</Text>;
}

function Divider({ c }: { c: AppColors }) {
  return <View style={[styles.divider, { backgroundColor: c.border }]} />;
}

function KvRow({ c, label, value }: { c: AppColors; label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.small, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.small, { color: c.textPri, fontWeight: '500' }]}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  c,
  title,
  subtitle,
  value,
  onChange,
}: {
  c: AppColors;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: c.textPri }]}>{title}</Text>
        <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: `${c.accent}80`, false: c.border }}
        thumbColor={value ? c.accent : c.textMuted}
      />
    </View>
  );
}

function InfoRow({
  c,
  icon,
  title,
  subtitle,
}: {
  c: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={c.textMuted} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: c.textPri }]}>{title}</Text>
        <Text style={[styles.small, { color: c.textMuted, marginTop: 3 }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 2, marginTop: 14 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12 },
  tiny: { fontSize: 10 },
  divider: { height: 1, marginHorizontal: 14 },

  deviceHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceName: { fontSize: 15, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  kvBox: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16, gap: 8 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between' },

  outlineBtn: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  outlineBtnText: { fontSize: 14, fontWeight: '500' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  chipText: { fontSize: 13 },

  clearBtn: { fontSize: 13, fontWeight: '700' },

  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  dialogTitle: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
