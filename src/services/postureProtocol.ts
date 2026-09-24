/**
 * Line protocol spoken by the CircuitPython firmware (code.py).
 *
 * Ported from PostureProvider._onLine in the Flutter app. Kept as a pure
 * stateful parser — it turns raw UART lines into typed events, so the React
 * context only has to apply them.
 *
 * The board is command-driven: it replies to 'c' (calibrate), 's' (status) and
 * 'r' (reset) rather than streaming continuously.
 *
 *   --- Current Readings ---
 *     FSR1 (circle):   523
 *     ...
 *   (blank line ends the block)
 *
 *   === CALIBRATION STARTED ===
 *   [####......] 40%
 *     FSR1 (circle):   baseline = 523.00, deviation threshold = 50.0%
 *   === CALIBRATION COMPLETE ===
 *   === CALIBRATION ERROR ===
 *   Calibration reset.
 *   --- POSTURE ALERT ---
 *     ⚠ FSR1: pressure increased by 62%
 *   --- POSTURE OK ---
 */

export type ProtocolEvent =
  | { type: 'reading'; key: string; value: number }
  | { type: 'readingsBlockEnd' }
  | { type: 'calibrationStarted' }
  | { type: 'calibrationProgress'; progress: number; line: string }
  | { type: 'calibrationComplete' }
  | { type: 'calibrationError' }
  | { type: 'baseline'; key: string; value: number }
  | { type: 'calibrationReset' }
  | { type: 'postureOk' }
  | { type: 'postureAlert' }
  | {
      type: 'alertDetail';
      key?: string;
      direction?: 'increased' | 'decreased';
      percent?: number;
      raw: string;
    }
  | { type: 'log'; line: string };

const READING_RE = /(FSR\d+)\s*\([^)]+\):\s*(\d+)/i;
const BASELINE_RE = /(FSR\d+).*baseline\s*=\s*([\d.]+)/i;
const PROGRESS_RE = /\[([#.]+)\]\s+(\d+)%/;
const ALERT_DETAIL_RE = /pressure\s+(increased|decreased)\s+by\s+(\d+)/i;
const SENSOR_KEY_RE = /(FSR\d+)/i;

export class ProtocolParser {
  private inReadingsBlock = false;
  private inAlertBlock = false;
  private calibrating = false;

  /** Reset block tracking — call on disconnect. */
  reset(): void {
    this.inReadingsBlock = false;
    this.inAlertBlock = false;
    this.calibrating = false;
  }

  parse(raw: string): ProtocolEvent[] {
    const line = raw.trim();
    const out: ProtocolEvent[] = [];

    // ── Current Readings block ────────────────────────────────────────────
    if (line.includes('Current Readings')) {
      this.inReadingsBlock = true;
      return out;
    }

    if (this.inReadingsBlock) {
      if (line.length === 0) {
        this.inReadingsBlock = false;
        out.push({ type: 'readingsBlockEnd' });
        return out;
      }
      const m = READING_RE.exec(line);
      if (m) {
        out.push({
          type: 'reading',
          key: m[1].toLowerCase(),
          value: parseInt(m[2], 10),
        });
      }
      return out;
    }

    // ── Calibration ───────────────────────────────────────────────────────
    if (line.includes('CALIBRATION STARTED')) {
      this.calibrating = true;
      out.push({ type: 'calibrationStarted' });
      return out;
    }

    if (line.includes('CALIBRATION ERROR')) {
      this.calibrating = false;
      out.push({ type: 'calibrationError' });
      return out;
    }

    const prog = PROGRESS_RE.exec(line);
    if (prog && this.calibrating) {
      out.push({
        type: 'calibrationProgress',
        progress: parseInt(prog[2], 10) / 100,
        line,
      });
      return out;
    }

    if (line.includes('CALIBRATION COMPLETE')) {
      this.calibrating = false;
      out.push({ type: 'calibrationComplete' });
      return out;
    }

    const base = BASELINE_RE.exec(line);
    if (base) {
      out.push({
        type: 'baseline',
        key: base[1].toLowerCase(),
        value: parseFloat(base[2]),
      });
      return out;
    }

    if (line.includes('Calibration reset')) {
      out.push({ type: 'calibrationReset' });
      return out;
    }

    // ── Posture ───────────────────────────────────────────────────────────
    if (line.includes('POSTURE OK')) {
      this.inAlertBlock = false;
      out.push({ type: 'postureOk' });
      return out;
    }

    if (line.includes('POSTURE ALERT')) {
      this.inAlertBlock = true;
      out.push({ type: 'postureAlert' });
      return out;
    }

    if (this.inAlertBlock) {
      if (line.includes('⚠')) {
        const keyMatch = SENSOR_KEY_RE.exec(line);
        const detail = ALERT_DETAIL_RE.exec(line);
        out.push({
          type: 'alertDetail',
          key: keyMatch ? keyMatch[1].toLowerCase() : undefined,
          direction: detail ? (detail[1].toLowerCase() as 'increased' | 'decreased') : undefined,
          percent: detail ? parseInt(detail[2], 10) : undefined,
          raw: line,
        });
        return out;
      }
      if (line.length > 0) this.inAlertBlock = false;
    }

    if (this.calibrating && line.length > 0) {
      out.push({ type: 'log', line });
    }
    return out;
  }
}
