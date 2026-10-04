import {LABELS} from './constants.mjs';
const reasons={refund:'A refund claim led to an outgoing UPI payment. This QR sends money; it does not receive money.',authority:'An authority claim and pressure were followed by a money transfer request.',investment:'An explicit or implied return promise was followed by a payment request.',kyc:'Pressure to verify an account led to an unusual link, app installation or secret request. Find your bank’s official app or website independently.',task:'A fee or deposit was requested to release promised earnings or recover funds.',remote:'Remote control was requested after financial or support claims.',credential:'Someone requested a secret OTP, PIN, password or CVV.',pressure:'Pressure and a threat or secrecy request were followed by a payment request.',trust:'Trust or reward claims and coercion were followed by a sensitive action.'};
const signalLabels={trust:'Trust-building claim',reward:'Reward claim',redirection:'Funds redirected',recovery:'Recovery / release payment',coercion:'Conditional clearance / reserve demand'};
export function evidenceLabel(type){return LABELS[type]||signalLabels[type]||'Derived context';}
export function explain(workflow,transition,risk){
 const added=transition.new_evidence.map(evidenceLabel).join(', ');
 const change=[added?`${added} added`:null,transition.changed?`${transition.from} → ${transition.to}`:null].filter(Boolean).join('; ')||'Derived context repeated';
 return {reason:workflow.matched?reasons[workflow.id]:'Not enough evidence to establish a scam workflow. A low score is not a safety guarantee.',riskChange:`${change}; intervention level ${risk.severity}.`};
}
