# AI-Protect v0.4 changes

Implementation of structured evidence, multilingual concept classification, and hardening.

Added structured local evidence, ordered workflow states, an interchangeable multilingual concept classifier, distinct heuristic risk indices, causal timeline explanations, a versioned verification registry, origin-scoped Android messaging, redacted native storage and canonical release versions. Preserved opt-in reporting, independent analytics consent and action-aware interventions. Fixed Windows developer commands, static serving and SQLite connection closure.

Validation: 53 Node tests, 13 Python tests and both browser QA suites pass. The 84 synthetic workflows produced 42/42 scam warnings, 0/42 benign interruptions and 29/29 interventions before simulated authorization. The original 52 workflows remain separately comparable. This is correlated synthetic regression evidence, not population accuracy.

Remaining: Android Gradle build/lint/native tests need JDK 17 and SDK 35, followed by physical-device checks. Independent real-world multilingual validation and a validated on-device language model remain open; the shipped concept classifier has finite lexical coverage.

## Changed files

- `README.md`
- `android/app/build.gradle.kts`
- `android/app/src/main/java/in/aiprotect/companion/BridgePolicy.kt`
- `android/app/src/main/java/in/aiprotect/companion/MainActivity.kt`
- `android/app/src/main/java/in/aiprotect/companion/ReviewSnapshotPolicy.kt`
- `android/app/src/main/java/in/aiprotect/companion/ReviewStore.kt`
- `android/app/src/test/java/in/aiprotect/companion/CompanionTest.kt`
- `backend/server.py`
- `core/constants.mjs`
- `core/engine.mjs`
- `core/evidence.mjs`
- `core/explanations.mjs`
- `core/fingerprint.mjs`
- `core/input.mjs`
- `core/institution-registry.mjs`
- `core/legacy-model.mjs`
- `core/policy.mjs`
- `core/review.mjs`
- `core/rules.mjs`
- `core/semantic-features.mjs`
- `core/semantic-model.mjs`
- `core/semantic.mjs`
- `core/verification.mjs`
- `core/version.mjs`
- `core/workflow.mjs`
- `docs/ARCHITECTURE.md`
- `docs/CHANGES-v0.4.md`
- `docs/DISCLOSURE.md`
- `docs/VALIDATION.md`
- `evaluation/browser-summary.json`
- `evaluation/results.json`
- `evaluation/review-browser-summary.json`
- `evaluation/run.mjs`
- `ml/semantic-training.json`
- `ml/train-semantic.mjs`
- `package.json`
- `scripts/python.mjs`
- `scripts/sync-version.mjs`
- `scripts/test.mjs`
- `simulator/adversarial.mjs`
- `simulator/challenges.mjs`
- `tests/browser.mjs`
- `tests/native-review.test.mjs`
- `tests/review-browser.mjs`
- `tests/review.test.mjs`
- `tests/test_api.py`
- `tests/workflows.test.mjs`
- `web/app.mjs`
- `web/index.html`
- `web/native-review.mjs`
- `web/sw.js`
