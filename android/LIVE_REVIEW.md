# Experimental live call review

The `hackathon` flavor implements the requested opt-in microphone review. The
`play` flavor preserves manual signals and shared text/QR review with no
microphone permission or accessibility service. Flavor names do not certify
store approval. The live flavor is for a consenting-device, sideload experiment.

## Build

Use JDK 17, Android SDK 35 and Build Tools 35.0.0:

```bash
cd android
./gradlew :app:assembleHackathonDebug :app:testHackathonDebugUnitTest :app:lintHackathonDebug
adb install -r app/build/outputs/apk/hackathon/debug/app-hackathon-debug.apk
```

Windows: replace `./gradlew` with `gradlew.bat`. The application ID is
`in.aiprotect.companion.hackathon`; it can coexist with the Play/manual flavor.
Only one installed app can hold the call-screening role at a time. Live review
requires Android 13/API 33 or later, a current Android System WebView, and an
installed on-device speech recognizer with the selected `en-IN` or `hi-IN` model.
There is no bundled ASR model or automatic download. Configure speech packs using
your device's speech-recognition settings before testing. Hinglish has no
separate model or accuracy guarantee; evaluate it using both language choices.

## Use

1. Open the hackathon app and use **Call setup** to select its call-screening
   role and enable review notifications.
2. Choose **Experimental live review → Enable review shield**. Read Android's
   disclosure and manually enable AI-Protect's accessibility service. It requests
   no screen-retrieval or gesture capability and subscribes to no screen events.
3. Return and allow microphone and notification permissions. Granting permission
   is not consent to start: **Start Review** is a separate action.
4. On an eligible real call, the shield and notification offer review. Tapping
   either opens the disclosure. Choose English or Hindi, then **Start Review**.
   Use speakerphone yourself; AI-Protect never presses the dialer's controls.
5. When listening starts, the consent screen moves behind the current task.
   The visible microphone notification has a **Stop Review** action. The shield
   displays quiet/watch/warning/high with derived signal labels.
6. Stop through the shield, notification, or consent screen. Opening the full
   saved review also stops capture and reloads the derived timeline. Later
   shared messages, links and QR evidence can be added to that active review.

**Demo call** continues to offer the existing manual-signal dialog; its
notification can open live consent. No demo action places a real call.

## Data and lifecycle

`ReviewNotifications → LiveReviewCoordinator → consent activity → microphone
foreground service → AudioRecord → energy VAD/chunker → LocalTranscriber →
TranscriptAggregator → service-owned WebView → existing ReviewSession.add()`.

- Call screening still allows incoming calls immediately, before any UI work.
  Caller handles, contact names and phone numbers are never read.
- Consent uses a one-use in-process token that expires after ten seconds. The
  foreground service is private, is not sticky, and cannot restore consent after
  process death. Repeated start requests cannot create concurrent capture.
- PCM16 mono input is 16 kHz, with 20 ms frames. An energy gate drops silence,
  retains 160 ms of pre-roll, and emits at 600 ms trailing silence or six seconds.
  This simple VAD can miss quiet speech or treat noise as speech.
- At most one six-second segment is being transcribed, two are queued, and one
  is being assembled (about 24 seconds of app PCM plus small pipe/device buffers).
  Backpressure stops review with an explanation instead of unbounded buffering
  or silently skipping speech. PCM buffers are overwritten when released; Java
  and recognizer internals do not offer a forensic erasure guarantee.
- ASR uses only `SpeechRecognizer.createOnDeviceSpeechRecognizer` and an anonymous
  `ParcelFileDescriptor` audio pipe. It verifies the installed language before
  activating AudioRecord. There is no network recognizer fallback. Providers
  differ in support for external PCM; Android allows providers to ignore that
  extra and use their microphone instead. Real-device validation is mandatory.
  A provider error or timeout stops review. No recognizer accuracy is claimed.
- Only final phrases are analyzed; partial ASR hypotheses are ignored. A
  short-lived digest suppresses immediate duplicate finals. Text is transient,
  limited to 2,000 characters per engine message, never logged or stored.
- The background service owns its own origin-restricted WebView and reuses
  `core/review.mjs`, `workflow.mjs`, and `policy.mjs`. It does not depend on a
  visible MainActivity. Sequence and review-ID checks reject replayed fragments.
  Derived responses pass through `ReviewSnapshotPolicy` before storage or UI.
- Saved events use `live_call_audio` provenance, distinct from manual signals.
  Existing 64-event, ten-review and retention bounds apply. No extra transcript,
  raw audio, phone number, OTP or financial identifier is added to snapshots.
- MainActivity stops the service before opening editable review state. Native
  writes from an older backgrounded review page are rejected while capture is
  active. This avoids two independent writers overwriting a live timeline.
- Stop, accessibility disconnection, task removal, capture/ASR/engine errors,
  or the ten-minute safety timeout close capture, pipes and the engine. Starting
  again always requires fresh consent. Call-end auto-detection is not claimed;
  no `READ_PHONE_STATE` permission was added. Tap Stop when the call ends.

## What this cannot promise

Microphone access is not direct telecom audio access. Speakerphone is the best
acoustic test route; earpiece, wired headsets and Bluetooth may not provide useful
remote-party audio. Device microphone arbitration may return silence. Fifteen
seconds of digital zero input stops review; other silence/noise is handled by
VAD. Quiet means no strong detected pattern, not that the caller is trustworthy.

Risk levels come unchanged from the existing heuristic engine. A bank/urgency/OTP
sequence may produce warning rather than high; this patch does not inflate
scores to make the demonstration look stronger. Scores are not probabilities.

Accessibility-based remote call recording is not an appropriate Play-distribution
path. Keep this experiment in the hackathon flavor. Do not present platform ASR
availability, accuracy, carrier coverage, or store approval as validated facts.

## Verification

Run `npm test` for consent/session replay checks, source-text redaction, live
provenance restoration, normal conversation, and cross-channel continuation.
`npm run qa:live` exercises the packaged service page with a mocked native
transport in Chromium; it is not a microphone or Android test.
CI now builds, unit-tests and lints both Android flavors separately. Native tests
include one-use/expired consent, accessibility loss, active-session ownership,
silence rejection, bounded speech chunks and final-result deduplication.

Before demonstrating on a real phone, record results for:

| Dimension | Cases |
| --- | --- |
| Device/API | Pixel, Samsung, another OEM; Android 13/14/15/16 as available |
| Calls/routes | Incoming/outgoing; speakerphone/earpiece/wired/Bluetooth |
| Language | English, Hindi, Hinglish; speech pack missing |
| Consent | Dismiss, deny microphone/notifications, revoke accessibility, retry |
| Failure | Silence, recognizer error, slow ASR, engine crash, task removal, process kill |
| Privacy | Saved state contains only derived enums, not spoken canary identifiers |
| Outcome | Warning arrives before dangerous action; benign conversation stays quiet |
| Stop | All Stop controls, opening review, ten-minute limit; no auto restart |

References:
- [Audio input sharing and call limitations](https://developer.android.com/media/platform/sharing-audio-input)
- [On-device SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [RecognizerIntent external audio source](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_AUDIO_SOURCE)
- [Microphone foreground services](https://developer.android.com/develop/background-work/services/fgs/service-types#microphone)
- [Accessibility API policy](https://support.google.com/googleplay/android-developer/answer/16558241)
