/** Ported from lib/models/hardware_check.dart */

export type HardwareCheckState = 'notRun' | 'checking' | 'passed' | 'failed';

/**
 * A channel at or above this value is treated as a connected, loaded sensor.
 * Matches the hardware's minimum useful calibration baseline.
 */
export const MINIMUM_CONNECTED_READING = 10;

export const SENSOR_KEYS = ['fsr1', 'fsr2', 'fsr3', 'fsr4', 'fsr5', 'fsr6'] as const;

export type Readings = Record<string, number>;

export function missingSensors(readings: Readings): string[] {
  return SENSOR_KEYS.filter((key) => !(key in readings));
}

export function invalidSensors(readings: Readings): string[] {
  return SENSOR_KEYS.filter((key) => {
    const value = readings[key];
    return value !== undefined && (value < 0 || value > 1023);
  });
}

export function connectedSensors(readings: Readings): string[] {
  return SENSOR_KEYS.filter((key) => {
    const value = readings[key];
    return value !== undefined && value >= MINIMUM_CONNECTED_READING && value <= 1023;
  });
}

export function passes(readings: Readings): boolean {
  return invalidSensors(readings).length === 0 && connectedSensors(readings).length > 0;
}
