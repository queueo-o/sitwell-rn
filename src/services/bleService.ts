/**
 * BLE UART transport for the Posture Checker hardware.
 * Ported from lib/services/ble_service.dart.
 *
 * Hardware: Adafruit ESP32-S3 Feather running CircuitPython with the Nordic
 * UART Service (NUS). Device name: "Posture Check BT".
 *
 *   device → app   6e400003 (notify)  line-oriented UTF-8
 *   app → device   6e400002 (write)   'c' calibrate | 's' status | 'r' reset
 *
 * react-native-ble-plx is a NATIVE module: it does not exist in Expo Go. Every
 * entry point here degrades gracefully when it is missing, so the app still
 * runs in Expo Go (demo mode) and lights up automatically once the instructor's
 * development build is installed. Check isAvailable() before offering hardware.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './bytes';

export type BleConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

const DEVICE_NAME = 'Posture Check BT';
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify (device→app)
const TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write  (app→device)

/**
 * iOS: after the first successful connect, paste the peripheral UUID here for
 * reliable reconnection. Look for "[BLE] iOS peripheral UUID:" in the logs.
 */
const IOS_PERIPHERAL_ID = '';

const SCAN_TIMEOUT_MS = 15_000;

/** Lazily require the native module so a missing one can never crash startup. */
let bleModule: any;
let bleLoadAttempted = false;

function loadBleModule(): any {
  if (bleLoadAttempted) return bleModule;
  bleLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bleModule = require('react-native-ble-plx');
  } catch {
    bleModule = undefined;
    console.log('[BLE] react-native-ble-plx unavailable — hardware mode disabled.');
  }
  return bleModule;
}

type Unsubscribe = () => void;

class BleService {
  private manager: any = null;
  private managerFailed = false;
  private device: any = null;
  private monitorSub: any = null;
  private connSub: any = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  /** Raw bytes buffered until a full line arrives — see bytes.ts. */
  private byteBuf: number[] = [];

  private stateListeners = new Set<(s: BleConnectionState) => void>();
  private lineListeners = new Set<(line: string) => void>();

  currentState: BleConnectionState = 'disconnected';
  lastError: string | null = null;

  // ── Subscriptions ─────────────────────────────────────────────────────────

  onStateChange(cb: (s: BleConnectionState) => void): Unsubscribe {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  onLine(cb: (line: string) => void): Unsubscribe {
    this.lineListeners.add(cb);
    return () => this.lineListeners.delete(cb);
  }

  private setState(s: BleConnectionState): void {
    this.currentState = s;
    this.stateListeners.forEach((cb) => cb(s));
  }

  private setError(message: string): void {
    this.lastError = message;
    console.log(`[BLE] ${message}`);
    this.setState('error');
  }

  // ── Availability ──────────────────────────────────────────────────────────

  /**
   * False in Expo Go, on web, and anywhere the native module is absent.
   *
   * Checking for the JS `BleManager` class is NOT enough: once the package is
   * in package.json it bundles everywhere, so the class exists in Expo Go too
   * and only blows up on construction. The native module is the real signal.
   */
  isAvailable(): boolean {
    if (this.managerFailed) return false;
    if (Platform.OS === 'web') return false;
    if (!loadBleModule()?.BleManager) return false;
    const natives = NativeModules as Record<string, unknown>;
    return !!(natives.BleClientManager ?? natives.BlePlx);
  }

  private getManager(): any | null {
    if (this.manager || this.managerFailed) return this.manager;
    const mod = loadBleModule();
    if (!mod?.BleManager) {
      this.managerFailed = true;
      return null;
    }
    try {
      this.manager = new mod.BleManager();
    } catch (e) {
      this.managerFailed = true;
      console.log(`[BLE] BleManager could not start: ${e}`);
      return null;
    }
    return this.manager;
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const perms =
        Number(Platform.Version) >= 31
          ? [
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    } catch (e) {
      console.log(`[BLE] permission request failed: ${e}`);
      return false;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async startScan(): Promise<void> {
    if (this.currentState === 'scanning' || this.currentState === 'connected') return;

    const manager = this.getManager();
    if (!manager) {
      this.setError(
        'Bluetooth is unavailable in Expo Go. Install the development build to use hardware.',
      );
      return;
    }

    if (!(await this.requestPermissions())) {
      this.setError('Bluetooth permission was denied.');
      return;
    }

    this.lastError = null;
    this.setState('scanning');

    try {
      // Core Bluetooth starts in "Unknown" on iOS — wait for a usable state.
      const adapterState = await manager.state();
      if (adapterState !== 'PoweredOn') {
        const ready = await new Promise<boolean>((resolve) => {
          const sub = manager.onStateChange((s: string) => {
            if (s === 'PoweredOn') {
              sub.remove();
              resolve(true);
            } else if (s === 'PoweredOff' || s === 'Unauthorized' || s === 'Unsupported') {
              sub.remove();
              resolve(false);
            }
          }, true);
        });
        if (!ready) {
          this.setError('Bluetooth is not available or is switched off.');
          return;
        }
      }

      // iOS: direct connect by known peripheral UUID is the most reliable path.
      if (Platform.OS === 'ios' && IOS_PERIPHERAL_ID) {
        const devices = await manager.devices([IOS_PERIPHERAL_ID]);
        if (devices.length > 0) {
          await this.connect(devices[0]);
          return;
        }
      }

      const seen = new Set<string>();
      manager.startDeviceScan(null, null, (error: any, device: any) => {
        if (error) {
          this.setError(`Scan failed: ${error.message ?? error}`);
          return;
        }
        if (!device || this.currentState !== 'scanning') return;

        if (!seen.has(device.id)) {
          seen.add(device.id);
          console.log(
            `[BLE] found id=${device.id} name="${device.name}" ` +
              `local="${device.localName}" rssi=${device.rssi}`,
          );
        }

        const byName = device.name === DEVICE_NAME || device.localName === DEVICE_NAME;
        const byService = (device.serviceUUIDs ?? []).some(
          (u: string) => u.toLowerCase() === UART_SERVICE,
        );
        if (byName || byService) {
          console.log(`[BLE] matched posture device: ${device.id}`);
          manager.stopDeviceScan();
          this.clearScanTimer();
          void this.connect(device);
        }
      });

      this.scanTimer = setTimeout(() => {
        if (this.currentState === 'scanning') {
          manager.stopDeviceScan();
          this.setError('No matching BLE advertisement was found in 15 seconds.');
        }
      }, SCAN_TIMEOUT_MS);
    } catch (e) {
      this.setError(`Scan failed: ${e}`);
      try {
        manager.stopDeviceScan();
      } catch {
        // The adapter may be gone, so there may be no scan to stop.
      }
    }
  }

  async disconnect(): Promise<void> {
    this.clearScanTimer();
    try {
      this.manager?.stopDeviceScan();
    } catch {
      // ignore
    }
    this.monitorSub?.remove?.();
    this.connSub?.remove?.();
    this.monitorSub = null;
    this.connSub = null;
    this.byteBuf = [];

    try {
      if (this.device) await this.device.cancelConnection();
    } catch (e) {
      console.log(`[BLE] disconnect cleanup failed: ${e}`);
    }
    this.device = null;
    this.setState('disconnected');
  }

  /** Send a single command ('c' | 's' | 'r'); newline-terminated like the Dart client. */
  async sendCommand(cmd: string): Promise<void> {
    const device = this.device;
    if (!device) {
      console.log('[BLE] sendCommand: not connected');
      return;
    }
    const payload = bytesToBase64(utf8Encode(`${cmd}\n`));
    try {
      await device.writeCharacteristicWithoutResponseForService(
        UART_SERVICE,
        TX_CHAR,
        payload,
      );
    } catch {
      try {
        await device.writeCharacteristicWithResponseForService(UART_SERVICE, TX_CHAR, payload);
      } catch (e) {
        console.log(`[BLE] sendCommand failed: ${e}`);
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
  }

  private async connect(device: any): Promise<void> {
    this.setState('connecting');
    this.device = device;
    try {
      const connected = await device.connect({ timeout: 10_000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.device = connected;

      this.connSub?.remove?.();
      this.connSub = connected.onDisconnected(() => {
        this.monitorSub?.remove?.();
        this.monitorSub = null;
        this.byteBuf = [];
        this.device = null;
        this.setState('disconnected');
      });

      this.monitorSub?.remove?.();
      this.monitorSub = connected.monitorCharacteristicForService(
        UART_SERVICE,
        RX_CHAR,
        (error: any, characteristic: any) => {
          if (error) {
            // A cancelled monitor on disconnect is normal, not an error.
            if (this.currentState === 'connected') {
              console.log(`[BLE] notify error: ${error.message ?? error}`);
            }
            return;
          }
          if (characteristic?.value) this.onBytes(base64ToBytes(characteristic.value));
        },
      );

      this.setState('connected');

      if (Platform.OS === 'ios') {
        console.log(`[BLE] iOS peripheral UUID: ${connected.id}`);
        console.log('[BLE] Paste it into IOS_PERIPHERAL_ID for reliable reconnection.');
      }
    } catch (e) {
      this.connSub?.remove?.();
      this.connSub = null;
      try {
        await device.cancelConnection();
      } catch {
        // ignore
      }
      this.device = null;
      this.setError(`Connection failed: ${e}`);
    }
  }

  /**
   * Buffer raw bytes, emitting a decoded line on each 0x0A. Buffering at the
   * byte level avoids corruption when a notification splits a multi-byte
   * codepoint (e.g. ⚠ 0xE2 0x9A 0xA0) across two packets.
   */
  private onBytes(bytes: number[]): void {
    for (const byte of bytes) {
      if (byte === 0x0a) {
        if (this.byteBuf.length > 0 && this.byteBuf[this.byteBuf.length - 1] === 0x0d) {
          this.byteBuf.pop();
        }
        const line = utf8Decode(this.byteBuf);
        this.byteBuf = [];
        this.lineListeners.forEach((cb) => cb(line));
      } else {
        this.byteBuf.push(byte);
      }
    }
  }
}

export const bleService = new BleService();
