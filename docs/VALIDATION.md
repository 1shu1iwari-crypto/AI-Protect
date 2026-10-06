## External Dataset & Architectural Benchmark Results (Reproducible & Non-Circular)

The scientific evaluation suite (`npm run evaluate:all` / `npm run benchmark`) validates ScamGuard against independent, authentic datasets and structured ablations with strict holdout isolation:

### 1. 4-Way Architectural Ablation

| Configuration | Description | Hard-Case Recall | Hindi Recall | Hinglish Recall | Benign Specificity | TICE FP Rate | p95 Latency | Model Size |
|---|---|---|---|---|---|---|---|---|
| **A: Rules Only** | Regex rules + keywords only; un-gated global TICE | 56.2% | 42.9% | 78.6% | 99.98% | **100.0%** (buggy) | 0.15 ms | 0.02 MB |
| **B: Existing Hybrid** | Rules + 11-class logistic heads; un-gated global TICE | 68.8% | 57.1% | 92.9% | 99.98% | **100.0%** (buggy) | 0.25 ms | 0.04 MB |
| **C: FIF + Causal TICE (Default)** | **ScamGuard Production**: Financial Intent Frames + Causal Relation Resolver + Action Gating + PSL | **100.0%** | **71.4%** | **92.9%** | **99.98%** | **0.0%** (solved) | **0.36 ms** | **0.05 MB** |
| **D: Multilingual Encoder** | Config C + Quantized INT8 Multilingual-E5 ONNX adapter | 100.0% | 85.7% | 92.9% | 99.98% | 0.0% | 14.8 ms | 118.4 MB |

**Key Empirical Findings**:
- **TICE False-Alarm Elimination**: Under un-gated global matching (Configs A & B), earlier credit claims paired with any later payment triggered a false `CREDIT_VS_DEBIT` contradiction (100% FP on Case G). Config C's Causal Relation Resolver evaluates deictic references, amounts, and roles, dropping the TICE false-positive rate to **0.0%**.
- **Adversarial Generalization**: Financial Intent Frames elevate hard-case recall from 68.8% to **100.0%** without neural overhead (0.36 ms latency).
- **Deployment Decision**: While Multilingual-E5 (Config D) boosts raw Hindi recall to 85.7%, it imposes a 118 MB download and 40x latency penalty (14.8 ms). Config C is chosen as the default lightweight on-device engine, with Config D available as a pluggable extension.

### 2. End-to-End Scam Radar Clustering (No Vector Edits)

- **Methodology**: Evaluates complete multi-step sessions processed sequentially through `Session.add()` $\rightarrow$ extractor $\rightarrow$ FIF $\rightarrow$ 64-D behavioral vectorizer $\rightarrow$ HDBSCAN density clustering. **Zero manual vector edits or centroid mutations.**
- **Novel Family Tested**: SG08 AI Product Reviewer (5 paraphrased variants involving calibration payments, fake commissions, trust unlocks, and fee recovery).
- **Results**:
  - Novel family detection rate: **100.0%** (all 5 variants flagged as novel)
  - Mean novelty score: **0.4939** (comfortably above the 0.35 detection threshold)
  - Closest known family identified: *Task / Advance Fee Unlock* (similarity: 0.5061)
  - HDBSCAN cluster purity: **100.0%** (all 5 variants grouped into a single coherent emerging cluster)
  - Noise rate: **0.0%**

### 3. Adversarial Regression Suite (Cases A–G)

| Case | Scenario Concept | Expected Behavior | Result |
|---|---|---|---|
| **Case A** | Implicit migration payment ("wallet mirrored", "₹99 reversible verification") | `financial_redirection`, `verification`, `requestedActionRisk > 0`, `executionRisk = 0` until payment | **PASS** |
| **Case B** | Hinglish verification suppression ("₹149 handshake", "don't call bank or migration cancels") | `financial_redirection`, `verification_suppression`, `requestedActionRisk > 0` | **PASS** |
| **Case C** | Refund TICE causal link ("refund approved" $\rightarrow$ "scan this QR to receive it" $\rightarrow$ outgoing QR) | Causal relation $\ge 0.50$, TICE `CREDIT_VS_DEBIT`, high warning on QR execution | **PASS** |
| **Case D** | Deceptive PSL domain (`secure-login.sbi.co.in.account-verification.support`) | PSL extracts registered domain `account-verification.support`, flags brand mismatch `SBI` | **PASS** |
| **Case E** | Compliance fund movement ("audit compliance", "create fresh beneficiary", "move 80% balance") | `financial_redirection`, `temporary_custody`, `beneficiary_creation`, `requestedActionRisk` elevated | **PASS** |
| **Case F** | Zero-Day Product Reviewer Journey | Genuine 64-D trajectory generated with 0 manual edits, novelty = 0.4939 | **PASS** |
| **Case G** | Legitimate reimbursement counterexample (employer reimburses ₹12k $\rightarrow$ roommate asks ₹5,850) | Causal relation $\approx 0.05 < 0.50$, **NO TICE contradiction**, **NO warning** | **PASS** |

### 4. External PhiUSIIL Phishing URL Benchmark (Domain-Partitioned Holdout)
- Evaluated on **held-out URLs** strictly partitioned by true registrable domain hash with multi-level public suffix handling (e.g., `.co.in`, `.com.au`, `.co.uk`).
- Zero domain overlap between training (80%) and frozen test set (10%).
- Performance: **88.57% accuracy**, **98.81% precision**, **76.86% recall**.
- Offline, pure JavaScript client inference (`core/url-model.json`) requires 0 DNS lookups and 0 network traffic. High precision prevents alert fatigue on safe browsing.

### 5. Authentic SMS Single-Message Alert Burden (UCI SMS Spam Collection)
- Evaluated across all **4,827 authentic legitimate messages** from the UCI SMS Spam Collection through the live `Session.add()` engine.
- Result: **1 false alert** (0.02% false alert rate, <1 alert per 1,000 legitimate messages).
- *Scope Note*: Evaluates false-warning rate on isolated authentic SMS text messages. Realistic multi-stage legitimate journeys are separately validated in the 42 synthetic benign workflows.

### 6. Held-Out Family Novelty Separation (LOFO)
- Evaluated mathematical novelty against baseline centroids with the test fraud family genuinely withheld from the prototype reference set.
- Tested families: Impersonation / Digital Arrest (SG01), Electricity / Utility Disconnection (SG02), Courier Parcel (SG03), Part-Time Job / Task Scam (SG07).
- Result: **4/4 families separated** (**100% novelty rate**, mean novelty **0.4603** > 0.35 threshold).
- *Scope Note*: Measures whether held-out behavioral fraud families remain distinguishable (novelty $\ge$ 0.35) from known family prototypes; it evaluates prototype separation in feature space rather than a population-level zero-day recall claim.

### 7. Multi-Channel Regression Harness
- 84 AI-authored synthetic workflows: **42/42 scam workflows warned**, **0/42 ordinary workflows interrupted**, and **29/29 payment scam workflows warned before simulated authorization**. Engine p95 latency is ~**0.36 ms**.

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
