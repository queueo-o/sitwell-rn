# SitWell

A posture tracker built into a chair pad instead of something you wear.

Six pressure sensors across the seat and backrest of any ordinary chair feed an
iOS app over Bluetooth Low Energy. The app learns how you normally sit, then
scores your posture live, shows which part of the chair you've drifted on, and
buzzes when you've been slouching.

<!-- Add a screenshot here: docs/screenshot.png -->

## Why it isn't a threshold

The obvious design is a pressure threshold — above this number you're sitting
well, below it you're slouching. That fails immediately in practice. A heavier
person presses harder, a padded office chair reads nothing like a wooden one,
and moving the pad a couple of inches changes every value. There is no universal
pressure reading that means "good posture".

So SitWell doesn't measure pressure, it measures **drift from your own
baseline**. You sit the way you normally sit, press calibrate, and the board
averages 20 samples over about three seconds to learn your personal normal.
Everything after that is relative, which is what lets the same pad work on any
chair for any body.

Each sensor type gets its own tolerance, because they don't behave alike:

| Sensor | Position | Deviation allowed |
|---|---|---|
| Circle FSR ×2 | seat | 50% |
| Square FSR ×2 | backrest | 60% |
| Velostat ×2 | one seat, one backrest | 25% |

Velostat is a large-area pressure film, so a small shift in weight moves its
reading a lot. Sharing one threshold across all six made it alarm constantly.

## Features

- **Live posture score** on a dial that updates every couple of seconds
- **Chair map** showing which specific pads have drifted, colour-coded
- **Haptic alert** — the pad buzzes after five seconds of sustained bad posture
- **Session history** with filters, swipe-to-delete and undo
- **Insights** charting average score and sitting time over 7 / 30 / 90 days
- **Optional AI coaching** summarising recent sessions (bring your own OpenAI key)
- **Demo mode** with simulated sensors, so the app can be explored without hardware
- Light and dark themes; everything persists between launches

## Hardware

| Part | Notes |
|---|---|
| Adafruit ESP32-S3 Feather | 8MB flash, no PSRAM |
| 2 × circle FSR | seat, pins A0/A1 |
| 2 × square FSR | backrest, pins A2/A3 |
| 2 × velostat pads | seat A4, backrest A5 |
| Adafruit DRV2605L + disc motor | haptic feedback, over STEMMA QT |

Each sensor needs a 10K pulldown from its pin to ground. Full wiring notes are
in the header of the firmware.

## Running the app

```bash
npm install
npx expo start --go
```

Open the URL in [Expo Go](https://expo.dev/go) on your phone, then turn on
**Settings → Demo mode** to explore with simulated sensors.

### Running against real hardware

Bluetooth needs a **development build** — `react-native-ble-plx` is a native
module, and Expo Go can't load it. Charts, storage and the keychain all work in
Expo Go; Bluetooth is the only thing that doesn't.

```bash
npx expo install expo-dev-client
eas build --platform ios --profile development
```

Install the resulting build, then:

```bash
npx expo start --dev-client
```

Turn **Demo mode off** and press Connect. The app scans for a device advertising
as `Posture Check BT`.

## Flashing the firmware

The board runs [CircuitPython](https://circuitpython.org/board/adafruit_feather_esp32s3_nopsram/).
Once `CIRCUITPY` mounts:

1. Copy `assets/pythonHardwareCodeReference/code.py` to the root of the drive
2. Copy these from the matching
   [Adafruit bundle](https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases)
   into `lib/`:
   `adafruit_ble`, `adafruit_bluefruit_connect`, `adafruit_bus_device`,
   `neopixel.mpy`, `adafruit_drv2605.mpy`

The bundle version must match the CircuitPython version — a 9.x bundle on
CircuitPython 10 throws import errors.

The onboard NeoPixel reports state: dim blue means running but uncalibrated,
green means calibrated, orange means calibrating, and a red pulse means bad
posture.

## How the two halves talk

The board is command-driven over the Nordic UART Service rather than streaming
continuously. The app sends single characters and parses the replies:

| Command | Does | Replies with |
|---|---|---|
| `c` | calibrate | progress bars, then per-sensor baselines |
| `s` | status | a `--- Current Readings ---` block |
| `r` | reset | clears calibration |

The board also pushes `--- POSTURE ALERT ---` and `--- POSTURE OK ---`
unprompted once calibrated. Parsing lives in
[`src/services/postureProtocol.ts`](src/services/postureProtocol.ts); the
transport is [`src/services/bleService.ts`](src/services/bleService.ts).

Lines are buffered at the byte level rather than per packet, because a BLE
notification can split a multi-byte character such as `⚠` across two packets.

## Project structure

```
src/
  app/           five screens, file-based routing (expo-router)
  components/    score gauge, chair map, charts, toast
  models/        sensor config, session records, insights maths
  services/      BLE transport, protocol parser, storage, AI analysis
  state/         PostureContext — one state layer for both runtime paths
  theme/         colours, light/dark override
assets/
  pythonHardwareCodeReference/code.py    firmware
```

`PostureContext` drives two runtime paths from one state layer: a simulated demo
mode that works anywhere, and the BLE path that activates by itself once the
native module is present.

## Built with

TypeScript · React Native · Expo SDK 57 · react-native-svg · CircuitPython ·
Bluetooth Low Energy (Nordic UART Service)

## Public repository and local configuration

Local `.env` files, environment variants, Firebase native settings, signing
credentials, and temporary/cache files are ignored by Git. Share blank templates
such as `.env.example`, not real settings. Client settings in `EXPO_PUBLIC_`
variables are visible in the installed app; keep server secrets on the backend.
Ignore rules do not remove files that were already committed.

Optional AI analysis accepts a user-supplied OpenAI key in the Insights tab and
stores it in the device secure store. No shared trial key is supplied, and
analysis is unavailable without a personal key — anything bundled into an app
can be extracted from it, so shared credentials belong on a backend, never in
this repo or an `EXPO_PUBLIC_` variable.
