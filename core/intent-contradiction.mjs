// Transaction Intent Consistency Engine (TICE)
// Deterministic cross-channel and cross-modal intent verification.
// Detects structural contradictions between what the other party claims is happening
// and what the technical / payment protocol actually executes before money leaves.

import { normalize } from './input.mjs';

export const CONTRADICTION_TYPES = {
 CREDIT_VS_DEBIT: 'credit_vs_debit',
 AUTHORITY_ACTION_MISMATCH: 'authority_action_mismatch',
 INVESTMENT_ADVANCE_FEE: 'investment_advance_fee',
 KYC_SIDELOAD_MISMATCH: 'kyc_sideload_mismatch'
};

const CREDIT_CLAIM_PATTERNS = [
 /\b(?:receive|refund|cashback|credit|credited|prize|reward|lottery|payout|wapas|milenge|milega|paise\s*lo|swikar)\b/iu,
 /(?:रिफंड|कैशबैक|पैसे\s*मिलेंगे|पैसे\s*प्राप्त|इनाम|क्रेडिट)/iu
];

const SAFE_ACCOUNT_PATTERNS = [
 /\b(?:safe|reserve|protection|clearance|escrow|temporary|surveillance|holding|rbi\s*approved)\s*(?:account|fund|transfer|deposit)\b/iu,
 /(?:सुरक्षित\s*खाता|सरकारी\s*खाता|जांच\s*खाता)/iu
];

/**
 * Checks if incoming text claims the user will receive or collect money.
 */
export function claimsCreditOrRefund(events) {
 for (const e of events) {
  if (e.tactics?.includes('refund')) return true;
  if (e.persuasion_signals?.includes('reward') && !e.tactics?.includes('investment')) return true;
  const raw = String(e.text || '');
  if (CREDIT_CLAIM_PATTERNS.some(p => p.test(raw))) return true;
 }
 return false;
}

/**
 * Checks if incoming text claims official authority or banking support.
 */
export function claimsAuthorityOrSupport(events) {
 return events.some(e => 
  e.claimed_identity === 'authority' || 
  e.claimed_identity === 'support' || 
  e.tactics?.includes('authority')
 );
}

/**
 * Evaluates intent consistency across the full session history and current event.
 * Returns an object with detected contradictions and explainable rationale.
 */
export function checkIntentConsistency(events, current) {
 const contradictions = [];
 const explanations = [];

 const hasCreditClaim = claimsCreditOrRefund(events);
 const isOutgoingPayment = Boolean(current.payment) || current.channel === 'payment' || current.channel === 'qr';

 // 1. Credit Claim vs Outgoing Debit Protocol Contradiction
 if (hasCreditClaim && isOutgoingPayment) {
  contradictions.push({
   type: CONTRADICTION_TYPES.CREDIT_VS_DEBIT,
   severity: 'critical',
   claimedIntent: 'Receive money / refund credit',
   protocolAction: 'Outgoing UPI payment transfer (Debit)',
   explanation: 'The other party claims you are receiving money, but this action initiates an OUTGOING payment. In UPI, receiving funds NEVER requires scanning a QR or entering a UPI PIN.'
  });
  explanations.push('Protocol contradiction: Claimed incoming refund vs actual outgoing UPI payment transfer.');
 }

 // 2. Official Authority vs Malicious/Coercive Action Mismatch
 const hasAuthority = claimsAuthorityOrSupport(events);
 const hasRemoteAccess = events.some(e => e.tactics?.includes('remote_access')) || current.tactics?.includes('remote_access');
 const hasApk = events.some(e => e.tactics?.includes('apk')) || current.tactics?.includes('apk');
 const hasSafeAccountDemand = events.some(e => 
  e.persuasion_signals?.includes('redirection') || 
  (e.persuasion_signals?.includes('coercion') && (e.tactics?.includes('threat') || e.tactics?.includes('isolation')))
 );

 if (hasAuthority) {
  if (hasRemoteAccess) {
   contradictions.push({
    type: CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH,
    severity: 'critical',
    claimedIntent: 'Official Authority / Law Enforcement / Bank Support',
    protocolAction: 'Remote Screen Share / Device Control (AnyDesk/TeamViewer)',
    explanation: 'Law enforcement and genuine bank officers never ask citizens to install screen sharing apps or grant remote device control.'
   });
   explanations.push('Incompatible action: Official authority claim combined with remote screen-sharing control.');
  }

  if (hasApk) {
   contradictions.push({
    type: CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH,
    severity: 'critical',
    claimedIntent: 'Official Banking / Government Agency',
    protocolAction: 'Manual APK Sideload',
    explanation: 'Banks and government departments never distribute apps via APK sideloading links or messaging channels.'
   });
   explanations.push('Incompatible action: Official agency claim directing to an unofficial APK package.');
  }

  if (hasSafeAccountDemand && isOutgoingPayment) {
   contradictions.push({
    type: CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH,
    severity: 'critical',
    claimedIntent: 'Police / CBI / RBI Investigation',
    protocolAction: 'Transfer to "Safe" / Escrow Account',
    explanation: 'Police, courts, and RBI do not operate "safe accounts" for citizens to transfer funds during investigations.'
   });
   explanations.push('Incompatible action: Coercive demand to move funds to an alleged official "safe account".');
  }
 }

 // 3. Investment Profit vs Advance Withdrawal Fee Contradiction
 const hasInvestment = events.some(e => e.tactics?.includes('investment'));
 const hasAdvanceFee = events.some(e => e.tactics?.includes('fee') || e.persuasion_signals?.includes('recovery'));
 if (hasInvestment && hasAdvanceFee && isOutgoingPayment) {
  contradictions.push({
   type: CONTRADICTION_TYPES.INVESTMENT_ADVANCE_FEE,
   severity: 'high',
   claimedIntent: 'Withdraw investment / task profits',
   protocolAction: 'Upfront deposit / unlock fee',
   explanation: 'Legitimate investment platforms deduct fees directly from balance; they never demand an upfront out-of-pocket transfer to release earnings.'
  });
  explanations.push('Intent contradiction: Demanding an upfront payment to release earned investment funds.');
 }

 // 4. KYC Verification vs Sideloading Mismatch
 const hasKyc = events.some(e => e.tactics?.includes('verification'));
 if (hasKyc && hasApk) {
  contradictions.push({
   type: CONTRADICTION_TYPES.KYC_SIDELOAD_MISMATCH,
   severity: 'high',
   claimedIntent: 'Banking KYC / Account verification',
   protocolAction: 'Untrusted APK installation',
   explanation: 'Account KYC is performed inside official banking apps or verified branches, never via third-party APK downloads.'
  });
  explanations.push('Intent mismatch: Banking KYC pretext delivering an untrusted app download.');
 }

 return {
  hasContradiction: contradictions.length > 0,
  contradictions,
  explanations,
  highestSeverity: contradictions.some(c => c.severity === 'critical') ? 'critical' : (contradictions.length ? 'high' : 'none')
 };
}
