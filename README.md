# ScamGuard India

A pause before you pay. Privacy-first recognition of scam workflows across messages, links, consented call text, UPI intents, and simulated payments. Built for RAKSHAM **problem statement 02**.

![ScamGuard protection desk](docs/screenshots/protection-desktop.png)

## Run in one command

Python 3.10+ is enough to serve the application. Node 20+ runs tests and evaluation. No package installation, API keys, paid services, or model downloads are required at runtime. The Apache-2.0 jsQR decoder is bundled with its license.

```bash
python3 backend/server.py
```

On Windows, use `python backend/server.py`; `npm start` also selects an installed Python 3.10+ interpreter. Tests and evaluation use the same platform-compatible helper.

Open **http://127.0.0.1:8000**. Choose **Start KYC story** for a message → user-reviewed call → WhatsApp link → outgoing QR → STOP & VERIFY journey. **Try an ordinary payment** demonstrates a quiet legitimate flow. The original scenario lab remains available under Reviews. Try the restaurant scenario to see an ordinary payment remain uninterrupted.

```bash
npm test
npm run evaluate
```

The installable phone-first PWA caches its fixed assets after one successful visit. Where Web Share Target is supported, an installed app accepts shared text/links through a local POST intercepted by its service worker. The server never receives that raw text. A random single-use fragment transfers worker memory to the app; it is never cached and expires within 60 seconds. The user still chooses Check. Local checks work offline; sharing and campaign review require the local server. It never requests microphone, call log, notification, SMS or banking access. Camera permission is requested only after tapping Scan, for local QR frames. QR screenshots have a bundled jsQR fallback; decoded UPI paste also works.

## Review sessions and Android

The primary flow is **Check → Reviews → explain identity and manipulation → STOP & VERIFY → optional report**. Review timelines show why the warning level changed across channels. A small local registry distinguishes verified domain matches, mismatches, unverified claims and unknown institutions. Domain matching never authenticates a caller. Paid/not-paid paths guide independent bank contact, evidence preservation, cybercrime reporting or Chakshu without submitting anything automatically.

The isolated [Android companion](android/README.md) adds CallScreeningService, platform role request, a user-triggered review notification, native share intents, offline sessions and demo mode. Build the manual-review flavor with `cd android && ./gradlew :app:assemblePlayDebug`; Windows uses `gradlew.bat`. The web app needs no Android tooling. The Play flavor has no Internet, microphone, or accessibility permission. The separate `hackathon` flavor adds explicit-consent acoustic microphone review, an accessibility shield, and on-device speech recognition on compatible Android 13+ devices. It is for sideload testing only. See [live review setup and limitations](android/LIVE_REVIEW.md). Neither flavor requests Internet access; local web campaign reporting remains separate.

## What is built

- The original eleven word/bigram logistic heads trained on **157 disclosed AI-authored synthetic texts** remain supported. A small local multi-label classifier learns multilingual concept combinations from separate synthetic seeds, behind a replaceable semantic interface. Neither model needs network inference or runtime downloads. Its finite vocabulary needs independent validation.
- Structured privacy-safe evidence events, explicit ordered workflow states, session expiry, bounded event memory, separate heuristic evidence/workflow/action scores, action-aware warning gates, repeat suppression, and re-warning for increased financial stakes. These scores are not calibrated scam probabilities.
- Strict outgoing UPI parser; duplicate critical fields, invalid amounts and unsupported currencies are rejected. Payee values and exact amounts are discarded after extraction. The app never follows suspicious URLs.
- 84 synthetic multi-channel workflows: the original 20 smoke and 32 challenge cases plus 32 additive adversarial cases. Suites remain separately comparable; indirect coercion and implicit yield are retained as regressions rather than removed from the challenge data.
- Local Python/SQLite fingerprint API with explicit consent, enum-only schemas, deduplication, 24-hour retention, deletion capability, rate limiting, same-origin checks and an analyst token gate.
- Order-aware candidate campaign clustering with tactic Jaccard and LCS similarity, plus a two-window Hoeffding change cue on 40 reports. The cue assumes independent reports and never establishes fraud. Candidates are unverified and never create an automatic blacklist.
- Optional allowlisted PostHog usage events, off by default and independent of pattern-sharing consent. No SDK, autocapture, replay, person profile, free-text property or persistent analytics ID.
- Responsive protection desk, guided scenario lab, campaign inbox, validation view, privacy controls and redacted report export.

## Measured evidence and its limits

`evaluation/results.json` is generated by `npm run evaluate`. v0.4 warned on **42/42 synthetic scam workflows**, interrupted **0/42 ordinary workflows**, and warned on **29/29 payment scam workflows before simulated authorization**. The original 52 cases remain separately comparable: **26/26 scams**, **0/26 ordinary interruptions**, **17/17 simulated payment interventions**, compared with the recorded v0.3 baseline of 24/26 scams and 15/17 payment interventions. Both original indirect coercion and implicit yield cases now warn at the outgoing payment action. The semantic adapter adds eight synthetic scam detections over deterministic-only ablation and no benign interruptions in these fixtures. Engine timing is measured on a Windows development machine, **not a phone**. These correlated AI-authored cases were used during implementation; they are regression evidence, not independent validation or a population accuracy estimate. Holdouts reuse known tactics and do not prove generalization. PR-AUC and calibrated risk probabilities are not claimed.

## Phone and browser checks

On Chrome for Android, serve the PWA over HTTPS (or localhost through your development setup), open it once, and install it using the browser menu. Share-target availability depends on platform/browser; paste remains available everywhere. Camera scanning also needs a secure context. This repository ships a local development server, not a public production deployment.

For development QA: install Playwright with `npm install --no-save playwright`, then `npx playwright install chromium`, `npm run qa` and `npm run qa:reviews`. The QA runner starts its own disposable server/database. `CHROMIUM_PATH` can select an existing browser. It checks QR decoding, local POST sharing, cache privacy, consent/deletion, campaign shift/review, offline analysis and 320-1440px layouts.

## Optional local configuration

```bash
export SCAMGUARD_REVIEW_TOKEN='choose-a-long-random-secret'
python3 backend/server.py
```

Set the analyst token only on the operator's machine; do not commit it. Review changes candidate status only. No threat policy is published.

For anonymous analytics, configure `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). The user must separately opt in for that visit. Only eight named events and coarse enums are sent. Labelled simulator checks and unlabelled user checks have separate source enums. Transport failures are best-effort and never delay detection. See [analytics contract](docs/ANALYTICS.md). The project token is intentionally absent from the repository.

## Honest prototype boundary

This is a working **web/PWA and isolated Android PoC**, not a banking integration. Calls are reviewed using user-selected signals or supplied text; payments are simulated. Android call screening offers a review shortcut and never blocks or records calls. Carrier/device delivery has not been validated on a physical phone. ASR, partner payment hooks, robust reporter authentication, transaction graphs, real datasets and device measurements remain roadmap work. PWA sharing and QR input are implemented; they are not unrestricted cross-app monitoring. Never deploy this local server publicly without authentication, TLS, durable consent controls and a security review.

## Project files

| Path | Purpose |
|---|---|
| `core/` | Existing risk engine plus review lifecycle, verification registry and response plans |
| `android/` | Optional native call-role/share shell, Gradle build and device instructions |
| `web/` | Responsive application, optional analytics and offline cache |
| `backend/` | Local-only strict fingerprint API and candidate review |
| `ml/` | Reproducible synthetic model training and training data |
| `simulator/` | Disclosed scam and ordinary scenario fixtures |
| `evaluation/` | Reproducible metrics and per-scenario outcomes |
| `tests/` | Engine, privacy, consent, API and browser checks |
| `docs/` | Architecture, safeguards, roadmap, submission PDF and disclosure |

Retrain only when needed: `python3 -m pip install -r requirements-training.txt`, then `python3 ml/train.py`. Runtime inference does not depend on scikit-learn.
The separate concept classifier can be reproduced with `node ml/train-semantic.mjs`; its 97 disclosed synthetic seeds and generated coefficients require no added training dependencies.

Before contest upload: add your actual team members and eligibility details to the submission cover; check the organiser's registration portal and requirements. No registration or submission has been made by this project.

See [validation record](docs/VALIDATION.md), and the [standalone submission PDF](docs/ScamGuard-RAKSHAM-Submission.pdf).
