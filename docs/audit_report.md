# AI-Protect 2.0 — Phase 0 Architecture Audit & Baseline Report

**Repository**: [AI-Protect](https://github.com/1shu1iwari-crypto/AI-Protect.git)  
**Target Goal**: Transform AI-Protect into the *Financial Communication Trust & Response Platform* for RAKSHAM 2026.  
**Audited Components**: `core/`, `android/`, `backend/`, `web/`, `ml/`, `evaluation/`, `tests/`, `simulator/`.

---

## 1. Baseline Test & Benchmark Results (Before Modification)

All existing test and evaluation suites were executed cleanly and recorded as the golden baseline:

| Test Suite / Benchmark | Metric / Command | Result | Status |
|---|---|---|---|
| **JavaScript Test Suite** | `node --test tests/*.test.mjs` | **76 / 76 passed** (1.28s) | Pass |
| **Python Unit Tests** | `python -m unittest discover tests` | **17 / 17 passed** (1.71s) | Pass |
| **Synthetic Regression Harness** | `npm run evaluate` | **42 / 42 Scam TP (100%), 0 FP (0%)**, P95: 0.77ms | Pass |
| **PhiUSIIL URL Holdout** | `evaluation/benchmark.py` [1/6] | **88.57% Accuracy** (98.81% Precision, 76.86% Recall) | Pass |
| **UCI SMS Ham Alert Burden** | `evaluation/benchmark.py` [2/6] | **0.0207% False Alert Rate** (1 / 4,827 alerts) | Pass |
| **LOFO Trajectory Novelty** | `evaluation/benchmark.py` [3/6] | **100.0% Family Novelty Separation** (Mean: 0.4603) | Pass |
| **Multilingual Robustness** | `evaluation/benchmark.py` [4/6] | EN: 100%, Hinglish: 92.9%, HI: 57.1% | Pass |
| **Radar HDBSCAN Clustering** | `evaluation/benchmark.py` [5/6] | **100.0% Novel Detection Rate**, 100.0% Cluster Purity | Pass |
| **4-Way Architectural Ablation** | `evaluation/benchmark.py` [6/6] | Config C Hard Recall: **100.0%**, TICE FP Rate: **0.0%** | Pass |

---

## 2. Architectural Analysis: Implemented vs. Simulated vs. Experimental

### A. What is Actually Implemented
1. **Deterministic Risk & Policy Engine (`core/engine.mjs`, `core/policy.mjs`)**:
   - Multi-stage risk assessment with strict separation between **Requested Action Risk** (what the caller demands: transfer, credentials, remote access, APK) and **Execution Risk** (only spikes when user actually executes payment/sensitive action).
   - Rate-limited warning gating (`intervention()`) with cooldown suppression and upgrade rules.
2. **Financial Intent Frame (FIF) (`core/financial-intent.mjs`)**:
   - Structured local representation of financial claims: inbound vs. outbound directions, raw numeric amounts (kept local, never exported), 11 financial purposes (refund, reimbursement, verification, migration, settlement, investment, withdrawal, unlock, compliance, purchase, personal_payment), counterparty roles, beneficiary creation signals, and verification suppression detection.
3. **Transaction Intent Consistency Engine (TICE) (`core/intent-contradiction.mjs`)**:
   - Deterministic cross-channel protocol verification: detects credit vs. debit contradictions (claiming credit while presenting an outgoing UPI debit QR), authority claims vs. remote screen-sharing / APK sideloading, and investment unlock advance fees.
4. **Causal Event Relationship Resolver (`core/event-relation.mjs`)**:
   - Multi-factor scoring (deictic link, exact amount match, counterparty role alignment, purpose alignment, step adjacency) ensuring TICE only triggers on causally linked claims.
5. **64-Dimensional Trajectory Vectorizer (`core/trajectory.mjs`)**:
   - Mathematical mapping of multi-channel journeys into $\mathbb{R}^{64}$ with zero raw text, zero phone numbers, and zero PII.
6. **Backend Scam Radar (`backend/server.py`, `backend/radar/cluster.py`, `backend/radar/drift.py`)**:
   - Python HTTP daemon with HDBSCAN density clustering on cosine distance and River ADWIN streaming concept drift detector.
7. **Review Sessions & Snapshot Redaction (`core/review.mjs`)**:
   - `ReviewSession` state machine, timeline generator, enum-only snapshot serialization, restore validation, and official response plan routing (Dial 1930, Cybercrime portal, Sanchar Saathi / Chakshu).
8. **Android Application (`android/`)**:
   - **Play flavor**: Zero sensitive permissions (no microphone, no accessibility), standalone review and manual verification.
   - **Hackathon flavor**: Consented post-call review (`OfflineAudioAnalyzer.kt`, `AudioReviewService.kt`, `AudioReviewActivity.kt`) with offline Vosk speech recognition (`speech-model-en-v1`, `speech-model-hi-v1`), foreground service notifications, and `LiveCoreBridge.kt` linking WebView to Kotlin.

### B. What Only Exists as a Simulator
1. **Synthetic Scenarios (`simulator/scenarios.mjs`, `simulator/challenges.mjs`, `simulator/adversarial.mjs`)**:
   - 42 scam session fixtures and 42 benign session fixtures used in regression test suites.
2. **Demo Lab Player (`web/site/site.mjs`)**:
   - Interactive step-by-step playback of synthetic journeys on the presentation website.
3. **Payment Simulation (`web/app.mjs`)**:
   - Simulates entering UPI amounts and payees without initiating live banking transactions.

### C. What Remains Experimental or Incomplete
1. **Acoustic Deepfake Detection (Currently Missing)**:
   - `OfflineAudioAnalyzer.kt` transcribes speech via Vosk and passes text to the lexical engine. It has **no acoustic anti-spoofing model** or synthetic voice detector.
   - The system currently cannot determine whether speech was synthetically generated (TTS, voice cloning, vocoder artifacts).
2. **Communication Verification Limitation**:
   - `core/verification.mjs` checks domain equality against a local bank registry. A domain match is currently described as "verified", which could be misunderstood as authenticating the caller.
   - Domain consistency must be strictly decoupled from caller identity authentication and financial risk.
3. **Android Live Call Review**:
   - Consented experimental overlay using accessibility window observation and microphone VAD (`VoiceActivityDetector.kt`).

---

## 3. What Can Be Reused & Smallest Safe Integration Points

1. **Android Audio Decoding Pipeline**:
   - `OfflineAudioAnalyzer.kt` lines 65–122 already use Android `MediaCodec` and `MediaExtractor` to decode arbitrary audio files into **16kHz 16-bit mono PCM**.
   - This exact 16kHz PCM stream is the universal input format for speech anti-spoofing models (AASIST, LFCC-LCNN, RawNet2).
2. **Modular Inference Layer in Python & ONNX**:
   - Python 3.14 environment supports `onnxruntime` and `torch`.
   - Creating `ml/deepfake/` with a clean Python inference engine, acoustic feature extractor (LFCC / spectral features / deep acoustic embeddings), and ONNX/PyTorch model loader allows real inference on recorded and uploaded audio.
3. **Verification Upgrade (`core/verification.mjs`)**:
   - Extend `verifyCommunication()` without breaking existing callers (`ReviewSession.add()`). Separate:
     - `claimed_org`: Organization extracted from claim.
     - `domain_consistency`: `matches_registry`, `mismatch`, `not_checked`, `lookalike_detected`.
     - `media_authenticity`: `synthetic_suspected`, `no_strong_synthetic_indication`, `inconclusive`.
     - `caller_identity`: `unverified` (unless independently authenticated out-of-band).
     - `behavioral_risk`: derived from TICE + FIF + policy.
4. **Multimodal Evidence Fusion (`core/evidence-fusion.mjs`)**:
   - Bridge acoustic deepfake findings, transcript behavioral signals, and domain consistency into a unified explainable incident assessment without disrupting the existing `Session` / `ReviewSession` APIs.

---

## 4. Dependencies, Security Constraints & Non-Negotiables

- **Zero Silent Data Collection**: Microphone recording and audio processing must remain strictly user-consented, post-call or user-imported.
- **Audio Lifecycle**: Temporary PCM audio must be deleted immediately upon analysis completion. Raw audio must never be saved to persistent databases or exported over the network.
- **Privacy Guarantees**: Scam Radar fingerprints must remain 64-d mathematical vectors without transcripts, phone numbers, or PII.
- **No Fabricated Scores**: Deepfake detector outputs must stem from genuine acoustic model inference and signal analysis, not random numbers or mock flags.
- **Backward Compatibility**: All 76 JS tests and 17 Python tests must continue passing at every step.
