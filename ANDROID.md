--- ANDROID.md (原始)


+++ ANDROID.md (修改后)
# Dead Reckoning on Android

The game is a fully self-contained web app (canvas + React, no server calls), so it ships to Android three ways.

## 1. Instant — install as a PWA (no code)

The build is already an installable Progressive Web App: web manifest, offline service worker, app icon, touch controls, fullscreen + wake-lock on launch.

1. `npm run build` and serve `dist/` over HTTPS (any static host).
2. Open it in Chrome on Android → menu → **Add to Home screen**.
3. It launches standalone, fullscreen, and works offline.

## 2. Play Store — wrap with Capacitor (configured)

Capacitor dependencies and `capacitor.config.ts` (appId `com.deadreckoning.game`) are already in the project.

```bash
npm run build
npx cap add android        # first time only — creates the android/ project
npx cap sync               # after every rebuild
npx cap open android       # Android Studio → Build → Generate Signed APK / AAB
```

For the Play Store, generate a signed AAB in Android Studio and upload it.
For a quick test APK on your phone: **Build → Build Bundle(s) / APK(s) → APK(s)**.

## 3. Trusted Web Activity (hosted PWA in the Store)

If you host the PWA, [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) packages it into a TWA APK with zero native code:

```bash
npx @bubblewrap/cli init --manifest https://your-host/manifest.webmanifest
npx @bubblewrap/cli build
```

## Already handled for phones

- Touch: tap to aim & fire, drag to track, tap crates to grab
- No pinch-zoom / scroll bounce; `touch-action: none`
- Notch / gesture-bar safe areas for HUD and keypad
- Immersive fullscreen + screen wake-lock while playing
- Screen-size-scaled hitboxes for portrait play
- Offline caching via service worker
- Best score persists in `localStorage`
