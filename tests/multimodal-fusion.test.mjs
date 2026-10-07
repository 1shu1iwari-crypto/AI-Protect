import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCommunication} from '../core/verification.mjs';
import {institutionRegistry} from '../core/institution-registry.mjs';
import {fuseMultimodalEvidence, createEvidenceItem} from '../core/evidence-fusion.mjs';
import {ReviewSession} from '../core/review.mjs';

test('Phase 2: Lookalike domain detection identifies deceptive institutional impersonation', () => {
  // Test lookalike domains with brand keywords
  const lookalikes = [
    'HDFC urgent update https://hdfc-kyc.com/login',
    'SBI card blocked https://sbi-verification.online/restore',
    'ICICI account alert https://icici-update.top/auth',
    'Axis bank netbanking https://axis-secure.xyz/login'
  ];

  for (const text of lookalikes) {
    const res = verifyCommunication(text);
    assert.equal(res.domain_consistency, 'lookalike_impersonation', `Should detect lookalike in: ${text}`);
    assert.equal(res.impersonation_risk, 'high');
    assert.equal(res.status, 'mismatch');
  }

  // Official authentic domain
  const official = verifyCommunication('HDFC statement https://www.hdfc.bank.in/personal/ways-to-bank');
  assert.equal(official.domain_consistency, 'matches_registry');
  assert.equal(official.impersonation_risk, 'none');
  assert.equal(official.status, 'verified');
  // Strict non-negotiable: domain match never authenticates the caller
  assert.equal(official.caller_status, 'unverified');
});

test('Phase 2: Independent channel verification decouples caller authentication from domain match', () => {
  // Inbound unsolicited call with official link
  const unsolicited = verifyCommunication('HDFC officer calling https://www.hdfc.bank.in', null, 'unsolicited');
  assert.equal(unsolicited.caller_status, 'unverified');
  assert.equal(unsolicited.sender_context, 'unsolicited');

  // User called bank using card back number
  const independent = verifyCommunication('I called HDFC on my card number', null, 'independently_contacted');
  assert.equal(independent.caller_status, 'independent_channel_verified');
});

test('Phase 3: Multimodal evidence fusion connects acoustic authenticity with financial behavior', () => {
  // 1. Synthetic voice + fraudulent money redirection -> Critical Threat
  const syntheticEvidence = {
    schema_version: 1,
    analysis_status: 'completed',
    media_type: 'audio',
    model_id: 'aasist-acoustic-guard-v1',
    model_version: '1.0.0',
    authenticity_assessment: 'synthetic_suspected',
    raw_model_score: 0.94,
    calibration_status: 'calibrated',
    audio_quality: 'adequate'
  };

  const highRiskBehavior = {
    severity: 'high',
    stage: 'Transfer prepared',
    requestedActionRisk: 90,
    executionRisk: 95,
    hasContradiction: true,
    contradictions: ['credit_vs_debit'],
    tactics: ['authority', 'threat', 'payment']
  };

  const verification = verifyCommunication('Police Cyber Cell officer calling');

  const fused = fuseMultimodalEvidence({
    riskAssessment: highRiskBehavior,
    verification,
    acousticEvidence: syntheticEvidence
  });

  assert.equal(fused.threat_level, 'critical');
  assert.equal(fused.media_authenticity.synthetic_detected, true);
  assert.equal(fused.behavioral_risk.has_contradiction, true);
  assert.ok(fused.reason_codes.includes('synthetic_audio_manipulation'));
  assert.ok(fused.reason_codes.includes('intent_protocol_contradiction'));
  assert.ok(fused.actionable_guidance.includes('CRITICAL'));
});

test('Phase 3: Negative test — Harmless synthetic speech without financial scam intent does not trigger fraud intervention', () => {
  // Synthetic voice in a benign navigation or customer service announcement
  const syntheticEvidence = {
    schema_version: 1,
    analysis_status: 'completed',
    media_type: 'audio',
    authenticity_assessment: 'synthetic_suspected',
    raw_model_score: 0.88,
    audio_quality: 'adequate'
  };

  const benignBehavior = {
    severity: 'quiet',
    stage: 'Normal',
    requestedActionRisk: 0,
    executionRisk: 0,
    hasContradiction: false,
    contradictions: [],
    tactics: []
  };

  const verification = verifyCommunication('Your order has arrived at the pickup station');

  const fused = fuseMultimodalEvidence({
    riskAssessment: benignBehavior,
    verification,
    acousticEvidence: syntheticEvidence
  });

  // Threat level is elevated because voice is synthetic, but NO false financial fraud accusation
  assert.equal(fused.threat_level, 'elevated');
  assert.equal(fused.behavioral_risk.has_contradiction, false);
  assert.ok(!fused.reason_codes.includes('intent_protocol_contradiction'));
  assert.ok(!fused.reason_codes.includes('high_stake_action_requested'));
  assert.ok(fused.actionable_guidance.includes('verify caller identity independently'));
});

test('Phase 3: ReviewSession end-to-end integration accepts acoustic authenticity evidence', () => {
  const session = new ReviewSession();

  const acousticData = {
    authenticity_assessment: 'synthetic_suspected',
    raw_model_score: 0.91,
    audio_quality: 'adequate',
    model_id: 'aasist-acoustic-guard-v1'
  };

  const res = session.add({
    userTriggered: true,
    channel: 'call',
    text: 'I am HDFC manager. Urgent KYC pending. Open http://hdfc.bank.in.evil.invalid',
    acousticEvidence: acousticData
  });

  assert.ok(res.fused);
  assert.equal(res.fused.media_authenticity.assessment, 'synthetic_suspected');
  assert.ok(['mismatch', 'lookalike_impersonation'].includes(res.verification.domain_consistency));
  assert.ok(res.fused.reason_codes.includes('synthetic_audio_manipulation'));
});
