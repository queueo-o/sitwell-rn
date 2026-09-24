/** Aggregation for the Insights screen. Ported from insights_screen.dart. */

import { SessionRecord } from './sessionRecord';

export type Period = 'd7' | 'd30' | 'd90';

export const PERIODS: Period[] = ['d7', 'd30', 'd90'];

export function periodLabel(p: Period): string {
  switch (p) {
    case 'd7':
      return '7 Days';
    case 'd30':
      return '30 Days';
    case 'd90':
      return '90 Days';
  }
}

export function periodDays(p: Period): number {
  switch (p) {
    case 'd7':
      return 7;
    case 'd30':
      return 30;
    case 'd90':
      return 90;
  }
}

export function periodBuckets(p: Period): number {
  return p === 'd7' ? 7 : 6;
}

export interface Bucket {
  label: string;
  /** null when no scored session fell in this bucket — the line skips it. */
  avgScore: number | null;
  minutes: number;
  sessions: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function windowStartFor(period: Period, now = new Date()): Date {
  const today = startOfDay(now);
  const start = new Date(today);
  start.setDate(start.getDate() - (periodDays(period) - 1));
  return start;
}

/** Sessions whose start date falls inside the selected window. */
export function sessionsInWindow(
  history: SessionRecord[],
  period: Period,
  now = new Date(),
): SessionRecord[] {
  const start = windowStartFor(period, now);
  return history.filter((s) => startOfDay(s.startedAt).getTime() >= start.getTime());
}

export function buildBuckets(
  inWindow: SessionRecord[],
  period: Period,
  now = new Date(),
): Bucket[] {
  const n = periodBuckets(period);
  const daysPerBucket = Math.ceil(periodDays(period) / n);
  const start = windowStartFor(period, now);

  const scoreSum = new Array(n).fill(0);
  const scoreCount = new Array(n).fill(0);
  const minutes = new Array(n).fill(0);
  const sessions = new Array(n).fill(0);

  for (const s of inWindow) {
    const daysIn = Math.floor(
      (startOfDay(s.startedAt).getTime() - start.getTime()) / 86_400_000,
    );
    const idx = Math.min(Math.max(Math.floor(daysIn / daysPerBucket), 0), n - 1);
    minutes[idx] += Math.floor(s.durationMs / 60000);
    sessions[idx] += 1;
    if (s.score > 0) {
      scoreSum[idx] += s.score;
      scoreCount[idx] += 1;
    }
  }

  return Array.from({ length: n }, (_, i) => {
    const bucketStart = new Date(start);
    bucketStart.setDate(bucketStart.getDate() + i * daysPerBucket);
    const label =
      period === 'd7'
        ? WEEKDAYS[(bucketStart.getDay() + 6) % 7]
        : `${bucketStart.getMonth() + 1}/${bucketStart.getDate()}`;
    return {
      label,
      avgScore: scoreCount[i] > 0 ? scoreSum[i] / scoreCount[i] : null,
      minutes: minutes[i],
      sessions: sessions[i],
    };
  });
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
