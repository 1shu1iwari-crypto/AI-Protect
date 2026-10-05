# Validation record

## v0.4 current results (2026-10-05)

- `npm test` (Windows: `npm.cmd test`): **53 Node + 13 Python tests pass**. New regressions cover both original semantic misses, paraphrases, actual and polite Hindi script, Hinglish, safety negation, Unicode sentence/link evasion, delayed temporal workflows, ordinary urgent banking/invoices, high-value new beneficiaries, structured-event privacy, redacted restore, two-way new-workflow re-warning, direct secret priority, pluggable semantics and extensible institution data. Native bridge tests keep call/share arrivals passive until explicit review.
- `npm run evaluate`: **84 AI-authored synthetic workflows**, **42/42 scam workflows warned**, **0/42 ordinary workflows interrupted**, and **29/29 payment scam workflows warned before simulated authorization**. The suites are reported separately: original smoke **10/10 scams, 0/10 benign interruptions**; original challenge **16/16 scams, 0/16 benign interruptions**; additive adversarial **16/16 scams, 0/16 benign interruptions**.
- The original 52 cases remain comparable: **26/26 scams** and **17/17 simulated payment interventions**, versus the recorded v0.3 **24/26** and **15/17**. `soft-coercion` and `implicit-yield` remain verbatim fixtures and now warn only at the outgoing payment action.
- Deterministic-only ablation disables both local classifiers. The semantic adapter adds **eight synthetic scam detections** and **zero benign interruptions** over that ablation. This demonstrates a contribution in these curated fixtures; it does not establish real-world ML uplift. Evaluation text is excluded verbatim from the legacy 157-text and new 97-text training files, but shared authorship/concept vocabulary and development-time fixture use prevent claiming independent validation.
- Engine p95 is approximately **0.20 ms** on Node 24.12, Windows x64, for 18,079 measured events. This includes repeated warm sessions; it is not phone, UI, ASR, WebView, battery or cold-start timing. Inspect `evaluation/results.json` for current machine-dependent measurements and model sizes. All evidence/workflow/action scores are uncalibrated heuristics.
- Android build/tests were not rerun on this Windows machine because JDK 17 and Android SDK 35 are absent. Earlier v0.3 results below are historical; the bridge and snapshot changes plus new native policy/persistence tests still need Gradle validation with that toolchain and physical-device review.
- Both current browser suites pass using installed Chrome on Windows: `npm run qa` and `npm run qa:reviews`. Checks include offline module loading, QR image decoding, private POST sharing/cache exclusion, separate consent/deletion, campaign review, responsive layouts and asynchronous native call/share staging without analysis before a user tap.

## Historical v0.2 results

- 18 Node tests plus 11 Python API/campaign tests pass (29 total).
- 52 disclosed AI-authored workflows: 24/26 scam workflows warned, 0/26 ordinary workflows interrupted, 15/17 payment scams warned before simulated authorization. Two known misses: indirect coercion and implicit investment yield. Rules-only and guarded-hybrid warning outcomes match. No ML recall improvement or real-world accuracy claim.
- Original 20 smoke cases and 32 later challenge cases are reported separately. Challenge text is excluded from the frozen 157-text training file, but shared authorship/vocabulary prevents calling this independent validation.
- Campaign checks: reverse ordering produces a separate cluster; 3 reports create a candidate; 20 ordinary -> 20 new-composition reports expose a shift cue; a stationary alternating mix stays quiet. Reporter independence and identities remain unverified.
- Headless Chromium QA: warning/cancellation/continuation, separate consent/deletion, analytics off, QR image decoding with the bundled fallback, private service-worker POST share handoff, no raw cache leakage, camera close, ordered campaign shift and analyst review, offline reload/analysis, and no document overflow at widths 320, 390, 768 and 1440px. See evaluation/browser-summary.json and docs/screenshots.
- PDF: 15 pages (10 pitch + 3 architecture + 2 appendices), rendered and visually checked. The generated technical content stands alone; actual registered team identity/eligibility must be added before upload.

## Reproduce

```
npm test
npm run evaluate
npm install --no-save playwright
npx playwright install chromium
npm run qa
```

Browser QA starts and shuts down its own disposable server/database. Set CHROMIUM_PATH to an installed browser if needed. A real physical camera and OS-level installation/share target have not been tested; browser form/worker handoff and image decoding have. Timings describe the container engine only, not UI, ASR, camera or phone hardware.

## Open evidence gaps

Licensed/consented independently labelled traffic, family/template/time splits, indirect paraphrases, regional language coverage, real-device power/memory/cold start, physical camera/OS share matrix, reporter authentication/poisoning/Sybil controls, native Android/consented ASR and bank/PSP pre-authorization integration. No voice-clone or deepfake detection accuracy is claimed.


## v0.3 review sessions and native companion (2026-10-03)

- `npm test`: **26 Node + 11 Python tests pass**. Eight added review tests cover explicit user-action gating, cross-channel session identity, verification mismatch, paid/not-paid routes, normal call/payment, redacted restore, consent, and expiry. Existing engine outcomes remain unchanged.
- `npm run qa` and `npm run qa:reviews`: both pass. The new browser suite covers the KYC hero, call consent gate, timeline, session switching/deletion, paid/no-paid guidance, mobile layout, actual QR fixture decoding, native bridge association and no automatic risk analysis. Browser screenshots are real rendered web UI; they are not presented as native-device screenshots.
- Android `assembleDebug`, `testDebugUnitTest`, `lintDebug`: **build successful, 7 native tests pass, 0 lint errors / 6 warnings**. Warnings concern deliberately pinned WebKit, required local JavaScript, backup-rule advice (review file is in noBackupFilesDir), and localization. Robolectric API 34 verifies role request, callback allow policy, outgoing handling, notification action, manifest/share route and no state persistence before action.
- No physical handset/carrier or hardware emulator was connected. Notification delivery under OEM power management, real incoming/outgoing callbacks, Android share chooser and WebView rendering must be checked using `android/README.md`. No real-device latency, power or carrier support claim.
- Synthetic evaluation remains **24/26 scams detected; 0/26 ordinary interrupted; 15/17 before simulated payment**. No new accuracy or ML uplift claim. The demo registry is two institutions, not a comprehensive bank identity service.

Next validation priorities: (1) API 29/33/35 physical-device role, notification and share testing; (2) consented Hindi/regional-language conversations and independent false-warning review; (3) authenticated campaign contributions with poisoning resistance.

## Experimental live-review change (2026-10-05)

- `npm test`: **59 Node tests and 13 Python tests pass**, including six live-review regressions for explicit consent, review identity/sequence guards, redaction, live-audio provenance, ordinary speech and bounded event history. Existing detection tests remain passing.
- Android XML files parse, and `git diff --check` passes.
- **Android compilation, Robolectric and lint are unverified for this change.** The Gradle wrapper failed to download Gradle 8.11.1 with `java.net.SocketException: Network is unreachable`; no Android SDK was present in this execution environment. Earlier Android results above belong to the earlier revision and do not validate this feature.
- `npm run qa:live` and `npm run qa:reviews` were attempted but **could not launch Chromium**, because the required Playwright browser binary is not installed here. The live-page test is committed and included in CI; it must pass in a browser-enabled environment.
- No handset, call audio, installed speech provider/language pack, battery usage or real-world warning latency was tested. On-device recognizer availability and external-audio behavior remain device dependent. This is source for a sideload prototype, not a validated APK or Play-ready release.
- CI now has separate Play and Hackathon Android jobs. Run both build/unit/lint gates and the device matrix in `android/LIVE_REVIEW.md` before using the live feature in a demonstration.
