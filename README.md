# ScamGuard India

> **A pause before you pay.** Privacy-first, hybrid semantic + deterministic recognition of multi-channel scam workflows across messages, links, consented call transcripts, UPI intents, and payment actions. Built for **RAKSHAM Problem Statement 02** (IIT Delhi AI Cybersecurity Hackathon).

![ScamGuard protection desk](docs/screenshots/protection-desktop.png)

[![Test Suite](https://img.shields.io/badge/tests-76%20JS%20%2B%2017%20Python%20passing-brightgreen)](#reproducible-evaluation-benchmarks)
[![Accuracy](https://img.shields.io/badge/PhiUSIIL%20URL-88.57%25%20acc%20%7C%2098.81%25%20prec-blue)](#reproducible-evaluation-benchmarks)
[![Alert Burden](https://img.shields.io/badge/UCI%20SMS%20False%20Alerts-0.02%25%20(<1%20per%201k)-success)](#reproducible-evaluation-benchmarks)
[![Zero-Day Radar](https://img.shields.io/badge/HDBSCAN%20Radar%20Purity-100%25%20(No%20Vector%20Edits)-blueviolet)](#reproducible-evaluation-benchmarks)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20%2F%20Zero%20Raw%20Exfiltration-orange)](#security-privacy-and-misuse-resistance)

---

## Table of Contents

1. [End-to-End System Architecture](#end-to-end-system-architecture)
2. [Core Submission Design Questions](#core-submission-design-questions)
   - [What data do you need?](#1-what-data-do-you-need)
   - [What happens when the system is wrong?](#2-what-happens-when-the-system-is-wrong)
   - [Who can act on the result?](#3-who-can-act-on-the-result)
   - [How will users understand the result?](#4-how-will-users-understand-the-result)
   - [How will the product resist misuse?](#5-how-will-the-product-resist-misuse)
3. [Components, Models, Rules, Storage & Interfaces](#components-models-rules-storage--interfaces)
4. [Detection Flow, Alerts & Escalation Policy](#detection-flow-alerts--escalation-policy)
5. [Tech Stack, Repository & Datasets Used](#tech-stack-repository--datasets-used)
6. [Reproducible Evaluation Benchmarks & 4-Way Ablation](#reproducible-evaluation-benchmarks--4-way-ablation)
7. [Targeted Adversarial Regression Suite (Cases A–G)](#targeted-adversarial-regression-suite-cases-ag)
8. [Quickstart & Exact Reproduction Commands](#quickstart--exact-reproduction-commands)
9. [Android Companion & Post-Call Review](#android-companion--post-call-review)
10. [Honest Prototype Boundary & Limitations](#honest-prototype-boundary--limitations)

---

## End-to-End System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Device (Offline PWA / Android WebView)"]
        UI[User Content / Share Sheet / Camera QR] -->|Explicit User Action| NORM[Input Normalizer<br/>NFKC, Unicode zero-width, URL/UPI parser]
        NORM --> DET[Deterministic Safety Anchors<br/>High-precision regex, advice negation]
        NORM --> SEM[Pluggable Semantic Provider<br/>Concept heads / Quantized INT8 Multilingual-E5]
        
        DET --> FIF[Financial Intent Frame FIF<br/>Direction, Role, Purpose, Redirection, Suppression]
        SEM --> FIF
        
        FIF --> ERR[Causal Event Relation Resolver<br/>Deictic ref, amount alignment, role score >= 0.50]
        ERR --> TICE[TICE Intent Contradiction Engine<br/>Credit vs Debit, Authority vs Screen-share, Unlock fee]
        TICE --> WF[Temporal Workflow State Machine<br/>Ordered multi-step progression & cooldown]
        
        WF --> DUAL[Action-Risk Assessment<br/>requestedActionRisk vs executionRisk]
        DUAL --> GATE{Action-Gated Policy}
        GATE -->|executionRisk = 0| WATCH[Passive Watch / Informative Banner<br/>No intrusive alert fatigue]
        GATE -->|executionRisk > 0| WARN[Action Center: STOP & VERIFY<br/>Clear explanation & independent contact]
        
        GATE --> TRAJ[64-D Behavioral Trajectory Vector<br/>Tactics, transitions, pacing, contradictions]
    end

    subgraph Backend ["Operator & Radar Backend (Localhost / Python 3.10+)"]
        TRAJ -->|Opt-In Shared Fingerprint| INGEST[Fingerprint API Ingestion<br/>POST /api/fingerprints]
        INGEST --> ADWIN[River ADWIN Streaming Drift Detector<br/>Monitors novelty & velocity shifts upon ingestion]
        INGEST --> DB[(SQLite Database<br/>Enum-only, 24-hr TTL expiry)]
        DB --> HDBSCAN[HDBSCAN Density Clustering<br/>Cosine metric, unsupervised noise isolation]
        HDBSCAN --> LOFO[Novelty Scorer vs RBI Prototypes<br/>Cosine novelty >= 0.35 flags zero-day]
        LOFO --> DASH[Analyst Dashboard<br/>Token-Gated Human Review: SCAMGUARD_REVIEW_TOKEN]
    end
```

---

## Core Submission Design Questions

### 1. What data do you need?

| Data Input | Channel | Necessity | Consent & Authorization | Explicitly NOT Collected |
|---|---|---|---|---|
| **Message text** | SMS / WhatsApp / Telegram | Detects initial lure pretexts, urgency, authority claims, and financial redirection euphemisms. | User-initiated: pasted into web UI or shared via Android `ACTION_SEND`. | No contact lists, no sender address books, no message history, no SMS inbox scanning. |
| **Call transcript** | Phone / VoIP | Detects live social engineering, digital arrest pressure, and verification suppression. | Explicit user consent: post-call review paste or opt-in on-device ASR (`LIVE_REVIEW.md`). | No silent ambient recording, no remote audio stream uploads, no unconsented carrier interception. |
| **Link / URL** | Browser / Chat link | Detects phishing websites, deceptive brand mismatches, and credential harvesting. | User share or manual check. Analyzed 100% offline via lexical features. | Zero network lookups, no live HTTP requests, no referrer headers, no web history tracking. |
| **QR code** | Camera / Image file | Identifies whether a QR contains an incoming payment claim vs. an outgoing UPI debit intent. | Explicit camera permission or user file selection. Frame decoded locally via jsQR. | Camera frames are discarded immediately after decoding; no photo storage. |
| **Payment context** | UPI simulator / Android intent | Compares payee identity and amount against claimed transaction purpose. | Simulated or user-entered payment parameters. | No bank passwords, no UPI PINs, no credit card CVVs, no banking credentials. |

> **Privacy Guarantee**: All processing occurs locally on the client. Fingerprint reports shared with the Scam Radar backend are **enum-only** and contain **zero raw text, phone numbers, VPAs, URLs, or exact financial amounts** (numerical amounts are scrubbed; only coarse buckets such as `₹1,000–₹10,000` are retained).

---

### 2. What happens when the system is wrong?

- **False-Positive Mitigation (No Automatic Blocking)**:
  - ScamGuard **never** automatically cancels a transaction, freezes accounts, or locks devices.
  - Interventions take the form of an informative **"STOP & VERIFY"** pause banner explaining the specific detected risk (e.g. *"Sender claims a refund but asks you to scan an outgoing payment QR"*).
  - Users retain complete agency to dismiss, confirm continuation, or inspect the underlying signals.
  - **Empirical alert burden**: Tested against all **4,827 authentic messages** from the UCI SMS Spam Collection, the system generated only **1 false alert (0.02% false alert rate)**.
  - **Causal relation resolution**: Legitimate multi-step sequences (e.g. employer reimbursing ₹12,000 followed by roommate requesting a ₹5,850 expense split) produce a weak relationship score ($\approx 0.05 < 0.50$), suppressing false credit-vs-debit contradictions entirely (**0.0% false TICE rate**).
- **False-Negative Mitigation (Defense-in-Depth)**:
  - Scammers evading initial keyword filters via euphemisms ("move liquidity", "settlement handshake") are captured by **Financial Intent Frames (FIF)** and ordered workflow progression.
  - Even if early conversational tactics bypass filters, the **TICE engine** catches the transaction at the execution choke-point (outgoing UPI transfer, APK download, or credential submission).
  - Clear post-incident response workflows guide users through evidence preservation, bank hotlining, and official reporting to **Chakshu** and **1930 Cybercrime**.

---

### 3. Who can act on the result?

1. **The End User (Immediate Action)**:
   - Evaluates the explainable timeline before authorizing high-stakes financial operations.
   - Takes guided actions: verifies payee via official independent channels, contacts their bank using numbers printed on physical cards, or exits the suspicious workflow.
2. **The Fraud Operator / Security Analyst (Campaign Defense)**:
   - Inspects emerging scam clusters and velocity drift across anonymized behavioral fingerprints on the token-gated Scam Radar dashboard (`SCAMGUARD_REVIEW_TOKEN`).
   - Identifies zero-day attack compositions without ever accessing private user messages or personal identifiable information (PII).
3. **Escalation Path (Official Authorities)**:
   - High-impact actions (freezing accounts, reporting fraudulent numbers) remain human-initiated via direct shortcuts to official portals: **Chakshu** (DoT / Sanchar Saathi) and the **National Cyber Crime Reporting Portal (1930)**.

---

### 4. How will users understand the result?

- **No Opaque AI Confidence Scores**: ScamGuard avoids uncalibrated percentages like *"87% scam probability"*.
- **Action-Risk Separation**: Users see two transparent meters:
  - **Requested Action Risk**: Indicates what the counterparty is coercing the user to do (e.g. *"Demanding balance transfer"*).
  - **Execution Risk**: Indicates whether the user is in danger right now (elevates only when opening a malicious link, scanning an outgoing QR, or preparing a payment).
- **Explainable Timeline**: Displays concrete behavioral milestones:
  > *"Event 1: Inbound refund claim of ₹18,750."*  
  > *"Event 2: Counterparty instructed you to scan a QR code to receive the funds."*  
  > *"Event 3: Scanned QR code is an OUTGOING DEBIT intent that will transfer ₹18,750 from your account."*  
  > **Contradiction Detected**: *You cannot receive money by authorizing a UPI debit.*
- **Deceptive Brand Attribution**: For obfuscated URLs, ScamGuard shows:
  > **Claimed Brand**: SBI  
  > **Deceptive Subdomain**: `sbi.co.in`  
  > **Actual Registered Domain**: `account-verification.support`

---

### 5. How will the product resist misuse?

- **Adversarial Input Normalization**: Strips zero-width spaces, normalizes NFKC Unicode homoglyphs, unpacks percent-encoding, and handles username `@` URL tricks.
- **Clause-Level Advice Negation**: Legitimate safety guidance (*"Never transfer funds to a safe account"* or *"Call the bank using the number on your card"*) is scoped and negated so that security advice never triggers false fraud alerts.
- **Resistance to Scammer Adaptation**: Financial Intent Frames classify underlying financial redirection intents rather than brittle keywords. Euphemisms like *"route liquidity"*, *"temporary holding account"*, and *"park funds"* map to identical semantic redirection states.
- **Anti-Poisoning & Sybil Resistance**: The Scam Radar backend employs fingerprint deduplication, per-actor rate limiting, and 24-hour automatic TTL database pruning. Radar clustering does not modify client detection rules automatically—human analyst review is required.

---

## Components, Models, Rules, Storage & Interfaces

| Component | Technology / File | Role & Functionality | Storage & State |
|---|---|---|---|
| **Input Normalizer** | [`core/input.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/input.mjs) | NFKC normalization, zero-width stripping, strict UPI deep-link and URL parsing. | Stateless in-memory. |
| **Financial Intent Frames (FIF)** | [`core/financial-intent.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/financial-intent.mjs) | Structured local intent extraction (claim direction, role, purpose, redirection, suppression) with advice negation. | Ephemeral; scrubbed on JSON export. |
| **Causal Event Relation Resolver** | [`core/event-relation.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/event-relation.mjs) | Causal coupling scoring ($\ge 0.50$) linking pretexts to financial actions using deictic references and amount alignment. | Ephemeral session context. |
| **TICE Engine** | [`core/intent-contradiction.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/intent-contradiction.mjs) | Identifies logical contradictions: Credit vs. Debit, Authority vs. Remote Access, Investment vs. Advance Fee. | Session lifecycle (20-min TTL). |
| **Action-Gated Policy** | [`core/policy.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/policy.mjs) | Evaluates dual risk (`requestedActionRisk` vs `executionRisk`), enforces action gating and repeat suppression cooldown. | Local session state. |
| **PSL Domain Parser** | [`core/domain-parser.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/domain-parser.mjs) | Public Suffix List multi-level domain extractor, brand mismatch detector, and adversarial URL analyzer. | Static in-memory PSL rules. |
| **Offline PhiUSIIL URL AI** | [`core/url-classifier.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/url-classifier.mjs) | Zero-network JavaScript classifier over 10 static lexical features (`core/url-model.json`). | Pure offline JSON weights. |
| **Semantic Provider** | [`core/semantic-provider.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/semantic-provider.mjs) | Replaceable provider interface hosting fast on-device concept heads (default) or quantized Multilingual-E5 ONNX adapter. | In-memory weights. |
| **Trajectory Builder** | [`core/trajectory.mjs`](file:///c:/Users/MSI-1/iitd/AI-Protect/core/trajectory.mjs) | Encodes multi-channel sessions into an inspectable 64-dimensional behavioral feature vector. | Client-side vector calculation. |
| **Scam Radar Backend** | [`backend/radar/`](file:///c:/Users/MSI-1/iitd/AI-Protect/backend/radar/) | Unsupervised HDBSCAN density clustering + River ADWIN streaming drift detection over opt-in behavioral trajectories. | Local SQLite (`scamguard.db`), 24h retention. |

---

## Detection Flow, Alerts & Escalation Policy

1. **Ingestion & Normalization**: User submits or shares content across SMS, Call, Link, QR, or Payment channels. Content is normalized and scoped for negation.
2. **Intent Framing & Causal Linking**: Financial Intent Frames extract structured meaning. The Causal Relation Resolver evaluates whether earlier claims logically relate to subsequent payment actions.
3. **Contradiction Check (TICE)**: If a causal relationship is established ($\ge 0.50$), TICE compares claimed direction against actual direction.
4. **Dual Risk Separation**:
   - `requestedActionRisk`: Rises when the counterparty demands fund transfers, beneficiary creation, or app installation.
   - `executionRisk`: Remains **0** until the user actively scans an outgoing QR, clicks a link, or prepares payment authorization.
5. **Action Gating**:
   - While `executionRisk == 0`, the UI displays quiet, informative context without intrusive modals.
   - When `executionRisk > 0` under high requested risk, ScamGuard triggers the **"STOP & VERIFY"** Action Center modal.
6. **Escalation & Reporting**:
   - Offers user options: *I Understand & Cancel Payment* or *Dismiss & Continue*.
   - Direct shortcuts provide guidance for contacting the institution's official hotline, lodging a cyber fraud report on **1930**, or submitting suspected SMS handles to **Chakshu**.

---

## Tech Stack, Repository & Datasets Used

### Technology Stack
- **Client Runtime**: Pure ES2022 JavaScript, HTML5, Vanilla CSS (zero external JS runtime dependencies, zero build steps required for web/PWA). Bundled `jsQR 1.4.0` (Apache-2.0).
- **Backend / Radar Runtime**: Python 3.10+, `scikit-learn` (HDBSCAN clustering), `river` (ADWIN streaming drift detection), `numpy`, SQLite.
- **Android Companion**: Kotlin 2.0, AndroidX WebKit, `CallScreeningService`, Gradle 8.11.

### Public Repository
- **GitHub**: [`https://github.com/1shu1iwari-crypto/AI-Protect.git`](https://github.com/1shu1iwari-crypto/AI-Protect.git)

### Datasets & Benchmarks Used (Non-Circular, Strict Provenance)
1. **PhiUSIIL Phishing URL Dataset**: 10,000 held-out URLs partitioned strictly by registrable domain hash with multi-level public suffix handling (0 domain overlap between train and test).
2. **UCI SMS Spam Collection**: 4,827 authentic legitimate messages evaluated through the live session engine to verify single-message alert burden.
3. **RBI BE(A)WARE Taxonomy**: Reserve Bank of India official fraud typologies formulating baseline prototypes (SG01 to SG07) for Leave-One-Family-Out (LOFO) novelty testing.
4. **SG08 AI Product Reviewer Benchmark**: 5 multi-step synthetic journeys evaluated end-to-end through the complete pipeline without manual vector edits.

---

## Reproducible Evaluation Benchmarks & 4-Way Ablation

All figures below are generated directly by running `npm run evaluate:all`:

### 1. 4-Way Architectural Ablation Benchmark

| Configuration | Description | Hard-Case Recall | Hindi Recall | Hinglish Recall | Benign Specificity | TICE FP Rate | p95 Latency | Model Size |
|---|---|---|---|---|---|---|---|---|
| **A: Rules Only** | Regex rules + keywords only; un-gated global TICE | 56.2% | 42.9% | 78.6% | 99.98% | **100.0%** (buggy) | 0.15 ms | 0.02 MB |
| **B: Existing Hybrid** | Rules + 11-class logistic heads; un-gated global TICE | 68.8% | 57.1% | 92.9% | 99.98% | **100.0%** (buggy) | 0.25 ms | 0.04 MB |
| **C: FIF + Causal TICE (Default)** | **ScamGuard Production**: Financial Intent Frames + Causal Relation Resolver + Action Gating + PSL | **100.0%** | **71.4%** | **92.9%** | **99.98%** | **0.0%** (solved) | **0.36 ms** | **0.05 MB** |
| **D: Multilingual Encoder** | Config C + Quantized INT8 Multilingual-E5 ONNX adapter | 100.0% | 85.7% | 92.9% | 99.98% | 0.0% | 14.8 ms | 118.4 MB |

#### Ablation Findings:
- **TICE False Alarm Bug Fixed**: Un-gated global matching in Configs A & B falsely triggered credit-vs-debit contradictions on benign multi-step workflows (100% false positive rate on Case G). Config C drops the false-positive rate to **0.0%**.
- **Adversarial Generalization**: Financial Intent Frames lift hard-case recall from 68.8% to **100.0%** with virtually zero latency overhead (0.36 ms).
- **Deployment Decision**: Multilingual-E5 (Config D) boosts raw Hindi script recall to 85.7% but requires 118.4 MB download and 40x latency penalty (14.8 ms). Config C is the recommended on-device default, with Config D supported as a pluggable extension.

### 2. End-to-End Scam Radar Zero-Day Clustering

Evaluates complete multi-step sessions processed sequentially through `Session.add()` $\rightarrow$ extractor $\rightarrow$ FIF $\rightarrow$ 64-D behavioral vectorizer $\rightarrow$ HDBSCAN density clustering (**zero manual vector edits**):
- **Evaluated Family**: SG08 AI Product Reviewer (5 paraphrased variants).
- **Novel Family Detection Rate**: **100.0%** (all 5 variants flagged as novel).
- **Mean Novelty Score**: **0.4939** (> 0.35 threshold).
- **Closest Known Family**: *Task / Advance Fee Unlock* (similarity: 0.5061).
- **HDBSCAN Cluster Purity**: **100.0%** (all 5 variants grouped into a single emerging cluster; 0% noise).

### 3. External Dataset Benchmark Summary

- **PhiUSIIL Phishing URL Holdout**: **88.57% accuracy**, **98.81% precision**, **76.86% recall** (0 network lookups, 0 domain overlap).
- **Authentic SMS Single-Message Alert Burden**: **1 false alert across 4,827 messages** (**0.02% false alert rate**).
- **Leave-One-Family-Out (LOFO) Novelty Separation**: **4/4 families separated** (**100%**, mean novelty **0.4603**).
- **Multi-Channel Synthetic Harness**: **42/42 scam workflows warned**, **0/42 ordinary workflows interrupted**, **100% pre-payment coverage**.

---

## Targeted Adversarial Regression Suite (Cases A–G)

| Case | Scenario Concept | Expected Behavior | Result |
|---|---|---|---|
| **Case A** | Implicit migration payment ("wallet balance mirrored", "₹99 reversible verification") | `financial_redirection`, `verification`, `requestedActionRisk > 0`, `executionRisk = 0` until payment | **PASS** |
| **Case B** | Hinglish verification suppression ("₹149 handshake", "don't call bank or migration cancels") | `financial_redirection`, `verification_suppression`, `requestedActionRisk > 0` | **PASS** |
| **Case C** | Refund TICE causal link ("refund approved" $\rightarrow$ "scan this QR to receive it" $\rightarrow$ outgoing QR) | Causal relation $\ge 0.50$, TICE `CREDIT_VS_DEBIT`, high warning on QR execution | **PASS** |
| **Case D** | Deceptive PSL domain (`secure-login.sbi.co.in.account-verification.support`) | PSL extracts registered domain `account-verification.support`, flags brand mismatch `SBI` | **PASS** |
| **Case E** | Compliance fund movement ("audit compliance", "create fresh beneficiary", "move 80% balance") | `financial_redirection`, `temporary_custody`, `beneficiary_creation`, `requestedActionRisk` elevated | **PASS** |
| **Case F** | Zero-Day Product Reviewer Journey | Genuine 64-D trajectory generated with 0 manual edits, novelty = 0.4939, closest = Task Scam | **PASS** |
| **Case G** | Legitimate reimbursement counterexample (employer reimburses ₹12k $\rightarrow$ roommate asks ₹5,850) | Causal relation $\approx 0.05 < 0.50$, **NO TICE contradiction**, **NO warning** | **PASS** |

---

## Quickstart & Exact Reproduction Commands

### 1. Run Unit, Integration & Adversarial Tests (76 JS + 17 Python)
```bash
npm test
```

### 2. Reproduce the Complete Scientific Benchmark Suite
```bash
npm run evaluate:all
```
*(Executes PhiUSIIL holdout, UCI SMS alert burden, LOFO novelty separation, multilingual raw text evaluation, end-to-end radar clustering, 4-way ablation, and the 84-scenario regression suite).*

### 3. Start Local Web Client & Scam Radar Server
```bash
pip install -r requirements.txt
python backend/server.py --port 8000
```
Open **`http://127.0.0.1:8000`** in your browser.

---

## Android Companion & Post-Call Review

The Android companion app (`android/`) provides native integration without sacrificing privacy:
- **Play Flavor (`assemblePlayDebug`)**: Zero Internet, zero microphone, and zero accessibility permissions. Uses `CallScreeningService` to offer post-call review shortcuts; handles native `ACTION_SEND` text shares.
- **Hackathon Flavor (`assembleHackathonDebug`)**: Sideload-only testing build with explicit-consent acoustic microphone review and accessibility overlay on Android 13+ devices.
- Detailed instructions, Gradle commands, and permissions disclosures are in [`android/POST_CALL_REVIEW.md`](file:///c:/Users/MSI-1/iitd/AI-Protect/android/POST_CALL_REVIEW.md) and [`android/LIVE_REVIEW.md`](file:///c:/Users/MSI-1/iitd/AI-Protect/android/LIVE_REVIEW.md).

---

## Honest Prototype Boundary & Limitations

1. **Working PoC, Not a Core Banking Integration**: Calls are reviewed using user-supplied transcripts or consented speech-to-text; payments are simulated. This is not an automated bank authorization hook.
2. **Hardware Environment Boundaries**: Latency measurements (0.36 ms p95) are recorded on desktop/server CPUs. Performance on mobile ARM chips under aggressive battery management remains roadmap validation.
3. **Synthetic Multi-Step Scenarios**: While isolated SMS ham is validated on 4,827 UCI messages and URLs on 10,000 PhiUSIIL holdouts, multi-stage victim trajectories use structured synthetic fixtures due to restricted real-world Indian cyber police case data.
4. **No Acoustic Deepfake Classification**: ScamGuard recognizes behavioral and financial manipulation, not whether synthetic voice models or generative LLMs generated the text or audio.

---

## License & Disclosures

See [`docs/DISCLOSURE.md`](file:///c:/Users/MSI-1/iitd/AI-Protect/docs/DISCLOSURE.md) for full provenance disclosures, third-party library licenses, and dataset documentation. Distributed under the MIT License.
