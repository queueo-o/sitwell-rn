/**
 * Ported from lib/models/sensor_config.dart
 *
 * Sensor layout matches the CircuitPython firmware (code.py):
 *   fsr1/fsr2 = circle FSR, fsr3/fsr4 = square FSR,
 *   fsr5 = velostat (seat), fsr6 = velostat (back)
 */

export type HardwareType = 'circle' | 'square' | 'velostat';

export interface SensorConfig {
  key: string;
  hardwareType: HardwareType;
  displayName: string;
  isActive: boolean;
}

/**
 * Physical pin (fsrN) → position on the chair.
 *
 * The firmware assigns types by pin: fsr1/fsr2 circle, fsr3/fsr4 square,
 * fsr5 velostat_seat, fsr6 velostat_back. The seat/back suffix on the two
 * velostats is the giveaway — fsr6 belongs on the backrest, fsr5 on the seat.
 *
 *   Backrest  S1 fsr3 square · S2 fsr4 square · S3 fsr6 velostat (back)
 *   Seat      S1 fsr1 circle · S2 fsr2 circle · S3 fsr5 velostat (seat)
 */
export function defaultSensors(): SensorConfig[] {
  return [
    // Backrest
    { key: 'fsr3', hardwareType: 'square', displayName: 'S1_UPPER', isActive: true },
    { key: 'fsr4', hardwareType: 'square', displayName: 'S2_UPPER', isActive: true },
    { key: 'fsr6', hardwareType: 'velostat', displayName: 'S3_UPPER', isActive: true },
    // Seat
    { key: 'fsr1', hardwareType: 'circle', displayName: 'S1_LOWER', isActive: true },
    { key: 'fsr2', hardwareType: 'circle', displayName: 'S2_LOWER', isActive: true },
    { key: 'fsr5', hardwareType: 'velostat', displayName: 'S3_LOWER', isActive: true },
  ];
}

/** Deviation threshold from the hardware DEVIATION map. */
export function deviationThreshold(type: HardwareType): number {
  switch (type) {
    case 'circle':
      return 0.5;
    case 'square':
      return 0.6;
    case 'velostat':
      return 0.25;
    default:
      return 0.25;
  }
}

/** Normalize a 10-bit ADC reading to 0.0–1.0 for bar visualisation. */
export function pressureNorm(reading: number): number {
  return Math.min(Math.max(reading / 1023, 0), 1);
}

function circleLabel(r: number): string {
  if (r < 15) return 'No contact';
  if (r < 50) return 'Very light';
  if (r < 150) return 'Light';
  if (r < 250) return 'Moderate';
  if (r < 350) return 'Firm';
  return 'Heavy';
}

function squareLabel(r: number): string {
  if (r < 350) return 'No contact';
  if (r < 450) return 'Light';
  if (r < 700) return 'Moderate';
  if (r < 800) return 'Firm';
  if (r < 900) return 'High';
  return 'Max load';
}

function velostatLabel(r: number): string {
  if (r < 650) return 'No pressure';
  if (r < 750) return 'Below normal';
  if (r < 850) return 'Normal posture';
  return 'Excess pressure';
}

/** Pressure labels from the hardware *_THRESHOLDS tables. */
export function pressureLabel(type: HardwareType, reading: number): string {
  switch (type) {
    case 'circle':
      return circleLabel(reading);
    case 'square':
      return squareLabel(reading);
    case 'velostat':
      return velostatLabel(reading);
    default:
      return '—';
  }
}
