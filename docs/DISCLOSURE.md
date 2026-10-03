# AI, datasets, models and third-party assets

## AI-generated work

OpenAI ChatGPT/Codex generated this implementation, documentation, design, SVG icon, test scenarios, seed training texts and submission PDF content under user direction. No AI output is treated as verified scam intelligence. Human review is required before submission and deployment.

## Data

157 AI-authored synthetic training texts are retained verbatim in ml/training.json. 52 AI-authored workflows (26 scam, 26 ordinary) appear in simulator/scenarios.mjs and simulator/challenges.mjs. The original 20 are smoke tests; 32 later challenge cases were excluded from the frozen training set. They share authorship and tactic vocabulary, so they are not independent real-world validation. Two challenge cases are intentionally unsupported and appear as false negatives. A synthetic UPI QR fixture is generated with qrcode 8.2 (BSD license). They are not bank/customer data or recorded real conversations. Training seed wording and scenario wording share tactics and vocabulary; these are correlated smoke tests, not an independent representative evaluation. No unlicensed scam-call corpus, confidential platform data or real financial network is included.

## Models and dependencies

Eleven word/bigram binary logistic heads trained with scikit-learn 1.8.0; coefficients exported in core/model.json. No pretrained language model, ASR model, voice-clone classifier, deepfake model or graph model ships. Rules and workflow scoring are authored heuristics. Runtime: browser APIs, Python standard library / SQLite, Node built-in test runner, and bundled jsQR 1.4.0 (Apache-2.0; original license retained at web/vendor/jsQR-LICENSE.txt). Training: scikit-learn (BSD-3-Clause) and its dependencies. PDF generation: ReportLab (BSD license). Optional analytics: PostHog hosted capture API; project data collection is disabled by default. Development browser verification uses Playwright. GitHub Actions use official checkout/setup actions. System Arial/Georgia font stacks; no downloaded images, commercial illustration or third-party logo is used. The generic shield SVG is generated for this project.

## Reference status

The attachments inform design direction. Earlier pasted paper statistics and 2026 research links are not reproduced as validated findings. Official Android, NPCI, scikit-learn and PostHog resources are the operational references. LiveKit, sherpa-onnx, ONNX Runtime, HDBSCAN, River/ADWIN and financial graph research are future implementation candidates. Current campaign grouping uses authored Jaccard/LCS code and a fixed-window Hoeffding cue, not these packages. They are not current dependencies or evaluated results.

## Submission review

Verify eligibility, registration, actual team identity, dependency licences, organiser requirements and all safety claims before upload. The software cannot prove whether a voice or message was AI-generated; behavior recognition targets financial scams irrespective of content origin.


## v0.3 additions

Review state, registry matching, UI, Kotlin companion, tests and docs are AI-generated under user instruction. Hero KYC/call/QR inputs are synthetic `.invalid`/`@demo` fixtures. No new model or real conversation dataset was added. Android uses Kotlin 2.0.21, Android Gradle Plugin 8.9.1, Gradle 8.11.1 and AndroidX WebKit 1.12.1 (Apache-2.0); JVM tests use JUnit 4.13.2 (EPL-1.0), Robolectric 4.14.1 (MIT) and Mockito 5.15.2 (MIT). Official SDK/JDK tooling is build-only. No borrowed product branding or UI was copied. The existing submission PDF describes v0.2 and has not been regenerated for this Android increment.
