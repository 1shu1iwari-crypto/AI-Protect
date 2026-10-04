import {TACTICS,CHANNELS,LABELS} from './constants.mjs';
import {amountBucket,normalize} from './input.mjs';
import {extractRules} from './rules.mjs';
import {semanticEvidence,defaultSemanticClassifier} from './semantic.mjs';
export const ACTIONS=['none','transfer','credentials','remote_access','install_app','open_link'];
export const IDENTITIES=['none','institution','authority','support','investment_desk'];
export const PERSUASION=['urgency','threat','isolation','trust','reward','redirection','recovery','coercion'];
export const VERIFICATION=['verified','unverified','mismatch','unknown'];
export const BUCKETS=['unknown','under_1k','1k_10k','10k_50k','50k_plus'];
const uniqueEnums=(values,allowed)=>[...new Set(Array.isArray(values)?values.filter(v=>allowed.includes(v)):[])];
const confidence=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?v:null;
export function requestedAction(tactics,payment){
 if(payment)return 'transfer';if(tactics.includes('credentials'))return 'credentials';
 if(tactics.includes('remote_access'))return 'remote_access';if(tactics.includes('apk'))return 'install_app';
 if(tactics.includes('link_risk'))return 'open_link';if(tactics.includes('payment'))return 'transfer';return 'none';
}
// Rebuild from allowlists, including when reading historical tactic-only reviews.
// Never spread source/model/restore objects into retained evidence.
export function sanitiseEvidenceEvent(raw){
 const tactics=uniqueEnums(raw.tactics,TACTICS),p=raw.payment;
 const bucket=BUCKETS.includes(raw.amount_bucket)?raw.amount_bucket:BUCKETS.includes(p?.amountBucket)?p.amountBucket:'unknown';
 const novelty=['new','known','unknown'].includes(raw.beneficiary_novelty)?raw.beneficiary_novelty:p?p.newPayee===true?'new':'known':'unknown';
 const payment=p?{amountBucket:bucket,newPayee:novelty==='new',direction:'outgoing'}:null,modelScores={};
 for(const [label,value] of Object.entries(raw.modelScores||{}))if(TACTICS.includes(label)&&confidence(value)!==null)modelScores[label]=value;
 const identity=IDENTITIES.includes(raw.claimed_identity)?raw.claimed_identity:tactics.includes('authority')?'authority':tactics.includes('investment')?'investment_desk':'none';
 return {channel:CHANNELS.includes(raw.channel)?raw.channel:'message',timestamp:Number.isFinite(raw.timestamp)?raw.timestamp:0,tactics,
  requested_action:ACTIONS.includes(raw.requested_action)?raw.requested_action:requestedAction(tactics,payment),
  claimed_identity:identity,claimed_identity_category:identity,
  persuasion_signals:uniqueEnums(raw.persuasion_signals||tactics.filter(t=>PERSUASION.includes(t)),PERSUASION),
  verification_status:VERIFICATION.includes(raw.verification_status)?raw.verification_status:'unknown',
  amount_bucket:bucket,beneficiary_novelty:novelty,semantic_confidence:confidence(raw.semantic_confidence),
  semantic_tactics:uniqueEnums(raw.semantic_tactics,TACTICS),evidence_sources:uniqueEnums(raw.evidence_sources,['rules','semantic']),
  model_corroboration:raw.model_corroboration===true||tactics.some(t=>(modelScores[t]??0)>=0.75),
  modelScores:Object.keys(modelScores).length?modelScores:null,payment};
}
export function extract(text,model=null,semanticClassifier=defaultSemanticClassifier){
 const rules=extractRules(text,model),semantic=semanticEvidence(text,semanticClassifier);
 const tactics=[...new Set([...rules.tactics,...semantic.tactics])];
 return {...rules,tactics,labels:tactics.map(t=>LABELS[t]),semanticScores:semantic.scores,semantic_tactics:semantic.tactics,
  persuasion_signals:[...new Set([...tactics.filter(t=>PERSUASION.includes(t)),...semantic.persuasion_signals])],
  semantic_confidence:semantic.confidence,evidence_sources:[...(rules.tactics.length?['rules']:[]),...(semantic.tactics.length?['semantic']:[])]};
}
export function evidenceEvent(input,payment,model,classifier){
 const f=extract(input.text||'',model,classifier),t=normalize(input.text);
 if(input.channel==='link'&&/\.apk(?:\?|$)/iu.test(t)&&!f.tactics.includes('apk'))f.tactics.push('apk');
 if(payment&&!f.tactics.includes('payment'))f.tactics.push('payment');
 const identity=f.tactics.includes('authority')?'authority':f.tactics.includes('investment')?'investment_desk':/\bsupport|helpdesk\b|मदद/iu.test(t)?'support':f.tactics.includes('verification')?'institution':'none';
 return sanitiseEvidenceEvent({channel:input.channel,timestamp:input.timestamp,tactics:f.tactics,
  requested_action:requestedAction(f.tactics,payment),claimed_identity:identity,persuasion_signals:f.persuasion_signals,
  verification_status:input.verification_status,semantic_confidence:f.semantic_confidence,semantic_tactics:f.semantic_tactics,
  evidence_sources:f.evidence_sources,modelScores:f.modelScores,
  amount_bucket:payment?amountBucket(payment.amount):'unknown',beneficiary_novelty:payment?(payment.newPayee??true)?'new':'known':'unknown',
  payment:payment?{amountBucket:amountBucket(payment.amount),newPayee:payment.newPayee??true}:null});
}
