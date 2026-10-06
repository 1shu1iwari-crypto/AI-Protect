# ScamGuard India


**Android MVP 0.5.1:** Record first, analyze afterward, or import a recording. English/Hindi models are bundled offline; microphone and floating shield remain available. See [post-call review](android/POST_CALL_REVIEW.md) for permissions, limitations, privacy and build instructions.

A pause before you pay. Privacy-first recognition of scam workflows across messages, links, consented call text, UPI intents, and simulated payments. Built for RAKSHAM **problem statement 02**.

![ScamGuard protection desk](docs/screenshots/protection-desktop.png)

## Run in one command

- **Client runtime**: Pure JavaScript running in any modern browser or Android WebView. Zero package installation or model downloads required. Offline PhiUSIIL URL model and bundled jsQR decoder operate locally.
- **Server & Scam Radar**: Python 3.10+. For full Scam Radar clustering (HDBSCAN) and streaming emergence detection (River ADWIN), install dependencies:

```bash
pip install -r requirements.txt
python backend/server.py
```

On Windows or macOS/Linux, `npm start` runs the server. If `numpy`/`scikit-learn`/`river` are not installed, the server starts with graceful radar fallback.

```bash
npm test
npm run evaluate
```

Open **http://127.0.0.1:8000**. Choose **Start KYC story** for a message → user-reviewed call → WhatsApp link → outgoing QR → STOP & VERIFY journey. **Try an ordinary payment** demonstrates a quiet legitimate flow. The presentation site at `/` showcases the architecture, reproducible benchmarks, and live Scam Radar clustering.

## Review sessions and Android

The primary flow is **Check → Reviews → explain identity and manipulation → STOP & VERIFY → optional report**. Review timelines show why the warning level changed across channels. A small local registry distinguishes verified domain matches, mismatches, unverified claims and unknown institutions. Domain matching never authenticates a caller. Paid/not-paid paths guide independent bank contact, evidence preservation, cybercrime reporting or Chakshu without submitting anything automatically.

The isolated [Android companion](android/README.md) adds CallScreeningService, platform role request, a user-triggered review notification, native share intents, offline sessions and demo mode. Build the manual-review flavor with `cd android && ./gradlew :app:assemblePlayDebug`; Windows uses `gradlew.bat`. The web app needs no Android tooling. The Play flavor has no Internet, microphone, or accessibility permission. The separate `hackathon` flavor adds explicit-consent acoustic microphone review, an accessibility shield, and on-device speech recognition on compatible Android 13+ devices. It is for sideload testing only. See [live review setup and limitations](android/LIVE_REVIEW.md). Neither flavor requests Internet access; local web campaign reporting remains separate.

## What is built

- **TICE (Transaction Intent Consistency Engine)**: Detects logical contradictions between sender pretext and financial action before money moves (e.g., verbal refund claims paired with outgoing debit requests, official authority claims demanding remote access or APK sideloads, and investment withdrawals demanding advance unlock fees).
- **Zero-Network PhiUSIIL URL Lexical AI**: Offline JavaScript inference over 21 static lexical features (`core/url-model.json`), trained with scikit-learn on domain-partitioned PhiUSIIL phishing URLs without network lookups.
- **64-Dimensional Behavioral Trajectory Representation**: Maps multi-step scam sessions into an inspectable 64-dimensional behavioral feature vector capturing tactics, channel hops, pacing, and intent contradictions without storing or transmitting raw text, audio, or payee details.
- **Scam Radar (HDBSCAN + River ADWIN)**: Unsupervised density clustering over behavioral trajectories to detect emerging zero-day attack compositions, paired with River ADWIN streaming drift detection to identify campaign velocity shifts upon report ingestion.
- **Action-Aware Guarded Decision Policy**: Structured privacy-safe evidence events, explicit ordered workflow states, session expiry, bounded event memory, separate heuristic evidence/workflow/action scores, action-aware warning gates, repeat suppression, and re-warning for increased financial stakes.
- **Privacy-by-Construction Fingerprinting**: Local Python/SQLite fingerprint API with explicit consent, enum-only schemas, deduplication, 24-hour retention, deletion capability, rate limiting, and an analyst token gate.

## Measured evidence and its limits

`evaluation/results.json` is generated directly by `npm run evaluate`:
- **External PhiUSIIL Phishing URL Holdout**: Evaluated on 10,000 URLs partitioned strictly by registrable domain hash (0 domain overlap between train and test): **87.91% accuracy**, **98.69% precision**, **76.45% recall**, **86.16% F1 score** with 0 network lookups.
- **UCI SMS Alert Fatigue Benchmark**: All 4,827 authentic legitimate messages from the UCI SMS Spam Collection evaluated through the live ScamGuard engine: **1 false alert** (**0.02% false alert rate**), confirming <1 alert per 1,000 legitimate sessions.
- **Leave-One-Family-Out (LOFO) Zero-Day Novelty**: Evaluated across RBI-derived fraud families with held-out centroids genuinely excluded: **100% zero-day detection rate** (mean mathematical novelty **0.4603** > 0.35 threshold).
- **Multilingual Concept Extraction**: Tested on raw text without ground-truth label leakage: English **100% recall**, Hinglish **92.9% recall**, Hindi **57.1% recall** (honest lexical baseline).
- **Synthetic Regression Harness**: 84 multi-channel workflows: **42/42 scam workflows warned**, **0/42 ordinary workflows interrupted**, **100% pre-payment coverage**. Engine p95 latency is ~**0.20 ms**.

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
