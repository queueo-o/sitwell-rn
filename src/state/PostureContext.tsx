/**
 * Ported from lib/providers/posture_provider.dart
 *
 * Flutter's ChangeNotifier becomes a React context. Private fields are either
 * state (drives re-render) or refs (timers and transient tracking that must
 * not trigger renders).
 *
 * Two runtime paths share this state:
 *   demo      — simulated sensors, works everywhere including Expo Go
 *   hardware  — BLE via react-native-ble-plx, needs the development build
 *
 * The hardware path is command-driven: the board answers 'c' (calibrate),
 * 's' (status) and 'r' (reset) rather than streaming, so a 3s poll keeps the
 * sensor map live while a session runs.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  HardwareCheckState,
  Readings,
  SENSOR_KEYS,
  connectedSensors,
  invalidSensors,
} from '../models/hardwareCheck';
import { SensorConfig, defaultSensors, deviationThreshold } from '../models/sensorConfig';
import {
  SessionRecord,
  nameForHour,
  seedSessions,
  trendFromDelta,
} from '../models/sessionRecord';
import { removeApiKey } from '../services/aiAnalysis';
import { bleService } from '../services/bleService';
import { ProtocolEvent, ProtocolParser } from '../services/postureProtocol';
import { KEYS, clearStored, loadJson, saveJson } from '../services/storage';

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

export type NotificationLevel = 'warning' | 'suggestion';

export interface PostureNotification {
  id: number;
  message: string;
  level: NotificationLevel;
}

const SLOUCH_SUGGEST_THRESHOLD_MS = 60_000;
const READINGS_POLL_MS = 3_000;
const FRAME_TIMEOUT_MS = 4_000;
const ALERT_CLEAR_MS = 5_000;
const HARDWARE_CHECK_IDLE = 'Run a sensor check before calibrating.';

interface PostureState {
  connectionState: ConnectionState;
  demoMode: boolean;
  lastLineAt: Date | null;

  sensors: SensorConfig[];

  isCalibrated: boolean;
  isCalibrating: boolean;
  calibrationProgress: number;
  calibrationLog: string[];
  baselines: Record<string, number>;

  postureGood: boolean;
  alerts: string[];
  readings: Readings;
  sessionMin: Readings;
  sessionMax: Readings;

  sessionStart: Date | null;
  sessionWallStart: Date | null;
  sessionActive: boolean;
  slouchCount: number;
  sessionGoalMinutes: number;
  isPaused: boolean;
  pausedAtMs: number;

  postureReminders: boolean;
  sessionSummaries: boolean;
  streakNudges: boolean;

  hardwareCheckState: HardwareCheckState;
  hardwareCheckMessage: string;

  sessionHistory: SessionRecord[];
}

function initialState(): PostureState {
  return {
    connectionState: 'disconnected',
    demoMode: false,
    lastLineAt: null,

    sensors: defaultSensors(),

    isCalibrated: false,
    isCalibrating: false,
    calibrationProgress: 0,
    calibrationLog: [],
    baselines: {},

    postureGood: true,
    alerts: [],
    readings: {},
    sessionMin: {},
    sessionMax: {},

    sessionStart: null,
    sessionWallStart: null,
    sessionActive: false,
    slouchCount: 0,
    sessionGoalMinutes: 60,
    isPaused: false,
    pausedAtMs: 0,

    postureReminders: true,
    sessionSummaries: true,
    streakNudges: false,

    hardwareCheckState: 'notRun',
    hardwareCheckMessage: HARDWARE_CHECK_IDLE,

    sessionHistory: seedSessions(),
  };
}

// ── Persistence ─────────────────────────────────────────────────────────────

interface PersistedPrefs {
  sessionGoalMinutes: number;
  postureReminders: boolean;
  sessionSummaries: boolean;
  streakNudges: boolean;
  sensors: { key: string; displayName: string; isActive: boolean }[];
}

/** SessionRecord with startedAt flattened to an ISO string for JSON. */
type StoredSession = Omit<SessionRecord, 'startedAt'> & { startedAt: string };

function toStored(s: SessionRecord): StoredSession {
  return { ...s, startedAt: s.startedAt.toISOString() };
}

function fromStored(s: StoredSession): SessionRecord {
  return { ...s, startedAt: new Date(s.startedAt) };
}

// ── Derived helpers ─────────────────────────────────────────────────────────

function computePostureScore(s: PostureState): number {
  if (!s.isCalibrated) return 0;
  const active = s.sensors.filter((x) => x.isActive);
  if (active.length === 0) return 100;

  let totalDev = 0;
  let count = 0;
  for (const sensor of active) {
    const r = s.readings[sensor.key];
    const b = s.baselines[sensor.key];
    if (r !== undefined && b !== undefined && b > 0) {
      totalDev += Math.abs(((r - b) / b) * 100);
      count++;
    }
  }
  if (count === 0) return 100;
  return Math.round(100 - Math.min(Math.max(totalDev / count, 0), 100));
}

function postureLabelFor(s: PostureState, score: number): string {
  if (!s.isCalibrated) return 'Not calibrated';
  if (score >= 90) return 'Excellent alignment';
  if (score >= 70) return 'Good posture';
  if (score >= 50) return 'Fair posture';
  return 'Poor posture';
}

/** Compare streamed readings with baselines; returns the alert strings. */
function evaluateHardwareAlerts(s: PostureState): string[] {
  const alerts: string[] = [];
  for (const sensor of s.sensors) {
    if (!sensor.isActive) continue;
    const reading = s.readings[sensor.key];
    const baseline = s.baselines[sensor.key];
    if (reading === undefined || baseline === undefined || baseline <= 0) continue;

    const change = (reading - baseline) / baseline;
    const limit = deviationThreshold(sensor.hardwareType);
    // Extra headroom upward: leaning in loads a sensor far more than lifting off it.
    if (change > limit * 1.5 || change < -limit) {
      const direction = change > 0 ? 'increased' : 'decreased';
      alerts.push(
        `${sensor.displayName}: pressure ${direction} by ${Math.round(Math.abs(change) * 100)}%`,
      );
    }
  }
  return alerts;
}

// ── Context shape ───────────────────────────────────────────────────────────

interface PostureContextValue extends PostureState {
  isConnected: boolean;
  isDemoMode: boolean;
  bleAvailable: boolean;
  /** False until stored preferences have been read back. */
  hydrated: boolean;
  connectionError: string | null;
  postureScore: number;
  postureLabel: string;
  canCalibrate: boolean;
  sessionDurationMs: number;
  goalTimeLeftMs: number;
  lastSyncLabel: string;
  deviceName: string;
  firmwareVersion: string;
  batteryPercent: number;
  notification: PostureNotification | null;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableDemoMode: (connectedSensorCount?: number) => void;
  startSession: () => void;
  endSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  runHardwareCheck: () => Promise<void>;
  calibrate: () => Promise<void>;
  resetCalibration: () => Promise<void>;
  saveSensorName: (key: string, name: string) => void;
  saveSensorActive: (key: string, active: boolean) => void;
  saveSessionGoal: (minutes: number) => void;
  savePostureReminders: (v: boolean) => void;
  saveSessionSummaries: (v: boolean) => void;
  saveStreakNudges: (v: boolean) => void;
  clearAllData: () => Promise<void>;
  removeSession: (id: number) => void;
  restoreSession: (session: SessionRecord) => void;
}

const PostureContext = createContext<PostureContextValue | null>(null);

export function usePosture(): PostureContextValue {
  const ctx = useContext(PostureContext);
  if (!ctx) throw new Error('usePosture must be used inside <PostureProvider>');
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

export function PostureProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PostureState>(initialState);
  const [notification, setNotification] = useState<PostureNotification | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);

  // Latest state, readable from async flows without stale closures.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const demoLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readingsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoInSlouch = useRef(false);
  const demoSlouchTicksLeft = useRef(0);
  const postureBadSince = useRef<Date | null>(null);
  const recalibrateSuggested = useRef(false);
  const notificationId = useRef(0);

  // Hardware-check frame tracking (Flutter used a Completer).
  const parserRef = useRef(new ProtocolParser());
  const frameKeysRef = useRef<Set<string>>(new Set());
  const frameResolveRef = useRef<(() => void) | null>(null);
  const pendingAlertsRef = useRef<string[]>([]);

  const bleAvailable = useMemo(() => bleService.isAvailable(), []);

  const emit = useCallback((message: string, level: NotificationLevel) => {
    notificationId.current += 1;
    setNotification({ id: notificationId.current, message, level });
  }, []);

  const stopDemoLoop = useCallback(() => {
    if (demoLoopRef.current) clearInterval(demoLoopRef.current);
    demoLoopRef.current = null;
    demoInSlouch.current = false;
    demoSlouchTicksLeft.current = 0;
  }, []);

  const stopReadingsPoll = useCallback(() => {
    if (readingsPollRef.current) clearInterval(readingsPollRef.current);
    readingsPollRef.current = null;
  }, []);

  const startReadingsPoll = useCallback(() => {
    stopReadingsPoll();
    readingsPollRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s.demoMode && s.connectionState === 'connected' && s.isCalibrated) {
        void bleService.sendCommand('s');
      }
    }, READINGS_POLL_MS);
  }, [stopReadingsPoll]);

  /**
   * Shared by demo and BLE paths: tracks good→bad transitions, counts slouches
   * and fires notifications. Mutates `next` in place.
   */
  const applyPostureState = useCallback(
    (next: PostureState, badNow: boolean) => {
      if (next.isPaused) return;
      const wasBad = !next.postureGood;
      next.postureGood = !badNow;

      if (badNow && !wasBad) {
        next.slouchCount += 1;
        postureBadSince.current = new Date();
        recalibrateSuggested.current = false;
        emit('Bad posture detected — adjust your sitting position.', 'warning');
      } else if (!badNow && wasBad) {
        postureBadSince.current = null;
        recalibrateSuggested.current = false;
      } else if (badNow) {
        if (!postureBadSince.current) postureBadSince.current = new Date();
        const elapsed = Date.now() - postureBadSince.current.getTime();
        if (!recalibrateSuggested.current && elapsed >= SLOUCH_SUGGEST_THRESHOLD_MS) {
          recalibrateSuggested.current = true;
          emit(
            'Still slouching? Your original calibration may be off — try re-calibrating.',
            'suggestion',
          );
        }
      }
    },
    [emit],
  );

  const scheduleAlertClear = useCallback(() => {
    if (alertClearRef.current) clearTimeout(alertClearRef.current);
    alertClearRef.current = setTimeout(() => {
      setState((prev) => {
        const next = { ...prev, alerts: [] };
        applyPostureState(next, false);
        return next;
      });
    }, ALERT_CLEAR_MS);
  }, [applyPostureState]);

  // ── BLE wiring ────────────────────────────────────────────────────────────

  const handleProtocolEvent = useCallback(
    (ev: ProtocolEvent) => {
      switch (ev.type) {
        case 'reading':
          setState((prev) => {
            const readings = { ...prev.readings, [ev.key]: ev.value };
            const sessionMin = {
              ...prev.sessionMin,
              [ev.key]: Math.min(prev.sessionMin[ev.key] ?? ev.value, ev.value),
            };
            const sessionMax = {
              ...prev.sessionMax,
              [ev.key]: Math.max(prev.sessionMax[ev.key] ?? ev.value, ev.value),
            };
            return { ...prev, readings, sessionMin, sessionMax };
          });
          frameKeysRef.current.add(ev.key);
          if (frameKeysRef.current.size >= SENSOR_KEYS.length) {
            frameResolveRef.current?.();
            frameResolveRef.current = null;
          }
          break;

        case 'readingsBlockEnd':
          frameResolveRef.current?.();
          frameResolveRef.current = null;
          frameKeysRef.current.clear();
          setState((prev) => {
            if (!prev.isCalibrated || !prev.sessionActive || prev.isPaused) return prev;
            const alerts = evaluateHardwareAlerts(prev);
            const next = { ...prev, alerts };
            applyPostureState(next, alerts.length > 0);
            return next;
          });
          break;

        case 'calibrationStarted':
          setState((prev) => ({
            ...prev,
            isCalibrating: true,
            isCalibrated: false,
            calibrationProgress: 0,
            calibrationLog: [],
            baselines: {},
          }));
          break;

        case 'calibrationProgress':
          setState((prev) => ({
            ...prev,
            calibrationProgress: ev.progress,
            calibrationLog: [...prev.calibrationLog, ev.line],
          }));
          break;

        case 'calibrationComplete':
          setState((prev) => {
            if (!prev.demoMode && prev.sessionActive && !prev.isPaused) startReadingsPoll();
            return { ...prev, isCalibrating: false, isCalibrated: true, calibrationProgress: 1 };
          });
          break;

        case 'calibrationError':
          setState((prev) => ({
            ...prev,
            isCalibrating: false,
            isCalibrated: false,
            calibrationProgress: 0,
            hardwareCheckState: 'failed',
            hardwareCheckMessage: 'Calibration error — check sensor contact and retry.',
          }));
          break;

        case 'baseline':
          setState((prev) => ({
            ...prev,
            baselines: { ...prev.baselines, [ev.key]: ev.value },
          }));
          break;

        case 'calibrationReset':
          stopReadingsPoll();
          setState((prev) => ({
            ...prev,
            isCalibrated: false,
            baselines: {},
            readings: {},
          }));
          break;

        case 'postureOk':
          if (alertClearRef.current) clearTimeout(alertClearRef.current);
          pendingAlertsRef.current = [];
          setState((prev) => {
            const next = { ...prev, alerts: [] };
            applyPostureState(next, false);
            return next;
          });
          break;

        case 'postureAlert':
          pendingAlertsRef.current = [];
          setState((prev) => {
            const next = { ...prev };
            applyPostureState(next, true);
            return next;
          });
          break;

        case 'alertDetail':
          setState((prev) => {
            const sensor = ev.key ? prev.sensors.find((s) => s.key === ev.key) : undefined;
            if (sensor && !sensor.isActive) return prev;
            const text =
              sensor && ev.direction && ev.percent !== undefined
                ? `${sensor.displayName}: pressure ${ev.direction} by ${ev.percent}%`
                : sensor
                  ? `${sensor.displayName}: ${ev.raw}`
                  : ev.raw;
            pendingAlertsRef.current = [...pendingAlertsRef.current, text];
            return { ...prev, alerts: [...pendingAlertsRef.current] };
          });
          scheduleAlertClear();
          break;

        case 'log':
          setState((prev) => ({
            ...prev,
            calibrationLog: [...prev.calibrationLog, ev.line],
          }));
          break;
      }
    },
    [applyPostureState, scheduleAlertClear, startReadingsPoll, stopReadingsPoll],
  );

  useEffect(() => {
    if (!bleAvailable) return;

    const offState = bleService.onStateChange((s) => {
      setState((prev) => {
        if (s === 'connected') {
          return {
            ...prev,
            connectionState: s,
            sessionStart: new Date(),
            slouchCount: 0,
            sessionMin: {},
            sessionMax: {},
          };
        }
        if (s === 'disconnected') {
          return {
            ...prev,
            connectionState: s,
            isCalibrating: false,
            sessionActive: false,
            sessionStart: null,
            sessionWallStart: null,
            slouchCount: 0,
            lastLineAt: null,
            hardwareCheckState: 'notRun',
            hardwareCheckMessage: HARDWARE_CHECK_IDLE,
          };
        }
        return { ...prev, connectionState: s };
      });

      if (s === 'disconnected') {
        stopReadingsPoll();
        parserRef.current.reset();
        frameKeysRef.current.clear();
        frameResolveRef.current?.();
        frameResolveRef.current = null;
      }
    });

    const offLine = bleService.onLine((line) => {
      setState((prev) => ({ ...prev, lastLineAt: new Date() }));
      for (const ev of parserRef.current.parse(line)) handleProtocolEvent(ev);
    });

    return () => {
      offState();
      offLine();
    };
  }, [bleAvailable, handleProtocolEvent, stopReadingsPoll]);

  // ── Demo simulation ───────────────────────────────────────────────────────

  const startDemoLoop = useCallback(() => {
    stopDemoLoop();
    demoLoopRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.demoMode || prev.isPaused) return prev;

        if (demoInSlouch.current) {
          demoSlouchTicksLeft.current -= 1;
          if (demoSlouchTicksLeft.current <= 0) demoInSlouch.current = false;
        } else if (Math.random() < 0.25) {
          demoInSlouch.current = true;
          demoSlouchTicksLeft.current = 5 + Math.floor(Math.random() * 36);
        }

        const readings = { ...prev.readings };
        const sessionMin = { ...prev.sessionMin };
        const sessionMax = { ...prev.sessionMax };

        for (const sensor of prev.sensors) {
          if (!sensor.isActive) continue;
          const baseline = prev.baselines[sensor.key];
          if (baseline === undefined) continue;

          // Scale off each sensor's real threshold so the demo stays correct
          // if thresholds change.
          const limit = deviationThreshold(sensor.hardwareType) * 100;
          let devPct: number;
          if (demoInSlouch.current) {
            const sign = Math.random() < 0.5 ? 1 : -1;
            devPct =
              sign *
              (Math.random() < 0.7
                ? limit * 1.1 + Math.random() * limit * 0.5
                : limit * 0.6 + Math.random() * limit * 0.35);
          } else {
            devPct = -2 + Math.random() * 4;
          }

          const r = Math.round(baseline * (1 + devPct / 100));
          readings[sensor.key] = r;
          sessionMin[sensor.key] = Math.min(sessionMin[sensor.key] ?? r, r);
          sessionMax[sensor.key] = Math.max(sessionMax[sensor.key] ?? r, r);
        }

        const next: PostureState = { ...prev, readings, sessionMin, sessionMax };

        let anyBad = false;
        for (const sensor of next.sensors) {
          if (!sensor.isActive) continue;
          const r = next.readings[sensor.key];
          const b = next.baselines[sensor.key];
          if (r === undefined || b === undefined || b <= 0) continue;
          if (Math.abs((r - b) / b) >= deviationThreshold(sensor.hardwareType)) {
            anyBad = true;
            break;
          }
        }
        applyPostureState(next, anyBad);
        return next;
      });
    }, 2000);
  }, [applyPostureState, stopDemoLoop]);

  const populateDemoCalibration = useCallback((prev: PostureState): PostureState => {
    const baselines: Record<string, number> = {};
    const readings: Readings = {};
    const sessionMin: Readings = {};
    const sessionMax: Readings = {};

    for (const sensor of prev.sensors) {
      if (!sensor.isActive) continue;
      let b: number;
      switch (sensor.hardwareType) {
        case 'velostat':
          b = 550 + Math.floor(Math.random() * 200);
          break;
        case 'square':
          b = 450 + Math.floor(Math.random() * 300);
          break;
        default:
          b = 300 + Math.floor(Math.random() * 200);
      }
      const r = Math.round(b * (1 + (-1 + Math.random() * 2) / 100));
      baselines[sensor.key] = b;
      readings[sensor.key] = r;
      sessionMin[sensor.key] = r;
      sessionMax[sensor.key] = r;
    }
    return { ...prev, baselines, readings, sessionMin, sessionMax };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const enableDemoMode = useCallback((connectedSensorCount = 6) => {
    setState((prev) => {
      const activeCount = Math.min(Math.max(connectedSensorCount, 1), prev.sensors.length);
      return {
        ...prev,
        sensors: prev.sensors.map((s, i) => ({ ...s, isActive: i < activeCount })),
        demoMode: true,
        isCalibrated: false,
        isCalibrating: false,
        isPaused: false,
        pausedAtMs: 0,
        postureGood: true,
        slouchCount: 0,
        sessionActive: false,
        sessionStart: null,
        sessionWallStart: null,
        hardwareCheckState: 'notRun',
        hardwareCheckMessage: HARDWARE_CHECK_IDLE,
        lastLineAt: new Date(),
        baselines: {},
        readings: {},
        sessionMin: {},
        sessionMax: {},
      };
    });
  }, []);

  const connect = useCallback(async () => {
    // Checked live rather than via the memo: if the manager failed to start at
    // any point the service latches unavailable, and demo is the usable path.
    if (!bleService.isAvailable()) {
      enableDemoMode();
      return;
    }
    await bleService.startScan();
  }, [enableDemoMode]);

  const disconnect = useCallback(async () => {
    stopDemoLoop();
    stopReadingsPoll();
    postureBadSince.current = null;
    recalibrateSuggested.current = false;

    if (stateRef.current.demoMode) {
      setState((prev) => ({
        ...initialState(),
        sensors: prev.sensors,
        sessionHistory: prev.sessionHistory,
        sessionGoalMinutes: prev.sessionGoalMinutes,
      }));
      return;
    }
    await bleService.disconnect();
  }, [stopDemoLoop, stopReadingsPoll]);

  const runHardwareCheck = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      hardwareCheckState: 'checking',
      hardwareCheckMessage: 'Reading connected sensors…',
    }));

    if (stateRef.current.demoMode) {
      await new Promise((r) => setTimeout(r, 1200));
      setState((prev) => {
        const activeCount = prev.sensors.filter((s) => s.isActive).length;
        return {
          ...prev,
          hardwareCheckState: 'passed',
          hardwareCheckMessage: `${activeCount} demo sensor${activeCount === 1 ? '' : 's'} active.`,
        };
      });
      return;
    }

    // Hardware: ask for one readings frame and wait for the parser to fill it.
    setState((prev) => ({ ...prev, readings: {} }));
    frameKeysRef.current.clear();

    const framePromise = new Promise<void>((resolve) => {
      frameResolveRef.current = resolve;
    });
    await bleService.sendCommand('s');
    await Promise.race([
      framePromise,
      new Promise((r) => setTimeout(r, FRAME_TIMEOUT_MS)),
    ]);
    frameResolveRef.current = null;

    setState((prev) => {
      const invalid = invalidSensors(prev.readings);
      const connected = connectedSensors(prev.readings);
      const sensors = prev.sensors.map((s) => ({ ...s, isActive: connected.includes(s.key) }));

      if (invalid.length > 0) {
        const names = invalid
          .map((k) => prev.sensors.find((s) => s.key === k)?.displayName ?? k.toUpperCase())
          .join(', ');
        return {
          ...prev,
          sensors,
          hardwareCheckState: 'failed',
          hardwareCheckMessage: `Invalid sensor reading: ${names}.`,
        };
      }
      if (connected.length > 0) {
        return {
          ...prev,
          sensors,
          hardwareCheckState: 'passed',
          hardwareCheckMessage: `${connected.length} connected sensor${
            connected.length === 1 ? '' : 's'
          } active.`,
        };
      }
      return {
        ...prev,
        sensors,
        hardwareCheckState: 'failed',
        hardwareCheckMessage:
          Object.keys(prev.readings).length === 0
            ? 'No sensor data received. Check the firmware and retry.'
            : 'No connected sensors detected. Check the wiring and retry.',
      };
    });
  }, []);

  const startSession = useCallback(() => {
    setState((prev) => {
      if (prev.sessionActive) return prev;
      const now = new Date();
      return {
        ...prev,
        sessionActive: true,
        sessionStart: now,
        sessionWallStart: now,
        isPaused: false,
        pausedAtMs: 0,
        slouchCount: 0,
        postureGood: true,
        sessionMin: {},
        sessionMax: {},
      };
    });
    postureBadSince.current = null;
    recalibrateSuggested.current = false;
    void runHardwareCheck();
  }, [runHardwareCheck]);

  const endSession = useCallback(() => {
    stopDemoLoop();
    stopReadingsPoll();
    setState((prev) => {
      if (!prev.sessionActive) return prev;

      const startedAt = prev.sessionStart ?? prev.sessionWallStart ?? new Date();
      const wallMs = prev.sessionWallStart ? Date.now() - prev.sessionWallStart.getTime() : 0;
      const activeMs = prev.isPaused
        ? prev.pausedAtMs
        : prev.sessionStart
          ? Date.now() - prev.sessionStart.getTime()
          : 0;
      const pausedMs = Math.max(wallMs - activeMs, 0);
      const prevScore = prev.sessionHistory[0]?.score;
      const score = prev.isCalibrated ? computePostureScore(prev) : 0;

      const record: SessionRecord = {
        id: Date.now(),
        name: nameForHour(startedAt.getHours()),
        startedAt,
        durationMs: wallMs,
        pausedDurationMs: pausedMs,
        score,
        slouches: prev.slouchCount,
        trend: trendFromDelta(score, prevScore),
      };

      return {
        ...prev,
        sessionHistory: [record, ...prev.sessionHistory],
        sessionActive: false,
        isPaused: false,
        pausedAtMs: 0,
        sessionStart: null,
        sessionWallStart: null,
        slouchCount: 0,
        postureGood: true,
        hardwareCheckState: 'notRun',
        hardwareCheckMessage: HARDWARE_CHECK_IDLE,
      };
    });
    postureBadSince.current = null;
    recalibrateSuggested.current = false;
  }, [stopDemoLoop, stopReadingsPoll]);

  const pauseSession = useCallback(() => {
    stopDemoLoop();
    stopReadingsPoll();
    setState((prev) => {
      if (prev.isPaused) return prev;
      return {
        ...prev,
        pausedAtMs: prev.sessionStart ? Date.now() - prev.sessionStart.getTime() : 0,
        isPaused: true,
      };
    });
    postureBadSince.current = null;
    recalibrateSuggested.current = false;
  }, [stopDemoLoop, stopReadingsPoll]);

  const resumeSession = useCallback(() => {
    setState((prev) => {
      if (!prev.isPaused) return prev;
      return { ...prev, sessionStart: new Date(Date.now() - prev.pausedAtMs), isPaused: false };
    });
    const s = stateRef.current;
    if (s.demoMode && s.isCalibrated) startDemoLoop();
    if (!s.demoMode && s.isCalibrated) startReadingsPoll();
  }, [startDemoLoop, startReadingsPoll]);

  const calibrate = useCallback(async () => {
    const s = stateRef.current;

    if (!s.demoMode) {
      if (s.isCalibrating || s.hardwareCheckState !== 'passed') return;
      // The board runs calibration itself and reports progress over UART.
      await bleService.sendCommand('c');
      return;
    }

    stopDemoLoop();
    setState((prev) => ({
      ...prev,
      isPaused: false,
      sessionStart: prev.isPaused ? new Date(Date.now() - prev.pausedAtMs) : prev.sessionStart,
      isCalibrating: true,
      calibrationProgress: 0,
      isCalibrated: false,
      postureGood: true,
      slouchCount: 0,
      baselines: {},
      readings: {},
      sessionMin: {},
      sessionMax: {},
    }));
    postureBadSince.current = null;
    recalibrateSuggested.current = false;

    for (let pct = 20; pct <= 100; pct += 20) {
      await new Promise((r) => setTimeout(r, 600));
      setState((prev) => ({ ...prev, calibrationProgress: pct / 100 }));
    }

    setState((prev) => ({
      ...populateDemoCalibration(prev),
      isCalibrating: false,
      isCalibrated: true,
    }));
    startDemoLoop();
  }, [populateDemoCalibration, startDemoLoop, stopDemoLoop]);

  const resetCalibration = useCallback(async () => {
    stopDemoLoop();
    stopReadingsPoll();
    setState((prev) => ({
      ...prev,
      isCalibrated: false,
      isCalibrating: false,
      calibrationProgress: 0,
      calibrationLog: [],
      baselines: {},
      readings: {},
      sessionMin: {},
      sessionMax: {},
      alerts: [],
      postureGood: true,
    }));
    postureBadSince.current = null;
    recalibrateSuggested.current = false;

    if (!stateRef.current.demoMode) await bleService.sendCommand('r');
  }, [stopDemoLoop, stopReadingsPoll]);

  const saveSensorName = useCallback((key: string, name: string) => {
    setState((prev) => ({
      ...prev,
      sensors: prev.sensors.map((s) => (s.key === key ? { ...s, displayName: name } : s)),
    }));
  }, []);

  const saveSensorActive = useCallback((key: string, active: boolean) => {
    setState((prev) => ({
      ...prev,
      sensors: prev.sensors.map((s) => (s.key === key ? { ...s, isActive: active } : s)),
    }));
  }, []);

  const saveSessionGoal = useCallback((minutes: number) => {
    setState((prev) => ({ ...prev, sessionGoalMinutes: minutes }));
  }, []);

  const savePostureReminders = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, postureReminders: v }));
  }, []);

  const saveSessionSummaries = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, sessionSummaries: v }));
  }, []);

  const saveStreakNudges = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, streakNudges: v }));
  }, []);

  /** Wipes history and returns every setting to its default. Not undoable. */
  const clearAllData = useCallback(async () => {
    stopDemoLoop();
    stopReadingsPoll();
    if (alertClearRef.current) clearTimeout(alertClearRef.current);
    postureBadSince.current = null;
    recalibrateSuggested.current = false;
    parserRef.current.reset();
    frameKeysRef.current.clear();

    if (bleService.isAvailable()) await bleService.disconnect();

    await clearStored();
    // Mirrors AiAnalysisProvider.clearPrivateData() — the OpenAI key lives in
    // the keychain, not AsyncStorage, so clearStored() alone would leave it.
    await removeApiKey();
    // sessionHistory: [] rather than the seeds — and the save effect writes
    // that empty array back, so a restart stays cleared.
    setState(() => ({ ...initialState(), sessionHistory: [] }));
  }, [stopDemoLoop, stopReadingsPoll]);

  const removeSession = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      sessionHistory: prev.sessionHistory.filter((s) => s.id !== id),
    }));
  }, []);

  const restoreSession = useCallback((session: SessionRecord) => {
    setState((prev) => ({
      ...prev,
      sessionHistory: [...prev.sessionHistory, session].sort(
        (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
      ),
    }));
  }, []);

  // ── Hydrate from storage, then keep it in sync ────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prefs, history] = await Promise.all([
        loadJson<PersistedPrefs>(KEYS.prefs),
        loadJson<StoredSession[]>(KEYS.history),
      ]);
      if (cancelled) return;

      setState((prev) => {
        const next = { ...prev };
        if (prefs) {
          next.sessionGoalMinutes = prefs.sessionGoalMinutes ?? prev.sessionGoalMinutes;
          next.postureReminders = prefs.postureReminders ?? prev.postureReminders;
          next.sessionSummaries = prefs.sessionSummaries ?? prev.sessionSummaries;
          next.streakNudges = prefs.streakNudges ?? prev.streakNudges;
          if (Array.isArray(prefs.sensors)) {
            // Merge by key so a firmware change that adds or renames a sensor
            // slot doesn't resurrect stale entries.
            next.sensors = prev.sensors.map((s) => {
              const saved = prefs.sensors.find((x) => x.key === s.key);
              return saved
                ? { ...s, displayName: saved.displayName, isActive: saved.isActive }
                : s;
            });
          }
        }
        // null means "never stored" → keep the seeds. An empty array is a real
        // value (the user cleared their data) and must be respected.
        if (history) next.sessionHistory = history.map(fromStored);
        return next;
      });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveJson(KEYS.prefs, {
      sessionGoalMinutes: state.sessionGoalMinutes,
      postureReminders: state.postureReminders,
      sessionSummaries: state.sessionSummaries,
      streakNudges: state.streakNudges,
      sensors: state.sensors.map((s) => ({
        key: s.key,
        displayName: s.displayName,
        isActive: s.isActive,
      })),
    } satisfies PersistedPrefs);
  }, [
    hydrated,
    state.sessionGoalMinutes,
    state.postureReminders,
    state.sessionSummaries,
    state.streakNudges,
    state.sensors,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    void saveJson(KEYS.history, state.sessionHistory.map(toStored));
  }, [hydrated, state.sessionHistory]);

  // Re-render once a second so the session clock ticks.
  useEffect(() => {
    if (!state.sessionActive || state.isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.sessionActive, state.isPaused]);

  useEffect(
    () => () => {
      stopDemoLoop();
      stopReadingsPoll();
      if (alertClearRef.current) clearTimeout(alertClearRef.current);
    },
    [stopDemoLoop, stopReadingsPoll],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const value = useMemo<PostureContextValue>(() => {
    const isConnected = state.demoMode || state.connectionState === 'connected';
    const postureScore = computePostureScore(state);

    const sessionDurationMs = state.isPaused
      ? state.pausedAtMs
      : state.sessionStart
        ? Date.now() - state.sessionStart.getTime()
        : 0;

    const goalMs = state.sessionGoalMinutes * 60_000;
    const goalTimeLeftMs = state.sessionStart ? Math.max(goalMs - sessionDurationMs, 0) : goalMs;

    let lastSyncLabel = '—';
    if (isConnected && state.lastLineAt) {
      const diffSec = Math.floor((Date.now() - state.lastLineAt.getTime()) / 1000);
      if (diffSec < 30) lastSyncLabel = 'Just now';
      else if (diffSec < 60) lastSyncLabel = `${diffSec}s ago`;
      else if (diffSec < 3600) lastSyncLabel = `${Math.floor(diffSec / 60)}m ago`;
      else {
        const d = state.lastLineAt;
        const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
        const m = String(d.getMinutes()).padStart(2, '0');
        lastSyncLabel = `Today, ${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
      }
    }

    return {
      ...state,
      isConnected,
      isDemoMode: state.demoMode,
      bleAvailable,
      hydrated,
      connectionError: bleService.lastError,
      postureScore,
      postureLabel: postureLabelFor(state, postureScore),
      canCalibrate: state.hardwareCheckState === 'passed',
      sessionDurationMs,
      goalTimeLeftMs,
      lastSyncLabel,
      deviceName: 'Posture Pad Pro',
      firmwareVersion: isConnected ? 'v2.4.1' : '—',
      batteryPercent: isConnected ? 82 : 0,
      notification,

      connect,
      disconnect,
      enableDemoMode,
      startSession,
      endSession,
      pauseSession,
      resumeSession,
      runHardwareCheck,
      calibrate,
      resetCalibration,
      saveSensorName,
      saveSensorActive,
      saveSessionGoal,
      savePostureReminders,
      saveSessionSummaries,
      saveStreakNudges,
      clearAllData,
      removeSession,
      restoreSession,
    };
  }, [
    state,
    notification,
    bleAvailable,
    hydrated,
    connect,
    disconnect,
    enableDemoMode,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    runHardwareCheck,
    calibrate,
    resetCalibration,
    saveSensorName,
    saveSensorActive,
    saveSessionGoal,
    savePostureReminders,
    saveSessionSummaries,
    saveStreakNudges,
    clearAllData,
    removeSession,
    restoreSession,
  ]);

  return <PostureContext.Provider value={value}>{children}</PostureContext.Provider>;
}
