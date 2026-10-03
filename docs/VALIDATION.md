# Validation record - v0.2.0

## Completed

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
