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
npm run evaluate:all
```

`npm run evaluate:all` reproduces the complete evaluation: running `python evaluation/benchmark.py` against independent datasets (PhiUSIIL, UCI SMS, LOFO, multilingual) followed by `node evaluation/run.mjs` across all 84 multi-channel workflows. Individual suites can be run via `npm run benchmark` or `npm run evaluate`.

Open **http://127.0.0.1:8000**. Choose **Start KYC story** for a message → user-reviewed call → WhatsApp link → outgoing QR → STOP & VERIFY journey. **Try an ordinary payment** demonstrates a quiet legitimate flow. The presentation site at `/` showcases the architecture, reproducible benchmarks, and live Scam Radar clustering.

## Review sessions and Android

The primary flow is **Check → Reviews → explain identity and manipulation → STOP & VERIFY → optional report**. Review timelines show why the warning level changed across channels. A small local registry distinguishes verified domain matches, mismatches, unverified claims and unknown institutions. Domain matching never authenticates a caller. Paid/not-paid paths guide independent bank contact, evidence preservation, cybercrime reporting or Chakshu without submitting anything automatically.

The isolated [Android companion](android/README.md) adds CallScreeningService, platform role request, a user-triggered review notification, native share intents, offline sessions and demo mode. Build the manual-review flavor with `cd android && ./gradlew :app:assemblePlayDebug`; Windows uses `gradlew.bat`. The web app needs no Android tooling. The Play flavor has no Internet, microphone, or accessibility permission. The separate `hackathon` flavor adds explicit-consent acoustic microphone review, an accessibility shield, and on-device speech recognition on compatible Android 13+ devices. It is for sideload testing only. See [live review setup and limitations](android/LIVE_REVIEW.md). Neither flavor requests Internet access; local web campaign reporting remains separate.

## What is built

- **Financial Intent Frames (FIF)**: Structured local representations for financial meaning (`core/financial-intent.mjs`) extracting claim directions, counterparty roles, purposes, verification suppression, and financial redirection euphemisms ("move liquidity", "settlement handshake", "temporary holding account") with clause-level advice negation. Strict privacy scrubbing ensures exact amounts are never uploaded or retained.
- **Causal Event Relationship Resolver in TICE**: Replaces brittle global matching with causal relationship scoring (`core/event-relation.mjs`), linking earlier claims to later payment actions via deictic references, amount alignment, and role consistency (calibrated threshold $\ge 0.50$). Completely prevents false credit-vs-debit contradictions on legitimate multi-step workflows (e.g. employer reimbursement followed by roommate expense split).
- **Separated Action-Risk Semantics**: Decouples `requestedActionRisk` (what the counterparty is coercing the user to do) from `executionRisk` (actual user actions such as scanning an outgoing QR or preparing a UPI transfer). Messages demanding transfers elevate requested risk without triggering intrusive "Stop & verify" warnings until execution occurs, preserving strict action gating.
- **PSL-Backed Domain Parser & Brand Spoofing Defense**: Robust Public Suffix List multi-level domain extraction (`core/domain-parser.mjs`) correctly parsing `.co.in`, `.co.uk`, and identifying brand mismatches (e.g. `secure-login.sbi.co.in.account-verification.support` flags Brand: SBI, Actual Domain: `account-verification.support`) alongside adversarial evasion checks.
- **Zero-Network PhiUSIIL URL Lexical AI**: Offline JavaScript inference over 10 static lexical features (`core/url-model.json`), trained with scikit-learn on domain-partitioned PhiUSIIL phishing URLs without network lookups.
- **64-Dimensional Behavioral Trajectory Representation**: Maps multi-step scam sessions into an inspectable 64-dimensional behavioral feature vector capturing tactics, channel hops, pacing, and intent contradictions without storing or transmitting raw text, audio, or payee details.
- **Scam Radar (HDBSCAN + River ADWIN)**: Unsupervised density clustering over behavioral trajectories to detect emerging zero-day attack compositions, paired with River ADWIN streaming drift detection to identify campaign velocity shifts upon report ingestion.
- **Pluggable Semantic Provider Architecture**: Modular semantic interface (`core/semantic-provider.mjs`) supporting fast on-device concept heads as default, with a pluggable quantized INT8 Multilingual-E5 / MuRIL embedding adapter.

## Measured evidence and its limits

`evaluation/benchmark_results.json` and `evaluation/results.json` are generated directly by `npm run evaluate:all`:
- **4-Way Architectural Ablation**:
  - *Config A (Rules only)*: 56.2% hard-case recall, 100.0% TICE false positive rate (un-gated matching falsely warns on legitimate reimbursement).
  - *Config B (Existing hybrid)*: 68.8% hard-case recall, 100.0% TICE false positive rate, 0.25 ms latency.
  - *Config C (Production ScamGuard: FIF + Causal TICE + PSL)*: **100.0% hard-case recall**, **0.0% TICE false positive rate**, 71.4% Hindi recall, 92.9% Hinglish recall, **99.98% benign specificity**, **0.36 ms latency**, 0.05 MB model size.
  - *Config D (Config C + Quantized Multilingual-E5)*: **100.0% hard-case recall**, **0.0% TICE FP rate**, 85.7% Hindi recall, 14.8 ms latency, 118.4 MB model size.
- **End-to-End Radar Zero-Day Clustering**: Raw multi-step sessions processed through the entire extractor $\rightarrow$ FIF $\rightarrow$ trajectory pipeline with **zero manual vector edits**: **100.0% novel family detection rate**, **100.0% HDBSCAN cluster purity**, mean novelty **0.4939**, correctly identifying closest known family as *Task / Advance Fee Unlock* (0.5061 similarity).
- **External PhiUSIIL Phishing URL Holdout**: Evaluated on held-out URLs partitioned strictly by true registrable domain with multi-level public suffix handling (0 domain overlap between train and test): **88.57% accuracy**, **98.81% precision**, **76.86% recall** with 0 network lookups. High precision minimizes false alarms on benign links.
- **Authentic SMS Single-Message Alert Burden**: All 4,827 authentic legitimate messages from the UCI SMS Spam Collection evaluated through the live ScamGuard engine: **1 false alert** (**0.02% false alert rate** on isolated messages). Realistic multi-stage legitimate journeys are separately validated in the 42 synthetic benign workflows.
- **Held-Out Family Novelty Separation (LOFO)**: Evaluated across RBI-derived fraud families with held-out prototypes genuinely excluded: **4/4 families separated** (**100%**, mean novelty **0.4603** > 0.35 threshold). *Note: Measures prototype separation in feature space rather than a population-level zero-day recall claim.*
- **Synthetic Regression Harness**: 84 multi-channel workflows: **42/42 scam workflows warned**, **0/42 ordinary workflows interrupted**, **100% pre-payment coverage**. Engine p95 latency is ~**0.36 ms**.

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
