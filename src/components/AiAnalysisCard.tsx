import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SessionRecord } from '@/models/sessionRecord';
import {
  AiAnalysisError,
  analyze,
  buildSessionPrompt,
  getApiKey,
  removeApiKey,
  saveApiKey,
} from '@/services/aiAnalysis';
import { AppColors } from '@/theme/colors';
import { useAppColors } from '@/theme/useAppColors';

/**
 * Optional OpenAI analysis of recent sessions.
 * Ported from lib/widgets/ai_analysis_card.dart — minus the bundled trial key,
 * see src/services/aiAnalysis.ts for why.
 */
export function AiAnalysisCard({ sessions }: { sessions: SessionRecord[] }) {
  const c = useAppColors();

  const [hasKey, setHasKey] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keyDialog, setKeyDialog] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const refreshKey = useCallback(async () => {
    setHasKey((await getApiKey()) !== null);
    setChecking(false);
  }, []);

  useEffect(() => {
    void refreshKey();
  }, [refreshKey]);

  const runAnalysis = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await analyze(sessions));
    } catch (e) {
      setError(
        e instanceof AiAnalysisError
          ? e.message
          : 'The analysis could not be completed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const commitKey = async () => {
    setKeyError(null);
    try {
      await saveApiKey(draftKey);
      setDraftKey('');
      setKeyDialog(false);
      setReveal(false);
      await refreshKey();
    } catch (e) {
      setKeyError(e instanceof AiAnalysisError ? e.message : 'Could not save the key.');
    }
  };

  const forgetKey = async () => {
    await removeApiKey();
    setAnalysis(null);
    setError(null);
    await refreshKey();
  };

  const canAnalyze = hasKey && sessions.length > 0 && !loading;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Ionicons name="sparkles" size={18} color={c.accent} />
        <Text style={[styles.title, { color: c.textPri }]}>AI Session Analysis</Text>
        {hasKey && (
          <View style={[styles.badge, { backgroundColor: c.surfaceDeep }]}>
            <Text style={[styles.badgeText, { color: c.green }]}>KEY SAVED</Text>
          </View>
        )}
      </View>

      <Text style={[styles.body, { color: c.textMuted }]}>
        {hasKey
          ? 'Summarises your recent sessions and suggests what to work on.'
          : 'Bring your own OpenAI key to get a written summary of your recent sessions.'}
      </Text>

      {/* Show exactly what would leave the device, before it does. */}
      {sessions.length > 0 && (
        <Pressable onPress={() => setShowPayload((v) => !v)} style={styles.discloseRow}>
          <Ionicons
            name={showPayload ? 'chevron-down' : 'chevron-forward'}
            size={13}
            color={c.accent}
          />
          <Text style={[styles.discloseText, { color: c.accent }]}>
            {showPayload ? 'Hide' : 'Preview'} what gets sent
          </Text>
        </Pressable>
      )}
      {showPayload && sessions.length > 0 && (
        <ScrollView
          style={[styles.payload, { backgroundColor: c.surfaceDeep, borderColor: c.border }]}
          nestedScrollEnabled>
          <Text style={[styles.payloadText, { color: c.textMuted }]}>
            {buildSessionPrompt(sessions)}
          </Text>
        </ScrollView>
      )}

      {!checking && (
        <Pressable
          onPress={hasKey ? runAnalysis : () => setKeyDialog(true)}
          disabled={hasKey && !canAnalyze}
          style={[
            styles.btn,
            { backgroundColor: hasKey && !canAnalyze ? c.surfaceDeep : c.accent },
          ]}>
          {loading ? (
            <ActivityIndicator size="small" color={c.bg} />
          ) : (
            <Ionicons
              name={hasKey ? 'sparkles' : 'key'}
              size={17}
              color={hasKey && !canAnalyze ? c.textMuted : c.bg}
            />
          )}
          <Text
            style={[
              styles.btnText,
              { color: hasKey && !canAnalyze ? c.textMuted : c.bg },
            ]}>
            {loading
              ? 'ANALYZING…'
              : !hasKey
                ? 'ADD AN OPENAI API KEY'
                : sessions.length === 0
                  ? 'NO SESSIONS TO ANALYZE'
                  : 'ANALYZE WITH AI'}
          </Text>
        </Pressable>
      )}

      {hasKey && (
        <Pressable onPress={forgetKey} style={styles.linkRow}>
          <Text style={[styles.link, { color: c.textMuted }]}>Remove saved key</Text>
        </Pressable>
      )}

      {error && (
        <View style={[styles.msg, { backgroundColor: `${c.pink}1F`, borderColor: `${c.pink}66` }]}>
          <Ionicons name="alert-circle" size={15} color={c.pink} />
          <Text style={[styles.msgText, { color: c.pink }]}>{error}</Text>
        </View>
      )}

      {analysis && (
        <>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Text style={[styles.resultLabel, { color: c.accent }]}>LATEST ANALYSIS</Text>
          <Text selectable style={[styles.result, { color: c.textPri }]}>
            {analysis}
          </Text>
        </>
      )}

      <Text style={[styles.disclaimer, { color: c.textMuted }]}>
        When you tap Analyze, session dates, durations, scores and slouch counts are sent to
        OpenAI and billed to your account. OpenAI may retain API content for abuse monitoring.
        General wellness guidance, not medical advice.
      </Text>

      {/* ── API key dialog ─────────────────────────────────────────────── */}
      <Modal visible={keyDialog} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.dialogTitle, { color: c.textPri }]}>
              Use your OpenAI API key
            </Text>
            <Text style={[styles.dialogBody, { color: c.textMuted }]}>
              1. Visit platform.openai.com/api-keys{'\n'}
              2. Sign in and create a secret key{'\n'}
              3. Paste it below, then tap Save{'\n\n'}
              The key is held in this device&apos;s secure keychain and never leaves it except
              in requests to OpenAI. Usage is billed to your own account.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                value={draftKey}
                onChangeText={setDraftKey}
                secureTextEntry={!reveal}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="sk-…"
                placeholderTextColor={c.textMuted}
                style={[
                  styles.input,
                  { color: c.textPri, backgroundColor: c.surfaceDeep, borderColor: c.border },
                ]}
              />
              <Pressable onPress={() => setReveal((v) => !v)} hitSlop={8} style={styles.eye}>
                <Ionicons name={reveal ? 'eye-off' : 'eye'} size={18} color={c.textMuted} />
              </Pressable>
            </View>

            {keyError && <Text style={[styles.keyError, { color: c.pink }]}>{keyError}</Text>}

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => {
                  setKeyDialog(false);
                  setDraftKey('');
                  setKeyError(null);
                  setReveal(false);
                }}
                style={styles.dialogBtn}>
                <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={commitKey} style={styles.dialogBtn}>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700' },
  badge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  body: { fontSize: 12, lineHeight: 17 },

  discloseRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  discloseText: { fontSize: 11, fontWeight: '600' },
  payload: { maxHeight: 120, borderRadius: 8, borderWidth: 1, padding: 10 },
  payloadText: { fontSize: 10, lineHeight: 15, fontFamily: 'monospace' },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 13,
  },
  btnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },

  linkRow: { alignItems: 'center', paddingVertical: 2 },
  link: { fontSize: 11, textDecorationLine: 'underline' },

  msg: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  msgText: { flex: 1, fontSize: 12, lineHeight: 17 },

  divider: { height: 1, marginTop: 4 },
  resultLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  result: { fontSize: 13, lineHeight: 20 },

  disclaimer: { fontSize: 10, lineHeight: 14 },

  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: { width: '100%', maxWidth: 400, borderRadius: 18, borderWidth: 1, padding: 20, gap: 12 },
  dialogTitle: { fontSize: 16, fontWeight: '700' },
  dialogBody: { fontSize: 12, lineHeight: 18 },
  inputRow: { justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingRight: 42,
    paddingVertical: 10,
    fontSize: 14,
  },
  eye: { position: 'absolute', right: 10 },
  keyError: { fontSize: 11 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
