# Sahaj apps: Android, iOS and Windows

Three native app shells around the live Sahaj workspace. Each one opens https://sahaj.cmcloud.online directly, so it uses the **live API** with the same login as the website, and every website release reaches the apps instantly (no app update needed for normal changes). On top of the website each app adds real native abilities.

```
clients/
  android/   Android app (Capacitor 8, Kotlin/Java host, signed APK + AAB)   package: online.cmcloud.sahaj
  ios/       iPhone/iPad app (Capacitor 8, CocoaPods, Xcode project)           bundle:  online.cmcloud.sahaj
  windows/   Windows desktop app (Electron 44, NSIS installer .exe)            id:      online.cmcloud.sahaj.desktop
  shared/    brand assets (icon, splash) generated from the logo + the offline page
```

## What the apps add to the website
| Feature | Android | iOS | Windows |
|---|---|---|---|
| Opens on sign-in, stays signed in across restarts | yes | yes | yes |
| Camera barcode / QR scanning in Sell, Products and order packing | yes | yes | n/a (typed or scanner-as-keyboard) |
| Save / share generated files (PDF, CSV, images) through the system sheet | yes | yes | Save dialog |
| Print invoices, receipts and reports (system print service / PDF) | yes | yes | yes |
| Native share sheet for receipts | yes | yes | n/a |
| Hardware Back: closes a sheet, goes back, else minimises | yes | n/a | menu (Alt+←) |
| Status bar / title bar follows light/dark theme | yes | yes | yes |
| Splash screen and adaptive icon | yes | yes | yes |
| Friendly offline screen that reconnects by itself | yes | yes | yes |
| Opens `sahaj.cmcloud.online` links inside the app (App Links) | yes | – | – |
| Native menu, shortcuts (Ctrl+1…5), window size memory, single instance | – | – | yes |
| Automatic updates | Play Store | App Store | GitHub Releases |
| Security: only Sahaj and the payment providers load inside the app, everything else opens in the browser; camera/microphone/location denied on desktop; no Node access from the page | yes | yes | yes |

## Download (after a release)
https://github.com/Chinmaya1999/Sahaj-tools/releases/latest, with `Sahaj-<version>.apk`, `Sahaj-<version>.aab` (Play Store), `Sahaj-Setup-<version>.exe`, and the iOS `.ipa`/simulator zip.

## Build and test
### Android (needs JDK 21 and the Android SDK; Android Studio includes both)
```
cd clients/android && npm ci
npm run build:debug                      # debug APK for the live site
# test against a local server on an emulator (no production data touched):
SAHAJ_DEBUG=1 SAHAJ_URL=http://10.0.2.2:5174 npm run sync && (cd android && ./gradlew assembleDebug)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk && npm run test:device   # 19 device checks
```
The device test drives the real app over the WebView debugging channel: sign-in, restart, sale, scanner plugin, file share, print, back button, theme, offline, crash and JavaScript-error checks.

Release build (signed with your key): `. signing/keystore.env && npm run build:release` → `android/app/build/outputs/apk/release/` and `bundle/release/*.aab`.

### Windows
```
cd clients/windows && npm ci
npm start                                  # run the app (works from any terminal)
SAHAJ_URL=http://localhost:5174 npm test   # 12 checks against a local server
npm run dist                               # NSIS installer (build on Windows; CI does this)
```

### iOS (needs a Mac with Xcode)
```
cd clients/ios && npm ci && npm run sync   # runs pod install
npx cap open ios                           # build/run from Xcode
```

## Releasing
`git tag v1.0.0 && git push origin v1.0.0` runs `.github/workflows/clients.yml`: builds all three apps, then creates a GitHub Release with the files attached. Pushes to `main` that touch `clients/` build and verify (signature check, "app starts" test on Windows, iOS compile) without publishing.

## Signing keys and accounts (important)
- **Android**: the release key is `clients/android/signing/sahaj-release.jks` with passwords in `signing/keystore.env`. Both are git-ignored and also stored as GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). **Back the `signing/` folder up somewhere safe**: if the key is lost you cannot publish updates under the same identity. Its SHA-256 fingerprint is in `apps/web/public/.well-known/assetlinks.json` (this is what lets links open in the app). When you use Play App Signing, add Google's app-signing fingerprint to that file too.
- **Play Store**: create a developer account (one-time US$25), create the app `online.cmcloud.sahaj`, upload the `.aab`, fill in the store listing, content rating and the Data safety form (the app collects account email/name and business data; payments are handled by Cashfree). The privacy policy URL is https://sahaj.cmcloud.online/privacy.
- **App Store**: needs an Apple Developer account (US$99/year). In Xcode set your Team on the App target, then Product → Archive → Distribute. The CI `.ipa` is unsigned: it compiles the app but cannot be installed on a phone until signed.
- **Windows**: the installer is unsigned, so SmartScreen shows "unknown publisher" until you add a code-signing certificate (set `CSC_LINK` and `CSC_KEY_PASSWORD` secrets and remove `CSC_IDENTITY_AUTO_DISCOVERY` in the workflow).

## Notes
- If an IDE terminal sets `ELECTRON_RUN_AS_NODE`, Electron behaves like plain Node. `npm start` and the tests clear it for you.
- The Android build reads `SAHAJ_URL` (default the live site). Only debug builds should ever use a local `http://` address.
- To change the icon or splash, edit `shared/make-brand.mjs`, run `npm run brand` in `shared/`, then `npm run assets` in `android/` and `ios/`.
