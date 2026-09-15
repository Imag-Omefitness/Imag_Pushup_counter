# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Expo SDK 57 / React Native 0.86 / React 19 app (TypeScript, strict) that counts exercise reps (push-ups, sit-ups, squats) from the phone camera using pose detection, with a gamified profile (XP, levels, coins). UI text and code comments are in Brazilian Portuguese — keep new strings and comments in Portuguese to match.

## Commands

- `npm start` — Expo dev server (`npm run android` / `npm run ios` / `npm run web` for a specific platform)
- `npx tsc --noEmit` — type check (there is no lint or test setup)
- `npm install` — `.npmrc` sets `legacy-peer-deps=true`, which is required for the TensorFlow/MediaPipe peer ranges to resolve

## Architecture

**Pose detection runs inside a WebView, not in React Native.** Each workout screen (`screens/PushupWorkoutScreen.tsx`, `SitupWorkoutScreen.tsx`, `SquatWorkoutScreen.tsx`) builds an inline HTML string that loads MediaPipe Pose and `camera_utils` from jsdelivr, opens the camera with `getUserMedia`, and does all the angle math, rep counting, and skeleton drawing in browser JS. The TensorFlow/`@mediapipe/pose` npm packages and `poseUtils.ts` are **not** used at runtime; `poseUtils.ts` is an older standalone reference. To change counting rules or thresholds, edit the JS inside the screen's `htmlContent` template string. Remember it is a TS template literal, so `${...}` and backticks inside it must be escaped (`\${file}`).

**RN ⇄ WebView protocol:**
- WebView → RN: `window.ReactNativeWebView.postMessage(JSON.stringify({ type, ... }))`, handled in `handleMessage`. Types include `STATUS`, `COUNTDOWN`, `READY`, `UPDATE` (`count`, `stage`), `WORKOUT_FINISHED`, plus a per-screen "position lost" tick (`PLANK_LOST_TICK` for push-ups, `POSITION_LOST_TICK`/`POSITION_RESTORED` for sit-ups).
- RN → WebView: `injectJavaScript` calls globals the page exposes: `window.__setOrientationOk(bool)` and `window.__stopCamera()`.

**Workout lifecycle patterns shared by the three screens.** The screens are near-duplicates, so apply cross-cutting fixes to all three:
- Phone orientation comes from `expo-sensors` Accelerometer (smoothed x vs y), not screen orientation, because the app is locked to portrait. Push-ups and sit-ups require the phone lying horizontally; squats require it upright. The result is pushed into the WebView, which pauses counting when it is wrong.
- The WebView mounts only after camera permission is granted and `useWorkoutTutorial` has finished reading AsyncStorage (`tutorial.checked && !tutorial.visible`). This keeps the countdown from starting hidden behind the tutorial.
- `stopCamera()` must be called when a workout ends (not only on unmount). Otherwise Android keeps holding the camera and the next workout screen shows a black camera.
- Overlays drawn above the camera (countdown, "left position" warning, summary) use RN `<Modal>` rather than sibling Views, because the native WebView layer ignores zIndex stacking.
- Anti-cheat checks in the pose logic (body-line/horizontal checks, minimum shoulder displacement normalized by torso length, knee-angle rules) exist to stop reps from counting when the user only swings an arm. Keep them when changing thresholds.

**State:**
- `context/ProfileContext.tsx` holds profile/XP in memory. It is mounted above `NavigationContainer` in `App.tsx` so XP survives navigation (it is not persisted across app restarts). Workout screens call `addXp()` on finish, and XP is not passed through route params.
- AsyncStorage is used only for the "don't show tutorial again" flags (`@pushup_counter/<exercise>_tutorial_hidden`).

**Navigation:** single native stack in `App.tsx` (`Home`, `Pushup`, `Situp`, `Squat`, `Ranking`), headers hidden, with route types in `navigation/types.ts`. `navigations/types.ts` and `screens/context/ProfileContext.tsx` are stale duplicates that nothing imports; use `navigation/` and `context/`.

**Misc:**
- SVGs import as React components through `react-native-svg-transformer` (`metro.config.js` + `declarations.d.ts`), e.g. `assets/icons/Omecoin.svg`.
- The custom font `Yearbook Solid` loads with `useFonts` in `App.tsx`, and the app renders nothing until it loads.
- Shared spacing and radius tokens live in `constants/theme.ts`, while colors are mostly inline hex (dark `#0a0a0f` background, neon `#00ff88`/`#00e5ff` accents).
- The status bar and Android navigation bar are hidden for full-screen use.
