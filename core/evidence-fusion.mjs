// Multimodal Evidence Fusion Engine
// Integrates acoustic deepfake authenticity, financial intent frames (FIF),
// transaction intent consistency (TICE), domain verification, and behavioral risk.
// Reuses existing core detectors without competing engines.

export const EVIDENCE_TYPES = [
  'acoustic_authenticity',
  'transcription_intent',
  'claimed_identity',
  'domain_consistency',
  'link_analysis',
  'qr_intent',
  'payment_action',
  'contradiction'
];

export const AUTHENTICITY_ASSESSMENTS = [
  'synthetic_suspected',
  'no_strong_synthetic_indication',
  'inconclusive',
  'not_evaluated'
];

export const IDENTITY_STATUSES = [
  'independent_channel_verified',
  'user_confirmed_trusted',
  'unverified',
  'impersonation_suspected'
];

/**
 * Normalizes an evidence item into a typed, versioned record.
 */
export function createEvidenceItem({
  type,
  origin = 'local_device',
  timestamp = Date.now(),
  modelVersion = '1.0.0',
  status = 'completed',
  score = null,
  reasonCodes = [],
  limitations = [],
  userReviewed = false,
  metadata = {}
}) {
  return {
    schema_version: 1,
    type,
    origin,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    model_version: String(modelVersion),
    status,
    score: typeof score === 'number' && Number.isFinite(score) ? score : null,
    reason_codes: Array.isArray(reasonCodes) ? [...reasonCodes] : [],
    limitations: Array.isArray(limitations) ? [...limitations] : [],
    user_reviewed: Boolean(userReviewed),
    metadata: typeof metadata === 'object' && metadata !== null ? {...metadata} : {}
  };
}

/**
 * Fuses acoustic authenticity, communication verification, and behavioral risk
 * into a single explainable multimodal incident report.
 */
export function fuseMultimodalEvidence({
  session = null,
  riskAssessment = null,
  verification = null,
  acousticEvidence = null,
  currentEvent = null
} = {}) {
  const timestamp = Date.now();
  const evidenceItems = [];
  const reasonCodes = new Set();

  // 1. Media Authenticity Dimension
  let mediaAuthenticity = {
    assessment: 'not_evaluated',
    raw_score: null,
    audio_quality: 'not_available',
    model_id: 'none',
    limitations: [],
    synthetic_detected: false
  };

  if (acousticEvidence) {
    const assessment = AUTHENTICITY_ASSESSMENTS.includes(acousticEvidence.authenticity_assessment)
      ? acousticEvidence.authenticity_assessment
      : 'inconclusive';

    const isSynthetic = assessment === 'synthetic_suspected';
    mediaAuthenticity = {
      assessment,
      raw_score: acousticEvidence.raw_model_score ?? null,
      audio_quality: acousticEvidence.audio_quality || 'adequate',
      model_id: acousticEvidence.model_id || 'aasist-acoustic-guard-v1',
      limitations: acousticEvidence.limitations || [],
      synthetic_detected: isSynthetic
    };

    if (isSynthetic) {
      reasonCodes.add('synthetic_audio_manipulation');
    }

    evidenceItems.push(createEvidenceItem({
      type: 'acoustic_authenticity',
      origin: acousticEvidence.media_type === 'audio' ? 'microphone_or_import' : 'local_device',
      timestamp,
      modelVersion: acousticEvidence.model_version || '1.0.0',
      status: acousticEvidence.analysis_status || 'completed',
      score: acousticEvidence.raw_model_score,
      reasonCodes: isSynthetic ? ['synthetic_speech_suspected'] : ['natural_speech_profile'],
      limitations: acousticEvidence.limitations || [],
      metadata: acousticEvidence.acoustic_indicators || {}
    }));
  }

  // 2. Identity Verification Dimension
  let identityVerification = {
    claimed_org: verification?.claimed_org || null,
    claimed_name: verification?.claimed_name || 'Not established',
    domain_consistency: verification?.domain_consistency || 'not_checked',
    caller_status: verification?.caller_status || 'unverified',
    impersonation_risk: verification?.impersonation_risk || 'none',
    independent_url: verification?.independent_url || null,
    explanation: verification?.explanation || 'Identity is unverified.'
  };

  if (verification) {
    if (verification.impersonation_risk === 'high') {
      reasonCodes.add('lookalike_domain_impersonation');
    } else if (verification.status === 'mismatch') {
      reasonCodes.add('domain_mismatch_with_claim');
    }

    evidenceItems.push(createEvidenceItem({
      type: 'claimed_identity',
      origin: 'text_and_protocol',
      timestamp,
      status: verification.status || 'unknown',
      reasonCodes: [verification.domain_consistency, verification.caller_status],
      limitations: ['Registry match alone does not authenticate callers.'],
      metadata: {domains: verification.domains || []}
    }));
  }

  // 3. Behavioral & Transactional Intent Dimension (Existing Policy & TICE)
  const behavioral = {
    severity: riskAssessment?.severity || 'quiet',
    stage: riskAssessment?.stage || 'Normal',
    requested_action_risk: riskAssessment?.requestedActionRisk ?? 0,
    execution_risk: riskAssessment?.executionRisk ?? 0,
    has_contradiction: Boolean(riskAssessment?.hasContradiction),
    contradictions: riskAssessment?.contradictions || [],
    tactics: riskAssessment?.tactics || [],
    escalating: Boolean(riskAssessment?.escalating)
  };

  if (behavioral.has_contradiction) {
    reasonCodes.add('intent_protocol_contradiction');
  }
  if (behavioral.requested_action_risk >= 75) {
    reasonCodes.add('high_stake_action_requested');
  }

  // 4. Multimodal Fusion Synthesis: Composite Threat & Actionable Guidance
  let threatLevel = 'low';
  let guidance = 'Proceed with normal verification habits. Review requests before paying.';

  const isSynthetic = mediaAuthenticity.synthetic_detected;
  const isImpersonation = identityVerification.impersonation_risk === 'high' || identityVerification.domain_consistency === 'mismatch';
  const hasContradiction = behavioral.has_contradiction;
  const isHighBehavioral = behavioral.severity === 'high' || behavioral.severity === 'warning';

  if (isSynthetic && (isHighBehavioral || hasContradiction || isImpersonation)) {
    threatLevel = 'critical';
    guidance = 'CRITICAL: Synthetic audio manipulation detected in combination with high-risk financial coercion. Stop immediately and do not transfer money or share credentials.';
  } else if (hasContradiction || (isImpersonation && behavioral.requested_action_risk >= 45)) {
    threatLevel = 'critical';
    guidance = 'CRITICAL: Structural contradiction between what is claimed and what payment protocol executes. Do not authorize payment or scan QR codes.';
  } else if (isSynthetic) {
    threatLevel = 'elevated';
    guidance = 'ATTENTION: Synthetic or voice-cloned speech indicators suspected. Even if benign, verify caller identity independently before taking financial actions.';
  } else if (isHighBehavioral) {
    threatLevel = 'elevated';
    guidance = 'WARNING: High-risk financial manipulation pattern detected. Pause and verify the request using an independent channel.';
  } else if (behavioral.severity === 'watch' || identityVerification.impersonation_risk === 'elevated') {
    threatLevel = 'guarded';
    guidance = 'CAUTION: Suspicious indicators observed. Review the evidence timeline before sharing credentials or opening links.';
  }

  return {
    schema_version: 1,
    timestamp,
    threat_level: threatLevel,
    actionable_guidance: guidance,
    reason_codes: Array.from(reasonCodes),
    media_authenticity: mediaAuthenticity,
    identity_verification: identityVerification,
    behavioral_risk: behavioral,
    evidence_items: evidenceItems,
    explainable_summary: {
      headline: threatLevel === 'critical' ? 'Stop & Verify Before Paying' : threatLevel === 'elevated' ? 'Suspicious Indicators Found' : 'Routine Verification',
      key_factors: Array.from(reasonCodes),
      suggested_actions: threatLevel === 'critical'
        ? ['End the call immediately', 'Open your banking app independently', 'Dial 1930 if money was sent']
        : ['Verify via official bank app or card helpline', 'Never share OTP or install remote access apps']
    }
  };
}
