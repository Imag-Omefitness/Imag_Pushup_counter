# Pushup Counter

A mobile app that counts push-ups, sit-ups and squats in real time using the phone camera and on-device pose detection, wrapped in a gamified experience (XP, levels, coins and a ranking).

Built with React Native and Expo, in TypeScript. This repository is a public snapshot of the project; active development continues in a private repository.

## Features

- **Real-time rep counting** for three exercises: push-ups, sit-ups and squats, based on body-joint angles from MediaPipe Pose.
- **Anti-cheat checks** so a rep only counts with a real movement (body-line and horizontal-position checks, minimum shoulder displacement normalized by torso length, knee-angle rules).
- **Phone orientation detection** with the accelerometer: the workout pauses if the phone is not placed the way the exercise requires (lying down for push-ups and sit-ups, upright for squats).
- **Gamification**: XP, levels, coins and a ranking screen.
- **Per-exercise tutorials** that can be dismissed permanently.

## Tech stack

| Area | Tools |
| --- | --- |
| App | Expo SDK 57, React Native 0.86, React 19, TypeScript (`strict`) |
| Navigation | React Navigation (native stack) |
| Pose detection | MediaPipe Pose running inside a WebView |
| Device APIs | `expo-camera`, `expo-sensors` (accelerometer) |
| State and storage | React Context, AsyncStorage |
| Graphics | `react-native-svg` with `react-native-svg-transformer` |

## How it works

Expo Go does not expose a native frame processor, so pose detection runs in the browser engine instead of the native side. Each workout screen builds an inline HTML page that loads MediaPipe Pose, opens the camera with `getUserMedia`, and does the angle math, rep counting and skeleton drawing in JavaScript.

The React Native screen and the WebView talk through a small message protocol:

- **WebView to app:** `window.ReactNativeWebView.postMessage(...)` with events such as `READY`, `COUNTDOWN`, `UPDATE` (count and stage) and `WORKOUT_FINISHED`.
- **App to WebView:** injected calls such as `__setOrientationOk(bool)` and `__stopCamera()`.

## Getting started

### Prerequisites

- Node.js and npm
- The **Expo Go** app on your phone (Android or iOS), or a configured emulator

### Run it

```bash
npm install
npm start
```

Press `a` (Android), `i` (iOS) or `w` (web) in the terminal, or scan the QR code with Expo Go.

`.npmrc` sets `legacy-peer-deps=true`, which is needed for the TensorFlow and MediaPipe peer dependency ranges to resolve.

### Type check

```bash
npx tsc --noEmit
```

### Permissions

The app asks for camera access (`CAMERA` on Android, `NSCameraUsageDescription` on iOS). It is what feeds the pose detection.

## Project structure

```
screens/       # Home, one workout screen per exercise, ranking
components/    # Reusable UI (tutorial and exit modals)
context/       # Global state (profile and XP)
navigation/    # Route types
constants/     # Theme tokens (spacing, radius)
assets/        # Icons, fonts and animations
```

## Status

Work in progress. The UI text is in Brazilian Portuguese, and the app is currently tested through Expo Go.

## License

See [LICENSE](LICENSE).
