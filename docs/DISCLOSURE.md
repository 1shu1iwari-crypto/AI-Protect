# AI, datasets, models and third-party assets

## AI-generated work

OpenAI ChatGPT/Codex generated this implementation, documentation, design, SVG icon, test scenarios, seed training texts and submission PDF content under user direction. No AI output is treated as verified scam intelligence. Human review is required before submission and deployment.

## Data

157 AI-authored synthetic training texts are retained verbatim in ml/training.json. The original 52 AI-authored workflows (26 scam, 26 ordinary) remain in simulator/scenarios.mjs and simulator/challenges.mjs. The original 20 are smoke tests; 32 later challenge cases were excluded from the frozen training set. The two former misses, indirect coercion and implicit yield, remain verbatim regression cases. Another 32 AI-authored workflows (16 scam, 16 ordinary) in simulator/adversarial.mjs cover paraphrases, Hindi, Hinglish, negation, invisible characters, delayed workflows and benign payments. Their text is excluded verbatim from both training files. These fixtures were added during implementation and share authorship and concept vocabulary with training, so they are correlated tests rather than independent real-world validation. A synthetic UPI QR fixture is generated with qrcode 8.2 (BSD license). None of this data is bank/customer data or recorded real conversations. No unlicensed scam-call corpus, confidential platform data or real financial network is included.

## Models and dependencies

- **Client runtime**: Zero runtime network dependencies. Pure JavaScript running in the browser / Android WebView. PhiUSIIL URL lexical model inference runs offline in pure JavaScript (`core/url-model.json`). Bundled jsQR 1.4.0 (Apache-2.0) for local QR parsing.
- **Domain parsing**: Public Suffix List rules (`core/domain-parser.mjs`) based on Mozilla Public Suffix List standards for accurate multi-level TLD identification without external DNS calls.
- **Scam Radar backend runtime**: Python 3.10+ with `numpy`, `scikit-learn` (HDBSCAN clustering), and `river` (ADWIN streaming drift detector), pinned in `requirements.txt`. Radar imports gracefully degrade if packages are missing.
- **Evaluation datasets**:
  1. *PhiUSIIL Phishing URL Dataset*: 10,000 held-out URLs partitioned strictly by registrable domain hash (0 domain overlap between train and test).
  2. *UCI SMS Spam Collection*: All 4,827 authentic legitimate (ham) messages evaluated through the live ScamGuard engine to verify false alert burden.
  3. *RBI BE(A)WARE Taxonomy*: Behavioral fraud-family prototypes derived from published RBI fraud cases (SG01 to SG07) for Leave-One-Family-Out (LOFO) novelty benchmarking.
  4. *Zero-Day Product Reviewer (SG08)*: 5 multi-step synthetic journeys evaluated end-to-end through the runtime pipeline without manual vector edits.

## Reference status

Operational references: Official Android, NPCI UPI specifications, scikit-learn, River (online ML), Public Suffix List, and RBI BE(A)WARE fraud taxonomy guidelines.
HDBSCAN and River ADWIN are actively implemented in `backend/radar/` for clustering 64-dimensional behavioral trajectory vectors and detecting streaming campaign emergence.
The 64-dimensional trajectory vector is an inspectable, hand-engineered behavioral feature representation (not an unexplainable learned neural embedding).
The semantic provider interface supports Multilingual-E5 (`intfloat/multilingual-e5-small`) and MuRIL architectures via ONNX Runtime; measurements report server CPU latency (~14.8 ms) and model size (118 MB) to justify choosing the lightweight 0.05 MB Financial Intent Frame system (0.36 ms) as the production on-device default.

## Submission review

Verify eligibility, registration, actual team identity, dependency licences, organiser requirements and all safety claims before upload. The software cannot prove whether a voice or message was AI-generated; behavior recognition targets financial scams irrespective of content origin.


## v0.3 additions

Review state, registry matching, UI, Kotlin companion, tests and docs are AI-generated under user instruction. Hero KYC/call/QR inputs are synthetic `.invalid`/`@demo` fixtures. No new model or real conversation dataset was added. Android uses Kotlin 2.0.21, Android Gradle Plugin 8.9.1, Gradle 8.11.1 and AndroidX WebKit 1.12.1 (Apache-2.0); JVM tests use JUnit 4.13.2 (EPL-1.0), Robolectric 4.14.1 (MIT) and Mockito 5.15.2 (MIT). Official SDK/JDK tooling is build-only. No borrowed product branding or UI was copied. The existing submission PDF describes v0.2 and has not been regenerated for this Android increment.

## Shared recording review and acoustic-model correction

The new Android share receiver accepts one content URI and waits for a separate Analyze tap. It uses no broad storage, microphone or accessibility permissions for imports. Native sharing, decoding, Hindi/English Vosk ASR, optional multilingual Whisper JNI, energy/clip quality screening, timestamped financial evidence, local transcript corrections, offline text-to-speech and derived reporting are implemented. Automatic speaker diarization and representative real-call benchmarks are not implemented. Energy gating is not a learned VAD.

The included acoustic ONNX model is a procedural-waveform MLP, not AASIST. Its historical perfect diagnostic scores are not human/voice-clone accuracy. Python model metadata and outputs now mark it experimental and uncalibrated; fusion requires real-speech evaluation provenance before accepting an acoustic authenticity claim. Android has no validated native acoustic model and returns inconclusive without uploading audio.

No real private recordings, new pretrained anti-spoofing weights, or benchmark results were manufactured for this feature. Optional whisper.cpp source is pinned to v1.8.3 commit 2eeeba56e9edd762b4b38467bab96c2517163158; multilingual ggml model weights must be bundled at build time or explicitly imported. See android/SHARED_RECORDING_REVIEW.md for build instructions, licences and physical-device acceptance checks.
