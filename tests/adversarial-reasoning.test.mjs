import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, extractRegisteredDomain, parseAndAnalyzeUrl, trajectoryCosineSimilarity } from '../core/engine.mjs';
import { evaluateUrlRisk } from '../core/url-classifier.mjs';
import { extractFinancialIntentFrame } from '../core/financial-intent.mjs';
import { calculateEventRelationship } from '../core/event-relation.mjs';

// ============================================================================
// ADVERSARIAL REGRESSION TEST SUITE (CASES A - G)
// Validates hybrid semantic + deterministic financial reasoning,
// action-gated intervention policy, and causal relationship resolution.
// ============================================================================

test('Case A — implicit migration payment separates requested and execution risk', () => {
  const s = new Session();
  
  // 1. Initial message requesting fund movement and calibration transaction
  const msgResult = s.add({
    channel: 'message',
    text: 'Your old wallet balance will be mirrored to the new settlement system. First establish destination using a reversible ₹99 verification transaction. Settlement ID 8841.'
  });

  const frame = msgResult.event.frame;
  assert.equal(frame.financial_redirection, true, 'financial_redirection must be detected');
  assert.ok(['migration', 'verification'].includes(frame.purpose), 'pretext purpose detected');
  assert.ok(msgResult.requestedActionRisk > 0, 'requestedActionRisk must be elevated');
  assert.equal(msgResult.executionRisk, 0, 'executionRisk must be 0 before actual payment execution');
  assert.equal(msgResult.showWarning, false, 'No alert modal shown before user takes action');

  // 2. Outgoing payment action execution
  const payResult = s.add({
    channel: 'payment',
    payment: { amount: 99, newPayee: true }
  });

  assert.ok(payResult.executionRisk > 50, 'executionRisk rises sharply upon outgoing action');
  assert.equal(payResult.showWarning, true, 'Action-gated STOP & VERIFY warning triggers at execution');
});

test('Case B — Hinglish verification suppression detection', () => {
  const s = new Session();
  const res = s.add({
    channel: 'message',
    text: '₹149 verification handshake. PIN stays local. Don\'t call bank or migration cancels.'
  });

  const frame = res.event.frame;
  assert.equal(frame.financial_redirection, true, 'financial_redirection detected');
  assert.ok(['verification', 'migration'].includes(frame.purpose), 'verification or migration pretext detected');
  assert.equal(frame.verification_suppression, true, 'verification_suppression detected');
  assert.ok(res.requestedActionRisk > 0, 'requestedActionRisk > 0');
  assert.equal(res.executionRisk, 0, 'executionRisk = 0');
});

test('Case C — refund TICE causal consistency and credit-vs-debit contradiction', () => {
  const s = new Session();
  
  // Event 1: Refund claim
  const e1 = s.add({
    channel: 'message',
    text: 'Your refund of ₹18,750 has been approved.'
  });
  assert.equal(e1.event.frame.claim_direction, 'inbound');

  // Event 2: Deictic instruction
  s.add({
    channel: 'message',
    text: 'Scan this QR to receive your refund immediately.'
  });

  // Event 3: Outgoing UPI QR debit
  const e3 = s.add({
    channel: 'qr',
    text: 'upi://pay?pa=merchant-refund@bank&am=18750&cu=INR'
  });

  assert.equal(e3.contradiction.hasContradiction, true, 'TICE contradiction must trigger');
  const contra = e3.contradiction.contradictions[0];
  assert.equal(contra.type, 'credit_vs_debit');
  assert.ok(contra.relationshipScore >= 0.50, 'Causal relationship must be strong');
  assert.equal(e3.showWarning, true, 'High-severity intervention triggered at QR scan');
  assert.equal(e3.severity, 'high');
});

test('Case D — deceptive domain extraction with Public Suffix List and brand mismatch', () => {
  const testUrl = 'https://secure-login.sbi.co.in.account-verification.support/login';
  
  // 1. PSL registered domain extraction
  const domainInfo = extractRegisteredDomain('secure-login.sbi.co.in.account-verification.support');
  assert.equal(domainInfo.registeredDomain, 'account-verification.support', 'Extracts genuine registered domain under .support');
  assert.equal(domainInfo.subdomain, 'secure-login.sbi.co.in', 'Identifies deceptive subdomain padding');

  // 2. Multi-part TLD extraction test (co.in, co.uk)
  const coInInfo = extractRegisteredDomain('banking.sbi.co.in');
  assert.equal(coInInfo.registeredDomain, 'sbi.co.in', 'Extracts sbi.co.in correctly without treating sbi as subdomain');
  assert.equal(coInInfo.publicSuffix, 'co.in');

  const coUkInfo = extractRegisteredDomain('portal.bank.co.uk');
  assert.equal(coUkInfo.registeredDomain, 'bank.co.uk', 'Extracts bank.co.uk correctly');
  assert.equal(coUkInfo.publicSuffix, 'co.uk');

  // 3. Deceptive brand analysis
  const analysis = parseAndAnalyzeUrl(testUrl);
  assert.equal(analysis.registeredDomain, 'account-verification.support');
  assert.equal(analysis.claimedBrand, 'SBI', 'Identifies claimed brand');
  assert.equal(analysis.deceptiveText, 'sbi.co.in', 'Identifies deceptive domain text');
  assert.equal(analysis.isBrandMismatch, true, 'Flags brand mismatch');
  assert.ok(analysis.brandExplanation.includes('account-verification.support'), 'Explanation contains true registered domain');

  // 4. URL risk model integration
  const risk = evaluateUrlRisk(testUrl);
  assert.equal(risk.isHighRisk, true, 'URL evaluated as high risk');
  assert.ok(risk.probability > 0.65, 'Risk probability exceeds threshold');
});

test('Case E — compliance fund movement with temporary custody and beneficiary creation', () => {
  const s = new Session();
  const res = s.add({
    channel: 'message',
    text: 'Compliance and audit department. Create a fresh beneficiary and move 80% balance immediately. The funds remain legally yours in the temporary holding profile.'
  });

  const frame = res.event.frame;
  assert.equal(frame.financial_redirection, true, 'financial_redirection detected');
  assert.equal(frame.temporary_custody, true, 'temporary_custody detected');
  assert.equal(frame.beneficiary_creation, true, 'beneficiary_creation detected');
  assert.ok(res.requestedActionRisk >= 65, 'requestedActionRisk elevated');
  assert.equal(res.executionRisk, 0, 'executionRisk remains 0');
});

test('Case F — zero-day product-review journey creates genuine trajectory without manual coordinate edits', () => {
  function runProductReviewJourney(payoutAmt = 15000, feeAmt = 11800) {
    const s = new Session();
    const t0 = s.started;
    s.add({ channel: 'message', text: 'Welcome to AI product reviewer team. Rate 5 apps daily to earn guaranteed income.', timestamp: t0 });
    s.add({ channel: 'message', text: `Your simulated earnings are ₹${payoutAmt} in your portal balance.`, timestamp: t0 + 5000 });
    s.add({ channel: 'payment', payment: { amount: 200, newPayee: true }, timestamp: t0 + 10000 });
    s.add({ channel: 'message', text: 'Larger settlement unlocked. Payout balance ready.', timestamp: t0 + 15000 });
    s.add({ channel: 'message', text: 'Your trust score requires a calibration fee before withdrawal.', timestamp: t0 + 20000 });
    s.add({ channel: 'payment', payment: { amount: feeAmt, newPayee: false }, timestamp: t0 + 25000 });
    return s;
  }

  const s1 = runProductReviewJourney(15000, 11800);
  const s2 = runProductReviewJourney(18500, 14200);

  const t1 = s1.trajectory();
  const t2 = s2.trajectory();

  assert.equal(t1.length, 64, 'Trajectory must be 64-dimensional');
  assert.equal(t2.length, 64, 'Trajectory must be 64-dimensional');

  // Verify all elements are valid finite numbers without manual overrides
  assert.ok(t1.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1));

  // Trajectory vectors of paraphrased variants must exhibit high behavioral cosine similarity
  const sim = trajectoryCosineSimilarity(t1, t2);
  assert.ok(sim >= 0.70, `Similarity between paraphrased journeys must be high (got ${sim})`);
});

test('Case G — legitimate reimbursement counterexample prevents false TICE contradiction', () => {
  const s = new Session();
  
  // 1. Legitimate employer reimbursement
  const e1 = s.add({
    channel: 'message',
    text: 'Employer reimbursement of ₹12,000 has been credited to your salary account.'
  });
  assert.equal(e1.event.frame.counterparty_role, 'employer');
  assert.equal(e1.event.frame.purpose, 'reimbursement');

  // 2. Unrelated roommate dinner/hotel share
  const e2 = s.add({
    channel: 'message',
    text: 'Hey bro, roommate hotel share comes to ₹5,850 for the Goa trip.'
  });
  assert.equal(e2.event.frame.counterparty_role, 'friend');
  assert.equal(e2.event.frame.purpose, 'personal_payment');

  // 3. Known payee payment QR
  const e3 = s.add({
    channel: 'qr',
    text: 'upi://pay?pa=roommate@upi&am=5850&cu=INR'
  });

  // Verify causal resolver evaluates weak relationship between employer reimbursement and roommate QR
  const rel = calculateEventRelationship(e1.event, e3.event, s.events);
  assert.equal(rel.isRelated, false, 'Relationship between reimbursement and roommate payment must be weak');
  assert.ok(rel.score < 0.50, `Relationship score should be < 0.50 (got ${rel.score})`);

  // Verify TICE produces NO contradiction and NO severe warning
  assert.equal(e3.contradiction.hasContradiction, false, 'NO false credit-vs-debit contradiction');
  assert.equal(e3.showWarning, false, 'NO severe warning for legitimate roommate reimbursement');
  assert.equal(e3.severity, 'quiet', 'Stays quiet, preventing alert fatigue');
});

test('Counterfactual robustness: affirmative safety advice does NOT trigger verification suppression', () => {
  const frame1 = extractFinancialIntentFrame({}, 'Call the bank using the number on the back of your card.');
  assert.equal(frame1.verification_suppression, false, 'Legitimate advice to call bank must not trigger suppression');

  const frame2 = extractFinancialIntentFrame({}, 'Visit the official branch immediately to clarify your status.');
  assert.equal(frame2.verification_suppression, false, 'Branch visit guidance must not trigger suppression');

  const frame3 = extractFinancialIntentFrame({}, 'Do not call the bank or visit any branch.');
  assert.equal(frame3.verification_suppression, true, 'Discouraging contact must trigger suppression');
});

test('Metamorphic robustness: euphemisms of financial redirection map to same intent', () => {
  const phrases = [
    'Please move your funds to the secure profile.',
    'Shift roughly 80% of your balance to the destination account.',
    'Park the money temporarily in our holding reserve.',
    'Allocate liquidity to establish destination node.',
    'Complete the verification transaction to secure your funds elsewhere.',
    'Route the balance to our temporary settlement account.'
  ];

  for (const phrase of phrases) {
    const frame = extractFinancialIntentFrame({}, phrase);
    assert.equal(frame.financial_redirection, true, `Failed to detect redirection for: "${phrase}"`);
  }
});

test('Adversarial URL defense handles multiple obfuscation techniques', () => {
  // 1. Username @ trick
  const urlAt = 'https://sbi.co.in@phishing-host.xyz/portal';
  const analysisAt = parseAndAnalyzeUrl(urlAt);
  assert.equal(analysisAt.adversarialIndicators.hasUserInfoTrick, true);
  assert.equal(analysisAt.registeredDomain, 'phishing-host.xyz');

  // 2. Percent-encoded host
  const urlPercent = 'http://%73%62%69.login-support.click/verify';
  const analysisPercent = parseAndAnalyzeUrl(urlPercent);
  assert.equal(analysisPercent.adversarialIndicators.isPercentEncoded, true);

  // 3. Open redirect parameter
  const urlRedirect = 'https://portal.net/go?url=http://evil.com';
  const analysisRedirect = parseAndAnalyzeUrl(urlRedirect);
  assert.equal(analysisRedirect.adversarialIndicators.hasRedirectParam, true);

  // 4. IP host
  const urlIp = 'http://192.168.1.100/secure-banking';
  const analysisIp = parseAndAnalyzeUrl(urlIp);
  assert.equal(analysisIp.isIpHost, true);
});
