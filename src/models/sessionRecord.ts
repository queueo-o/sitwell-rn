/** Ported from lib/models/session_record.dart */

export type SessionTrend = 'improved' | 'declined' | 'stable';

/**
 * A completed posture-monitoring session, surfaced on the History and
 * Insights tabs. Produced when the user taps END SESSION on Home.
 * Durations are stored in milliseconds.
 */
export interface SessionRecord {
  id: number;
  name: string; // 'Morning' | 'Afternoon' | 'Evening'
  startedAt: Date;
  durationMs: number; // total wall-clock time (paused + active)
  pausedDurationMs: number;
  score: number; // 0–100
  slouches: number;
  trend: SessionTrend;
}

/** Compare a new score to the previous one to derive a trend. */
export function trendFromDelta(newScore: number, previousScore?: number): SessionTrend {
  if (previousScore === undefined) return 'stable';
  const delta = newScore - previousScore;
  if (delta > 5) return 'improved';
  if (delta < -5) return 'declined';
  return 'stable';
}

/** Bucket name based on the local-time hour of the session start. */
export function nameForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  return 'Evening';
}

/** "9:00 AM" */
export function timeLabel(startedAt: Date): string {
  const h = startedAt.getHours() % 12 === 0 ? 12 : startedAt.getHours() % 12;
  const m = String(startedAt.getMinutes()).padStart(2, '0');
  const period = startedAt.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${period}`;
}

function formatHm(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Total duration: "2h 15m" or "45m" */
export function durationLabel(record: SessionRecord): string {
  return formatHm(record.durationMs);
}

/** Active time = total wall-clock time minus any paused time. */
export function activeLabel(record: SessionRecord): string {
  const active = record.durationMs - record.pausedDurationMs;
  return formatHm(Math.min(Math.max(active, 0), record.durationMs));
}

/**
 * Seed history so History/Insights aren't empty for a new user.
 * Covers the past 7 days so every chart bucket has data.
 */
export function seedSessions(): SessionRecord[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const mk = (
    id: number,
    daysAgo: number,
    hour: number,
    durationH: number,
    durationM: number,
    score: number,
    slouches: number,
    trend: SessionTrend,
  ): SessionRecord => {
    const startedAt = new Date(today);
    startedAt.setDate(startedAt.getDate() - daysAgo);
    startedAt.setHours(hour);
    return {
      id,
      name: nameForHour(hour),
      startedAt,
      durationMs: (durationH * 60 + durationM) * 60000,
      pausedDurationMs: 0,
      score,
      slouches,
      trend,
    };
  };

  const records: SessionRecord[] = [
    // Today
    mk(1001, 0, 9, 2, 15, 94, 4, 'improved'),
    mk(1002, 0, 13, 3, 45, 78, 12, 'declined'),
    // 1 day ago
    mk(1003, 1, 20, 1, 30, 88, 6, 'stable'),
    mk(1004, 1, 9, 4, 0, 92, 8, 'improved'),
    // 2 days ago
    mk(1005, 2, 8, 1, 45, 85, 9, 'stable'),
    mk(1006, 2, 14, 2, 30, 71, 15, 'declined'),
    // 3 days ago
    mk(1007, 3, 10, 3, 0, 90, 5, 'improved'),
    // 4 days ago
    mk(1008, 4, 9, 2, 0, 82, 10, 'stable'),
    mk(1009, 4, 15, 1, 15, 76, 13, 'declined'),
    // 5 days ago
    mk(1010, 5, 8, 2, 45, 88, 7, 'improved'),
    // 6 days ago
    mk(1011, 6, 13, 1, 30, 80, 11, 'stable'),
    mk(1012, 6, 9, 3, 15, 87, 6, 'improved'),
  ];

  records.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return records;
}
