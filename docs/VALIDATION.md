# Validation record

## Completed

- 12 Node engine/analytics tests and 6 Python API tests pass.
- 20 synthetic workflows: 10 scam scenarios warned, 10 ordinary workflows not interrupted; 9/9 payment scam scenarios warned before simulated authorization. Results are in evaluation/results.json. This suite is curated and correlated with synthetic training seeds, not representative real-world evidence.
- Browser QA passes in headless Chromium: desktop/mobile rendering, refund message remains passive before QR, pre-authorization warning, cancellation/continuation dialog, independent sharing consent, report deletion, analytics disabled by default, campaign candidates, 20-row validation table, benign restaurant flow, input clearing, malformed UPI errors, mobile document width and offline reload/analysis.
- PDF: 15 pages (10 pitch + 3 architecture + 2 appendices), rendered and visually reviewed; text margins verified. Team identity/eligibility requires the user's review before contest upload.

Browser QA command (development only):

```bash
npm install --no-save playwright
npx playwright install chromium
python3 backend/server.py
# In a second terminal:
node tests/browser.mjs
```

The runtime application itself uses no npm dependencies. CHROMIUM_PATH can select an installed Chromium for development tests. See evaluation/browser-summary.json for the recorded browser checks and docs/screenshots for the verified UI.

## Open evidence gaps

Actual phone power/memory/latency and QR capability matrix; representative independently labelled real traffic; regional language coverage; robustness to paraphrases; campaign poisoning/Sybil resistance; native Android sharesheet and consented ASR; bank/PSP pre-authorization integration; calibration, PR-AUC and family/time heldout evaluation. No voice-clone or deepfake detection accuracy is claimed.
