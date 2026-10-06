# AI, datasets, models and third-party assets

## AI-generated work

OpenAI ChatGPT/Codex generated this implementation, documentation, design, SVG icon, test scenarios, seed training texts and submission PDF content under user direction. No AI output is treated as verified scam intelligence. Human review is required before submission and deployment.

## Data

157 AI-authored synthetic training texts are retained verbatim in ml/training.json. The original 52 AI-authored workflows (26 scam, 26 ordinary) remain in simulator/scenarios.mjs and simulator/challenges.mjs. The original 20 are smoke tests; 32 later challenge cases were excluded from the frozen training set. The two former misses, indirect coercion and implicit yield, remain verbatim regression cases. Another 32 AI-authored workflows (16 scam, 16 ordinary) in simulator/adversarial.mjs cover paraphrases, Hindi, Hinglish, negation, invisible characters, delayed workflows and benign payments. Their text is excluded verbatim from both training files. These fixtures were added during implementation and share authorship and concept vocabulary with training, so they are correlated tests rather than independent real-world validation. A synthetic UPI QR fixture is generated with qrcode 8.2 (BSD license). None of this data is bank/customer data or recorded real conversations. No unlicensed scam-call corpus, confidential platform data or real financial network is included.

## Models and dependencies

- **Client runtime**: Zero runtime network dependencies. Pure JavaScript running in the browser / Android WebView. PhiUSIIL URL lexical model inference runs offline in pure JavaScript (`core/url-model.json`). Bundled jsQR 1.4.0 (Apache-2.0) for local QR parsing.
- **Scam Radar backend runtime**: Python 3.10+ with `numpy`, `scikit-learn` (HDBSCAN clustering), and `river` (ADWIN streaming drift detector), pinned in `requirements.txt`. Radar imports gracefully degrade if packages are missing.
- **Evaluation datasets**:
  1. *PhiUSIIL Phishing URL Dataset*: 10,000 held-out URLs partitioned strictly by registrable domain hash (0 domain overlap between train and test).
  2. *UCI SMS Spam Collection*: All 4,827 authentic legitimate (ham) messages evaluated through the live ScamGuard engine to verify false alert burden.
  3. *RBI BE(A)WARE Taxonomy*: Behavioral fraud-family prototypes derived from published RBI fraud cases (SG01 to SG07) for Leave-One-Family-Out (LOFO) novelty benchmarking.

## Reference status

Operational references: Official Android, NPCI UPI specifications, scikit-learn, River (online ML), and RBI BE(A)WARE fraud taxonomy guidelines.
HDBSCAN and River ADWIN are actively implemented in `backend/radar/` for clustering 64-dimensional behavioral trajectory vectors and detecting streaming campaign emergence.
The 64-dimensional trajectory vector is an inspectable, hand-engineered behavioral feature representation (not a learned neural embedding).
Pretrained heavy neural language models, deepfake audio detectors, and raw call interceptors remain future native platform integrations.

## Submission review

Verify eligibility, registration, actual team identity, dependency licences, organiser requirements and all safety claims before upload. The software cannot prove whether a voice or message was AI-generated; behavior recognition targets financial scams irrespective of content origin.


## v0.3 additions

Review state, registry matching, UI, Kotlin companion, tests and docs are AI-generated under user instruction. Hero KYC/call/QR inputs are synthetic `.invalid`/`@demo` fixtures. No new model or real conversation dataset was added. Android uses Kotlin 2.0.21, Android Gradle Plugin 8.9.1, Gradle 8.11.1 and AndroidX WebKit 1.12.1 (Apache-2.0); JVM tests use JUnit 4.13.2 (EPL-1.0), Robolectric 4.14.1 (MIT) and Mockito 5.15.2 (MIT). Official SDK/JDK tooling is build-only. No borrowed product branding or UI was copied. The existing submission PDF describes v0.2 and has not been regenerated for this Android increment.
