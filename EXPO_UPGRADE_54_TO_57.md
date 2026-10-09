# Upgrading an Expo app from SDK 54 to SDK 57

Done on Symponia on 2026-10-09. The same steps should apply to the other apps;
what differs is which libraries each one uses.

Why: iPhone Duo needs an app built with Apple's iOS 27.1 tools (Xcode 27.1).
Expo SDK 54 builds with Xcode 26.0. SDK 57 can build with Xcode 27 once scene
support is switched on. SDK 58 (beta in October 2026) does that by default.

## Steps

Upgrade one SDK at a time. After each step run the type check and
`npx expo-doctor@latest`.

```bash
npx expo install expo@^55.0.0 --fix
npx expo install expo@^56.0.0 --fix
npx expo-codemod sdk-56-expo-router-react-navigation-replace app
npx expo install expo@^57.0.0 --fix
npx expo-doctor@latest
```

## What had to change in Symponia

| Step | Change | Why |
|---|---|---|
| 55 | Removed `newArchEnabled` from `app.json` | The option no longer exists; the New Architecture is the only one |
| 56 | `StyleSheet.absoluteFillObject` became `StyleSheet.absoluteFill` (10 places) | Removed in React Native 0.85 |
| 56 | Removed `backgroundColor` and `translucent` from `<StatusBar>` | Removed from `expo-status-bar` |
| 56 | `BottomTabBarProps` now imported from `expo-router/js-tabs` | The codemod did this; `expo-router` no longer depends on React Navigation |
| 57 | `splash` in `app.json` moved to the `expo-splash-screen` plugin | The top-level `splash` key is rejected |
| 57 | Installed `expo-asset` | Required by `expo-audio` |
| 57 | Removed `@react-native-voice/voice`, added `expo-speech-recognition` | The old library was unused and unmaintained |

Also changed by the upgrade itself: React Native 0.81 to 0.86, React 19.1 to
19.2, minimum iOS 15.1 to 16.4 (this drops iPhone 7 and older), Hermes v1 as
the default engine, TypeScript 6.

## For iPhone Duo

In `app.json`, under the `expo-build-properties` plugin:

```json
{ "ios": { "enableSceneSupport": true } }
```

In `eas.json`, on the build profile:

```json
{ "ios": { "image": "macos-tahoe-26.6-xcode-27.1" } }
```

Needs `expo` 57.0.23 or newer. The image name comes from Expo's build
infrastructure page; Xcode 27.1 was a release candidate there on 2026-10-09.

## What this does not prove

Type check, `expo-doctor` (21/21), the web export and native project
generation (`expo prebuild`) all pass. None of them compiles the iOS app. Only
a real EAS build shows whether every native library compiles with Xcode 27.1
and whether sign-in and purchases still work under the scene lifecycle.
`react-native-iap` was left at 14.x (latest is 16.x) to avoid changing payment
code during the upgrade; `eas.json` has a `revamp-xcode26` profile as a
fallback if the Xcode 27.1 build fails.

`eas update` now needs an `--environment` flag.
