# RKJ One Staff 1.5 Play Store Release

Version name: `1.5`

Version code: `6`

Package: `com.rkjone.staff`

## Changes

- Uses the Capacitor 8 built-in SystemBars implementation instead of the deprecated standalone StatusBar plugin.
- Enables edge-to-edge explicitly for consistent Android 15/16 behavior.
- Handles safe-area insets through Capacitor SystemBars CSS variables.
- Enables R8 code optimization and resource shrinking for the release bundle.
- Preserves the Android WebView login-cookie persistence fix already included in Production `1.4`.
- Continues to load the secured live application at `https://rkj.one`.

## Play release notes (BM)

```text
Kemas kini kestabilan Android: paparan edge-to-edge yang lebih baik, pengendalian status bar moden, prestasi aplikasi dipertingkat dan saiz aplikasi dioptimumkan. Keselamatan login serta akses mengikut peranan dikekalkan.
```

## Play release notes (EN)

```text
Android stability update with improved edge-to-edge display, modern system bar handling, performance improvements and app-size optimization. Secure login and role-based access remain unchanged.
```

## Mandatory acceptance checks

- Signed AAB builds successfully and reports version code `6`.
- Play Console accepts the AAB without signing, SDK or policy errors.
- Internal test install upgrades cleanly from Production `1.4` without clearing app data.
- Login persists after app restart and device rotation.
- Header, footer, dialogs and keyboard are not obscured by system bars on Android 14, 15 and 16 where available.
- Offline fallback opens when connectivity is unavailable.
- Kiosk restrictions still work on the official POS device.
- No new crash or ANR appears during the internal test window.

Production promotion requires owner acceptance after the internal test. Server-only RKJ One changes continue to reach the app without requiring another native release.
