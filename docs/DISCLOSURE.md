# AI, datasets, models and third-party assets

## AI-generated work

OpenAI ChatGPT/Codex generated this implementation, documentation, design, SVG icon, test scenarios, seed training texts and submission PDF content under user direction. No AI output is treated as verified scam intelligence. Human review is required before submission and deployment.

## Data

157 AI-authored synthetic training texts are retained verbatim in ml/training.json. Twenty authored workflows (10 scam, 10 ordinary, including Hindi/Hinglish and two tactic-composition holdouts) appear in simulator/scenarios.mjs. They are not bank/customer data or recorded real conversations. Training seed wording and scenario wording share tactics and vocabulary; these are correlated smoke tests, not an independent representative evaluation. No unlicensed scam-call corpus, confidential platform data or real financial network is included.

## Models and dependencies

Eleven word/bigram binary logistic heads trained with scikit-learn 1.8.0; coefficients exported in core/model.json. No pretrained language model, ASR model, voice-clone classifier, deepfake model or graph model ships. Rules and workflow scoring are authored heuristics. Runtime: browser APIs, Python standard library / SQLite, Node built-in test runner. Training: scikit-learn (BSD-3-Clause) and its dependencies. PDF generation: ReportLab (BSD license). Optional analytics: PostHog hosted capture API; project data collection is disabled by default. Development browser verification uses Playwright. GitHub Actions use official checkout/setup actions. System Arial/Georgia font stacks; no downloaded images, commercial illustration or third-party logo is used. The generic shield SVG is generated for this project.

## Reference status

The attachments inform design direction. Earlier pasted paper statistics and 2026 research links are not reproduced as validated findings. Official Android, NPCI, scikit-learn and PostHog resources are the operational references. LiveKit, sherpa-onnx, ONNX Runtime, HDBSCAN, River/ADWIN and financial graph research are future implementation candidates, not current dependencies or evaluated results.

## Submission review

Verify eligibility, registration, actual team identity, dependency licences, organiser requirements and all safety claims before upload. The software cannot prove whether a voice or message was AI-generated; behavior recognition targets financial scams irrespective of content origin.
