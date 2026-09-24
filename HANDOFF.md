# SitWell — build handoff

Everything the instructor needs to produce this team's development build.

## What makes this project different

SitWell talks to custom CircuitPython hardware (Adafruit ESP32-S3 Feather) over
Bluetooth LE using the Nordic UART Service. That means **`react-native-ble-plx`
is required**, which is a native module — so **Expo Go cannot run the hardware
path** and a development build is needed.

The app is written so it still runs fully in Expo Go using a simulated-sensor
demo mode, so UI work is never blocked on a build.

## Already configured in this repo

| Item | Where | Value |
|---|---|---|
| BLE library | `package.json` | `react-native-ble-plx` |
| Config plugin | `app.json` → `expo.plugins` | `react-native-ble-plx` |
| iOS bundle ID | `app.json` → `expo.ios.bundleIdentifier` | `org.yourschool.sitwell` |
| Android package | `app.json` → `expo.android.package` | `org.yourschool.sitwell` |
| iOS BLE permission | `app.json` → `expo.ios.infoPlist` | `NSBluetoothAlwaysUsageDescription` |
| Android BLE permissions | `app.json` → `expo.android.permissions` | `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` |
| Lockfile | `package-lock.json` | committed |

**Please confirm the bundle ID / package name** — they are placeholders and
should match whatever the class assigns to this team.

## Build commands

```bash
npm ci
npx expo install expo-dev-client
eas build:configure
eas build --platform ios --profile development
```

## Student daily loop, once the build is installed

```bash
npm ci
npx expo start --dev-client
```

Add `--tunnel` if campus Wi-Fi blocks device-to-device traffic.

## Hardware protocol (for reference)

The board is command-driven — it answers commands rather than streaming.

| Command | Meaning | Reply |
|---|---|---|
| `c` | calibrate | `=== CALIBRATION STARTED ===` → progress bars → baselines → `=== CALIBRATION COMPLETE ===` |
| `s` | status | `--- Current Readings ---` block, one line per sensor, blank line ends it |
| `r` | reset | `Calibration reset.` |

Six sensors: `fsr1`/`fsr2` circle FSR, `fsr3`/`fsr4` square FSR, `fsr5`/`fsr6`
velostat. Parsing lives in `src/services/postureProtocol.ts`; the transport is
`src/services/bleService.ts`.

## Known follow-ups

- Preferences are in-memory only. Persistence needs
  `@react-native-async-storage/async-storage` (another native module — worth
  adding in the same build if possible).
- iOS reconnection is faster if `IOS_PERIPHERAL_ID` in `src/services/bleService.ts`
  is filled in with the peripheral UUID printed on first connect.
