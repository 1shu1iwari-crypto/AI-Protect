// Event Relationship Resolver
// Causal relationship scoring between prior claims/context and current financial actions.
// Resolves whether an outgoing action is causally linked to an earlier claim,
// preventing false TICE contradictions across disjoint conversational topics.

import { normalize } from './input.mjs';

const DEICTIC_REFERENCE_PATTERNS = [
  /\b(?:this\s+qr|scan\s+this|to\s+receive\s+(?:it|this|your)|after\s+this\s+payment|complete\s+this\s+transaction|refund\s+will\s+arrive|deposit\s+here)\b/iu,
  /\b(?:yeh\s+qr|paise\s+lene\s+ke\s+liye|is\s+qr\s+ko|ispe\s+bhejo)\b/iu,
  /(?:यह\s*क्यूआर|रिफंड\s*पाने\s*के\s*लिए|इस\s*क्यूआर\s*पर)/iu
];

export function calculateEventRelationship(claimEvent, actionEvent, sessionEvents = []) {
  const claimText = normalize(claimEvent.text || '');
  const actionText = normalize(actionEvent.text || '');
  const claimFrame = claimEvent.frame || {};
  const actionFrame = actionEvent.frame || {};

  let score = 0.0;
  const positiveFactors = [];
  const negativeFactors = [];

  // 1. Explicit Deictic or Causal References
  const hasDeicticReference = DEICTIC_REFERENCE_PATTERNS.some(p => p.test(claimText) || p.test(actionText));
  if (hasDeicticReference) {
    score += 0.45;
    positiveFactors.push('explicit_deictic_link');
  }

  // 2. Amount Equality / Matching
  const claimAmount = claimFrame.raw_amount;
  const actionAmount = actionFrame.raw_amount || (actionEvent.payment ? actionEvent.payment.amount : null);

  if (claimAmount !== null && actionAmount !== null) {
    if (Math.abs(claimAmount - actionAmount) < 0.01) {
      score += 0.40;
      positiveFactors.push('exact_amount_match');
    } else {
      // Significantly different amounts is strong negative evidence unless proportional
      score -= 0.35;
      negativeFactors.push('divergent_amount');
    }
  } else if (claimEvent.amount_bucket && actionEvent.amount_bucket && claimEvent.amount_bucket !== 'unknown') {
    if (claimEvent.amount_bucket === actionEvent.amount_bucket) {
      score += 0.15;
      positiveFactors.push('bucket_match');
    }
  }

  // 3. Counterparty Role Alignment vs Conflict
  const claimRole = claimFrame.counterparty_role || 'unknown';
  const actionRole = actionFrame.counterparty_role || 'unknown';

  if (claimRole !== 'unknown' && actionRole !== 'unknown') {
    if (claimRole === actionRole) {
      score += 0.25;
      positiveFactors.push('shared_counterparty_role');
    } else {
      // Divergent roles (e.g. 'employer' vs 'friend') is strong negative evidence
      score -= 0.40;
      negativeFactors.push('conflicting_counterparty_role');
    }
  }

  // 4. Purpose Alignment vs Conflict
  const claimPurpose = claimFrame.purpose || 'unknown';
  const actionPurpose = actionFrame.purpose || 'unknown';

  if (claimPurpose !== 'unknown' && actionPurpose !== 'unknown') {
    if (claimPurpose === actionPurpose) {
      score += 0.30;
      positiveFactors.push('shared_purpose');
    } else if (
      (claimPurpose === 'reimbursement' && (actionPurpose === 'personal_payment' || actionPurpose === 'purchase')) ||
      (claimPurpose === 'refund' && actionPurpose === 'personal_payment')
    ) {
      score -= 0.45;
      negativeFactors.push('disjoint_purpose');
    }
  }

  // 5. Sequence Adjacency and Temporal Distance
  const claimIdx = sessionEvents.indexOf(claimEvent);
  const actionIdx = sessionEvents.indexOf(actionEvent);
  if (claimIdx !== -1 && actionIdx !== -1) {
    const stepDiff = Math.abs(actionIdx - claimIdx);
    if (stepDiff === 1) {
      score += 0.20;
      positiveFactors.push('immediate_step_adjacency');
    } else if (stepDiff <= 3) {
      score += 0.10;
      positiveFactors.push('close_step_proximity');
    } else {
      score -= 0.10;
      negativeFactors.push('distant_steps');
    }
  }

  // 6. Direct Directional Contradiction Context (e.g. claimed inbound while requesting outbound QR)
  if (claimFrame.claimed_inbound_money && actionEvent.channel === 'qr') {
    if (hasDeicticReference || (claimAmount && actionAmount && Math.abs(claimAmount - actionAmount) < 0.01)) {
      score += 0.20;
      positiveFactors.push('qr_refund_coupling');
    }
  }

  // Clamp score to [0, 1]
  const finalScore = Math.max(0.0, Math.min(1.0, score));
  const isRelated = finalScore >= 0.50;

  return {
    score: round(finalScore, 4),
    isRelated,
    positiveFactors,
    negativeFactors
  };
}

function round(val, dec) {
  const p = 10 ** dec;
  return Math.round(val * p) / p;
}
