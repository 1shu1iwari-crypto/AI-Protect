# Post-call review MVP (0.5.1)

The hackathon APK now opens **Record or upload a call · review afterward**. The
floating shield, manual reviews and optional experimental real-time mode remain.
The `play` flavor stays manual-only. This is a sideload/testing MVP, not a claim
of store approval or universal call-recording support.

## Use

1. Open **AI-Protect MVP** (Android 13+). Choose English (India) or Hindi.
2. To review an existing recording, tap **Choose a recording to review**, select
   audio in Android's document picker, and confirm **Analyze**. Import needs
   report notifications, not microphone permission or Accessibility. Common
   MP3, WAV and M4A recordings work when the device supplies a decoder.
3. To record, enable the floating review shield and microphone/report
   permissions. Tap **Record & review later**, read the consent disclosure and
   tap **Start recording**. Make participants aware. Use speakerphone.
4. Tap **Stop recording & analyze** in the app, shield or ongoing notification.
   Optionally grant phone-state permission to finish on an observed active SIM
   call ending. This uses the default subscription; internet/VoIP calls and
   unsupported SIM configurations require manual Stop. Initial idle/ringing
   callbacks cannot end or start a recording.
5. After capture stops, offline ASR runs and the existing scam engine assesses
   recognized phrases. A report notification opens the result. Reports explain
   detected signs; **no strong signs is not proof that a call is safe**. Fewer
   than five recognized words yields **insufficient speech**.

Recording/import is bounded to ten minutes (recording automatically stops just
before that limit) and imports to 60 MiB. First analysis copies its bundled
speech model into private storage. This takes extra time and space. Keep the
app running; native speech recognition uses substantial memory. English and
Hindi models are included in the APK, so no installed Google/Vivo recognizer
or network connection is needed for this new path. The old real-time path
still depends on the device's on-device SpeechRecognizer.

## Android limitation

Deferring analysis reduces concurrent CPU work but cannot bypass Android audio
routing. A normal sideloaded app does not gain the privileged
`CAPTURE_AUDIO_OUTPUT` permission. Accessibility may allow microphone sharing,
but it does not guarantee both call participants are captured. Bluetooth,
earphones, device audio routing and OEM policies affect recording. Detected
silencing fails explicitly and suggests importing the phone recorder's file.

References: https://developer.android.com/media/platform/sharing-audio-input
and https://alphacephei.com/vosk/models .

## Data and lifecycle

- Consent grants are process-local, single use and expire in ten seconds.
  Call callbacks never authorize recording. Only one audio review runs at once.
- During capture only PCM is written; no ASR/model/risk WebView is running.
  After the recorder is closed, the foreground service changes to media
  processing on Android 15+, or data sync for local processing on Android 13–14.
- Raw PCM and import copies are in private backup-excluded storage. They are
  deleted on success, failure or cancellation. Process death cannot run cleanup:
  leftovers are deleted on the next review-screen launch; a minimal job marker
  explains interruption. Removing the task cancels microphone capture.
- The original imported file is never modified. No audio upload, network
  permission, full transcript persistence, contacts, call logs or screen scraping.
- Only redacted evidence snapshots and derived summaries are saved. Summaries
  are bounded to ten and expire after 24 hours when accessed. Delete report also
  deletes its evidence snapshot. No partial verdict is committed on failure.
- Recording and report notification channels must be enabled. Microphone,
  cancellation and analysis state remain visible; cancellation deletes raw data.
- Optional READ_PHONE_STATE observes call state only. Disabling Accessibility
  cancels recording but does not stop analysis of already captured/imported audio.

## Build

Use JDK 17, Gradle 8.11.1, Android SDK 35 and Python 3. Then from `android/`:

```sh
gradle :app:assembleHackathonDebug :app:testHackathonDebugUnitTest :app:lintHackathonDebug
```

`prepare_speech_models.py` downloads SHA-256-pinned Apache-2.0 Indian English
and Hindi Vosk archives into generated assets. No models/binaries are committed.
Set `AIPROTECT_MODEL_CACHE` to reuse archives; `AIPROTECT_PYTHON` selects Python.
Vosk Android 0.3.75 and JNA 5.18.1 ship native libraries for ARM64, ARMv7, x86 and
x86_64. APK size is about 100 MiB including models and four supported ABIs. Native libraries are compressed and extracted by Android during installation.

The package is `in.aiprotect.companion.mvp`, version 0.5.1-hackathon, code 5001.
It installs alongside the earlier `.hackathon` package because the original
signing key was not available. Future builds can use the same private debug
keystore via `AIPROTECT_DEBUG_KEYSTORE`. Never commit keys; debug signing is for
MVP testing, not a production distribution policy.

## Physical-phone acceptance checks

Build/tests alone do not validate Vivo call routing, OEM background process
management, microphone hardware or actual ASR accuracy. Before a demo:

- Import clear English and Hindi recordings; confirm a report while offline.
- Import silence and confirm insufficient speech, not a safe verdict.
- Import a recording containing a demand for OTP/payment and inspect evidence;
  compare with a recording advising never to share OTP. ASR can change words.
- Record a short ordinary conversation, Stop, and confirm the mic indicator
  closes before analysis. Cancel during recording and analysis.
- With consenting participants, try a speakerphone SIM call. Confirm observed
  end stops recording; repeat without phone-state permission using manual Stop.
- Test phone/notification/Accessibility permission denial and process restart.
- Expect explicit failure/import fallback on phones that silence capture.

## Build verification (2026-10-06)

- 60 JavaScript tests and 13 Python tests passed.
- 24 Android unit tests passed (8 deferred-audio, 5 live-review, 11 companion).
- `assembleHackathonDebug`, `testHackathonDebugUnitTest`, and
  `lintHackathonDebug` completed successfully. Lint: 0 errors, 46 warnings
  (including untranslated native labels and existing WebView feature-check,
  dependency and backup-configuration warnings).
- APK signature v2, 16 KiB ZIP alignment and ZIP integrity passed. Both models
  and ARM64 Vosk/JNA libraries are present.
- Artifact: `AI-Protect-MVP-0.5.0-post-call.apk`.
  SHA-256: `77f74b2c0a29d466a5a32f94f41556442b523997bf6587d63335f39898462dd0`.
- Physical Vivo hardware, actual call routing and transcription accuracy were
  not tested in this build environment; run the acceptance checks above.

## Installer compatibility rebuild (0.5.1)

After a reported Vivo parsing error, the original file still passed host ZIP,
manifest and v2 signature validation. Android 13+ was confirmed by the tester;
the precise device-side failure code was unavailable. This rebuild is a
compatibility mitigation, not proof of the original root cause.

- Enable v1, v2 and v3 signing with the same private MVP debug keystore.
- Compress/extract native libraries using legacy JNI packaging.
- Include only the four ABIs for which both Vosk and JNA provide libraries;
  exclude JNA-only obsolete armeabi/MIPS entries.
- Preserve recording, import, English/Hindi models and floating Accessibility.
- Bump version to 0.5.1 so an existing same-key MVP install can be updated.
- Deliver a ZIP option so extraction checks transfer integrity before install.
- Artifact: `AI-Protect-MVP-0.5.1-compatible.apk`, 105,113,429 bytes.
  SHA-256: `6c40d101eee6f97c72792d337578cd762e6e8c27c52243d381d924939816126f`.
- JavaScript tests (60), Python tests (13), APK build and lint passed. Native
  application code is unchanged from the 24-test-validated 0.5.0 build.
- Signature schemes verified independently with API-appropriate verifier ranges;
  ZIP integrity and ZIP alignment passed.

## Shared recording entry point

Recordings can now be shared directly from Recorder, WhatsApp or Files to AI-Protect MVP. The app waits for a separate Analyze tap and imports need no recording/accessibility permission. The pipeline uses timestamped local ASR, separate financial/voice/identity outcomes, transcript correction, offline spoken explanation, payment-status response and redacted exports. See [SHARED_RECORDING_REVIEW.md](SHARED_RECORDING_REVIEW.md) for optional Whisper builds and the physical-device matrix. Voice authenticity is inconclusive until a validated native detector is installed; the emulator-only automatic upload has been removed.
