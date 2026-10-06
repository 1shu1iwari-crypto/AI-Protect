// Financial Intent Frame (FIF)
// Structured local representation for financial meaning and protocol intent.
// Preserves privacy: exact amounts are used strictly for local causal matching
// and are never exported to fingerprints or transmitted over the network.

import { normalize } from './input.mjs';

export const CLAIM_DIRECTIONS = ['inbound', 'outbound', 'neutral', 'unknown'];
export const REQUESTED_ACTIONS = [
  'none',
  'transfer',
  'scan_qr',
  'add_beneficiary',
  'open_link',
  'install_app',
  'share_credentials',
  'enable_remote_access'
];

export const PURPOSES = [
  'refund',
  'reimbursement',
  'verification',
  'migration',
  'settlement',
  'investment',
  'withdrawal',
  'unlock',
  'compliance',
  'purchase',
  'personal_payment',
  'unknown'
];

export const COUNTERPARTY_ROLES = [
  'bank',
  'government',
  'employer',
  'merchant',
  'friend',
  'support',
  'investment_platform',
  'unknown'
];

const CURRENCY_REGEX = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|रुपये)/iu;
const STANDALONE_AMOUNT_REGEX = /\b(?:amount|sum|balance|transfer|pay|fee|refund|reimburse|reimbursement)\s*(?:of)?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)\b/iu;

export function extractNumericAmount(text) {
  if (!text) return null;
  const match = String(text).match(CURRENCY_REGEX) || String(text).match(STANDALONE_AMOUNT_REGEX);
  if (match) {
    const numStr = (match[1] || match[2]).replace(/,/g, '');
    const val = parseFloat(numStr);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  return null;
}

export const DEICTIC_REFERENCE_PATTERNS = [
  /\b(?:this\s+qr|scan\s+this|to\s+receive\s+(?:it|this|your)|after\s+this\s+payment|complete\s+this\s+transaction|refund\s+will\s+arrive|deposit\s+here)\b/iu,
  /\b(?:yeh\s+qr|paise\s+lene\s+ke\s+liye|is\s+qr\s+ko|ispe\s+bhejo)\b/iu,
  /(?:यह\s*क्यूआर|रिफंड\s*पाने\s*के\s*लिए|इस\s*क्यूआर\s*पर)/iu
];

export class FinancialIntentFrame {
  constructor(init = {}) {
    this.claim_direction = CLAIM_DIRECTIONS.includes(init.claim_direction) ? init.claim_direction : 'unknown';
    this.requested_action = REQUESTED_ACTIONS.includes(init.requested_action) ? init.requested_action : 'none';
    this.purpose = PURPOSES.includes(init.purpose) ? init.purpose : 'unknown';
    this.counterparty_role = COUNTERPARTY_ROLES.includes(init.counterparty_role) ? init.counterparty_role : 'unknown';
    this.temporary_custody = Boolean(init.temporary_custody);
    this.verification_suppression = Boolean(init.verification_suppression);
    this.financial_redirection = Boolean(init.financial_redirection);
    this.beneficiary_creation = Boolean(init.beneficiary_creation);
    this.claimed_inbound_money = Boolean(init.claimed_inbound_money);
    this.requested_outbound_money = Boolean(init.requested_outbound_money);
    this.has_deictic_reference = Boolean(init.has_deictic_reference);
    this.semantic_confidence = typeof init.semantic_confidence === 'number' && init.semantic_confidence >= 0 && init.semantic_confidence <= 1 ? init.semantic_confidence : 0.8;
    this.amount_relation = ['same', 'different', 'unknown'].includes(init.amount_relation) ? init.amount_relation : 'unknown';
    
    // Purely local numeric amount for causal relationship resolution in memory.
    // Non-enumerable: NEVER serialized into JSON or fingerprints.
    const rawAmt = typeof init.raw_amount === 'number' && Number.isFinite(init.raw_amount) ? init.raw_amount : null;
    Object.defineProperty(this, 'raw_amount', {
      value: rawAmt,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }

  toJSON() {
    // Scrub raw_amount completely from serialization
    return {
      claim_direction: this.claim_direction,
      requested_action: this.requested_action,
      purpose: this.purpose,
      counterparty_role: this.counterparty_role,
      temporary_custody: this.temporary_custody,
      verification_suppression: this.verification_suppression,
      financial_redirection: this.financial_redirection,
      beneficiary_creation: this.beneficiary_creation,
      claimed_inbound_money: this.claimed_inbound_money,
      requested_outbound_money: this.requested_outbound_money,
      has_deictic_reference: this.has_deictic_reference,
      semantic_confidence: this.semantic_confidence,
      amount_relation: this.amount_relation
    };
  }
}

// Patterns for semantic concept extraction
const REDIRECTION_PATTERNS = [
  /\b(?:move|shift|park|place|route|allocate|relocate)\s+(?:(?:your|the|any|available)\s+)?(?:funds?|balance|liquidity|savings?)\b/iu,
  /\b(?:secure|park|place|move|shift|transfer|route)\s+(?:(?:your|the|any|available)\s+)?(?:funds?|money|balance|amount)\s+(?:temporarily|elsewhere|to\s+(?:the\s+)?(?:safe|holding|reserve|escrow|settlement|destination|different|new|secure|surveillance)\b)/iu,
  /\b(?:safe|reserve|holding|escrow|temporary|surveillance|settlement|destination)\s+(?:account|fund|profile|wallet|node)\b/iu,
  /\b(?:verification|calibration|handshake|settlement|reversible|test)\s+(?:transaction|payment|transfer|deposit|handshake)\b/iu,
  /\b(?:establish\s+(?:the\s+)?destination|allocate\s+\d+%\s+of\s+(?:your\s+)?balance|funds\s+remain\s+legally\s+yours)\b/iu,
  /\b(?:park\s+(?:the\s+)?money|move\s+liquidity)\b/iu,
  /(?:सुरक्षित\s*खाते|फंड\s*मूव|खाता\s*सुरक्षित|पैसे\s*स्थानांतरित\s*करें\s*सुरक्षित)/iu
];

const VERIFICATION_SUPPRESSION_PATTERNS = [
  /\b(?:do\s*not|don't|never|avoid|must\s*not)\s+(?:call|contact|visit|reach\s*out\s*to|inform|tell)\s+(?:the\s+)?(?:bank|branch|support|customer\s*care|helpline|police|family|anyone|friends?)\b/iu,
  /\b(?:calling|contacting|visiting)\s+(?:the\s+)?(?:bank|support)\s+will\s+(?:cancel|invalidate|block|void)\b/iu,
  /\b(?:stay\s+on\s+(?:the|this)\s+call|do\s*not\s+disconnect|don't\s+hang\s*up|keep\s+this\s+(?:confidential|secret|between\s+us))\b/iu,
  /\b(?:do\s*not\s+discuss\s+(?:this\s+)?investigation)\b/iu,
  /(?:बैंक\s*को\s*कॉल\s*मत|किसी\s*को\s*मत\s*बताना|कॉल\s*पर\s*रहें|डिस्कनेक्ट\s*मत\s*करना)/iu
];

const BENEFICIARY_CREATION_PATTERNS = [
  /\b(?:add|create|register|establish)\s+(?:a\s+)?(?:fresh|new)?\s*(?:beneficiary|payee|recipient|settlement\s*profile)\b/iu
];

export function extractFinancialIntentFrame(event, text = '') {
  const t = normalize(text || event.text || '');
  const channel = event.channel || 'message';
  const payment = event.payment;

  let rawAmount = null;
  if (payment && typeof payment.amount === 'number') {
    rawAmount = payment.amount;
  } else {
    rawAmount = extractNumericAmount(t);
  }

  // 1. Detection of verification suppression with counterfactual protection
  let verificationSuppression = false;
  if (VERIFICATION_SUPPRESSION_PATTERNS.some(p => p.test(t))) {
    // Guard against counterfactual legitimate advice: "Call the bank using the number on your card"
    const isAffirmativeAdvice = /\b(?:call|contact|visit)\s+(?:the\s+)?(?:bank|branch|police)\s+(?:using|on|at|immediately)\b/iu.test(t) &&
      !/\b(?:do\s*not|don't|never|avoid|will\s*cancel)\b/iu.test(t);
    if (!isAffirmativeAdvice) {
      verificationSuppression = true;
    }
  }

  // 2. Detection of financial redirection with clause-level advice negation
  const rawTextStr = String(text || event.text || '');
  const clauses = rawTextStr.normalize('NFKC').split(/[.!?;\n,।。\u2028\u2029]+|\bbut\b|\bhowever\b/iu).map(normalize);
  const negationPattern = /\b(?:never|do not|don't|must not|should not|avoid|not to|mat|nahi)\b|मत|नहीं/iu;

  let financialRedirection = false;
  for (const clause of clauses) {
    if (REDIRECTION_PATTERNS.some(p => p.test(clause))) {
      if (!negationPattern.test(clause)) {
        financialRedirection = true;
        break;
      }
    }
  }

  let temporaryCustody = false;
  const custodyRegex = /\b(?:safe\s*account|holding\s*account|reserve\s*account|escrow|funds?\s*remain\s*legally\s*yours|temporary\s*holding|park\s*(?:the\s*)?money)\b/iu;
  for (const clause of clauses) {
    if (custodyRegex.test(clause) && !negationPattern.test(clause)) {
      temporaryCustody = true;
      break;
    }
  }

  const beneficiaryCreation = BENEFICIARY_CREATION_PATTERNS.some(p => p.test(t)) || (payment && payment.newPayee === true);

  // 3. Counterparty Role extraction
  let counterpartyRole = 'unknown';
  if (/\b(?:employer|company|hr|payroll|office|salary|reimbursement\s*approved)\b/iu.test(t)) {
    counterpartyRole = 'employer';
  } else if (/\b(?:roommate|friend|buddy|bro|bhai|hotel\s*share|dinner\s*split|bill\s*split)\b/iu.test(t)) {
    counterpartyRole = 'friend';
  } else if (/\b(?:police|cbi|customs|court|cyber\s*crime|rbi|trai|traffic\s*police)\b/iu.test(t)) {
    counterpartyRole = 'government';
  } else if (/\b(?:bank|sbi|hdfc|icici|axis|pnb|branch|manager)\b/iu.test(t)) {
    counterpartyRole = 'bank';
  } else if (/\b(?:amazon|flipkart|swiggy|zomato|merchant|store|shop)\b/iu.test(t)) {
    counterpartyRole = 'merchant';
  } else if (/\b(?:support|helpline|helpdesk|customer\s*care)\b/iu.test(t)) {
    counterpartyRole = 'support';
  } else if (/\b(?:trading|invest|vip\s*group|mentor|payout|earnings|task\s*review)\b/iu.test(t)) {
    counterpartyRole = 'investment_platform';
  }

  // 4. Purpose extraction
  let purpose = 'unknown';
  if (/\b(?:dinner|hotel\s*share|trip|rent|split|lunch|team\s*lunch|food\s*share)\b/iu.test(t)) {
    purpose = 'personal_payment';
  } else if (/\b(?:refund|cashback|overcharge|reversal)\b/iu.test(t)) {
    purpose = 'refund';
  } else if (/\b(?:reimbursement|salary|expense\s*claim|per\s*diem)\b/iu.test(t)) {
    purpose = 'reimbursement';
  } else if (/\b(?:migration|mirror|wallet\s*balance\s*mirrored|system\s*upgrade)\b/iu.test(t)) {
    purpose = 'migration';
  } else if (/\b(?:kyc|verify|verification|account\s*update|renew)\b/iu.test(t)) {
    purpose = 'verification';
  } else if (/\b(?:settlement|payout|merchant\s*onboarding|task\s*earnings)\b/iu.test(t)) {
    purpose = 'settlement';
  } else if (/\b(?:trading|crypto|stocks?|equity|shares?\s*(?:trading|market|investment)|guaranteed\s*return|double|daily\s*profit)\b/iu.test(t)) {
    purpose = 'investment';
  } else if (/\b(?:withdraw|withdrawal|release\s*earnings|payout\s*locked)\b/iu.test(t)) {
    purpose = 'withdrawal';
  } else if (/\b(?:unlock|clearance\s*fee|liquidity\s*fee|processing\s*fee|advance\s*fee)\b/iu.test(t)) {
    purpose = 'unlock';
  } else if (/\b(?:audit|compliance|investigation|warrant|penalty|fine)\b/iu.test(t)) {
    purpose = 'compliance';
  } else if (/\b(?:order|bill|purchase|restaurant|food)\b/iu.test(t)) {
    purpose = 'purchase';
  }

  // 5. Claim Direction & Inbound/Outbound Money
  let claimDirection = 'unknown';
  let claimedInboundMoney = false;
  let requestedOutboundMoney = false;

  const inboundCues = /\b(?:receive|credited|refund|cashback|payout|winnings?|prize|reimburse|reimbursed|reimbursement|salary|wapas|milenge|milega)\b|रिफंड|क्रेडिट|पैसे\s*मिलेंगे/iu;
  const outboundCues = /\b(?:transfer|send|pay|deposit|move|shift|park|route|forward|remit|bhejo|jama)\b|भुगतान|ट्रांसफर|पैसे\s*भेज/iu;

  if (inboundCues.test(t) && !/\b(?:do\s*not\s*receive|never\s*receive)\b/iu.test(t)) {
    claimedInboundMoney = true;
    claimDirection = 'inbound';
  }

  if (outboundCues.test(t) || financialRedirection || payment || channel === 'payment' || channel === 'qr') {
    requestedOutboundMoney = true;
    if (claimDirection === 'unknown') claimDirection = 'outbound';
  }

  // 6. Requested Action
  let requestedAction = 'none';
  if (channel === 'qr' || /\b(?:scan\s+(?:this\s+)?qr|qr\s*code)\b/iu.test(t)) {
    requestedAction = 'scan_qr';
  } else if (payment || channel === 'payment' || requestedOutboundMoney) {
    requestedAction = 'transfer';
  } else if (beneficiaryCreation) {
    requestedAction = 'add_beneficiary';
  } else if (channel === 'link' || /\b(?:click|open)\s+(?:link|url|website)\b/iu.test(t)) {
    requestedAction = 'open_link';
  } else if (/\.apk\b|\b(?:install|download)\s+(?:our|this|the)?\s*app\b/iu.test(t)) {
    requestedAction = 'install_app';
  } else if (/\b(?:otp|pin|password|cvv)\b/iu.test(t) && /\b(?:share|tell|send|enter|batao|bhejo)\b/iu.test(t)) {
    requestedAction = 'share_credentials';
  } else if (/\b(?:anydesk|teamviewer|screen\s*shar(?:e|ing)|remote\s*access)\b/iu.test(t)) {
    requestedAction = 'enable_remote_access';
  }

  const hasDeicticReference = DEICTIC_REFERENCE_PATTERNS.some(p => p.test(t));

  return new FinancialIntentFrame({
    claim_direction: claimDirection,
    requested_action: requestedAction,
    purpose,
    counterparty_role: counterpartyRole,
    temporary_custody: temporaryCustody,
    verification_suppression: verificationSuppression,
    financial_redirection: financialRedirection,
    beneficiary_creation: beneficiaryCreation,
    claimed_inbound_money: claimedInboundMoney,
    requested_outbound_money: requestedOutboundMoney,
    has_deictic_reference: hasDeicticReference,
    raw_amount: rawAmount,
    semantic_confidence: 0.85
  });
}
