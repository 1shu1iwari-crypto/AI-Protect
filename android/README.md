# AI-Protect Android companion (real-device PoC)


**Android MVP 0.5.0:** Record first, analyze afterward, or import a recording. English/Hindi models are bundled offline; microphone and floating shield remain available. See [post-call review](POST_CALL_REVIEW.md) for permissions, limitations, privacy and build instructions.

Kotlin native role / notification / share shell, with the existing offline `web/` review UI and `core/` risk engine packaged through AndroidX WebViewAssetLoader. No backend, keys or network permission required. The main Python/PWA run remains unchanged. Uses native Android widgets instead of adding a second Compose review implementation.

## Build and install

Use JDK **17**, Android SDK **35** and Build Tools **35.0.0**. Open `android/` in Android Studio, let it install missing SDK packages, and select JDK 17 for Gradle. Alternatively set `ANDROID_HOME` to your SDK directory.

```bash
cd android
./gradlew :app:assemblePlayDebug :app:testPlayDebugUnitTest :app:lintPlayDebug
adb install -r app/build/outputs/apk/play/debug/app-play-debug.apk
```

Windows: use `gradlew.bat` in place of `./gradlew`. Debug APK: `android/app/build/outputs/apk/play/debug/app-play-debug.apk` from the repository root. Initial build downloads Gradle/dependencies; installed app runs offline. APK is debug-signed for testing, not a Play Store release.

## On a physical phone (Play/manual flavor)

1. Android **10 / API 29 or later**, with an up-to-date Android System WebView. Install the APK via ADB, or temporarily allow installation from the app opening the APK.
2. Open **AI-Protect → Call setup → Choose call role**. Select AI-Protect for **caller ID / spam (call screening)**. This replaces whichever app previously held that single role. AI-Protect never blocks calls.
3. Open **Call setup → Notifications** and allow notifications. Android 13+ requires runtime permission. Ensure the **Review a call** channel is enabled. Role and notification permission are separate.
4. Tap **Demo call → Incoming call**. The notification and dialog offer **Review this call**. Dismiss either without reviewing: no analysis or Review Session has been created. Tap Review, choose signals, then **Review these signals**.
5. From a messaging/photo app, use **Share → AI-Protect** for text, URL, UPI payload or one screenshot. It is staged in the active review. Tap **Check** to add it. Use Reviews to switch sessions or New review for an unrelated request. No QR payment is executed.
6. Tap **After call**, then **No / Yes** to choose the response path. This button is user-driven, not a claim to detect call end. Official reporting links open your browser; 1930 opens the dialer without placing a call.
7. Test a real incoming call from a consenting second phone **not in contacts**. Keep normal ringing/answering behavior. Check the review notification. Test an outgoing eligible call separately; support varies by Telecom implementation.

The Play/manual flavor requests no microphone, recording, contacts, call-log, SMS, accessibility, overlay, storage-wide or Internet permission. The separately installed [hackathon live-review flavor](LIVE_REVIEW.md) adds only consented microphone/foreground-service access and a protected accessibility overlay service. Screenshot selection uses a temporary content URI grant. Android's camera path is disabled in this PoC; share a QR screenshot instead. Web/PWA camera scanning remains available.

For the separate experimental APK, see [LIVE_REVIEW.md](LIVE_REVIEW.md). Existing manual call signals and shared text/QR reviews remain available in both flavors.

## Test deep links (no real call)

```bash
adb shell am start -a android.intent.action.VIEW -d 'aiprotect://review/demo-review-12345678?direction=incoming' in.aiprotect.companion
adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT 'HDFC: update KYC immediately at https://kyc.example.invalid' in.aiprotect.companion
```

The deep link opens the named review and quick signals. Opening alone does not run the risk engine. Reuse the same ID to open that review. Sharing stages content only; **Check** is always required.

## Device/API limits

- CallScreeningService receives eligible Telecom calls, typically numbers outside contacts when READ_CONTACTS is not granted. Restricted/unknown presentations and non-`tel:` calls may not be delivered. WhatsApp/VoIP calls are not universally exposed. OEM behavior and outgoing callbacks vary.
- Incoming calls are immediately allowed inside the platform's five-second deadline. There is no outgoing blocking response, full dialer, phone-number storage, call recording or background content collection.
- Review notifications are private on the lock screen, dismissible, replaced by the next eligible call, and expire after 20 minutes. Notification denial, disabled channels, force-stop and device restrictions can prevent delivery. Manual Review Call and Demo call remain available.
- Redacted review snapshots survive process restart in app-private backup-excluded storage, bounded to 10 reviews. Snapshots expire on next access after 24 hours; Android cannot promise wall-clock deletion while the app is stopped. Risk context still resets after 20 minutes between events. Delete review removes that local review. Exported files remain under your control.
- Raw text/images are transient. Images are capped at 6 MB and decoded locally; there is no OCR. A non-QR screenshot can be recorded as evidence metadata after Check, without claiming to interpret its pixels. Preserve original receipts/screenshots separately.
- This offline companion cannot upload campaigns or analytics. Export derived evidence, or use the one-command web app for consented local campaign contributions. External bank/cybercrime/Chakshu routes are guidance, not API integrations.
- No hardware phone or carrier was connected in the build environment. Robolectric and browser-bridge tests do not substitute for the physical-phone steps above.

Platform references: [CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService), [screen calls](https://developer.android.com/develop/connectivity/telecom/dialer-app/screen-calls), [local web content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).
