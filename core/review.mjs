import {Session,TACTICS,CHANNELS,LABELS} from './engine.mjs';
import {sanitiseEvidenceEvent} from './evidence.mjs';
import {verifyCommunication,REGISTRY} from './verification.mjs';
import {fuseMultimodalEvidence} from './evidence-fusion.mjs';
export const QUICK_SIGNALS = [
 ['authority','Claims bank / institution','A bank officer contacted me.'],
 ['payment','Asks for money','They ask me to send money.'],
 ['credentials','Asks for OTP / PIN','They ask me to share OTP or PIN.'],
 ['urgency','Threat / urgency','Urgent: my account will be blocked.'],
 ['remote_access','Install / remote access','They ask me to install this app for remote access.'],
 ['link','Sent QR / link','They sent a QR or link.'],
 ['other','Something else feels wrong','Something feels wrong.']
];
export function signalText(signals){if(!Array.isArray(signals)||signals.some(s=>!QUICK_SIGNALS.some(q=>q[0]===s)))throw Error('Choose supported review signals.');return QUICK_SIGNALS.filter(q=>signals.includes(q[0])).map(q=>q[2]).join(' ');}
export function responsePlan(paid){if(!['yes','no'].includes(paid))throw Error('Choose whether money was sent.');return {payment_status:paid==='yes'?'sent':'not_sent',title:paid==='yes'?'Act now to limit further loss':'Keep the request paused',steps:paid==='yes'?['Contact your bank or payment provider using its app or the number on your bank card. Ask about securing the account and disputing the transaction.','Preserve the original transaction reference, receipt and messages in a place you control. This redacted summary does not replace original evidence.','Call 1930 promptly and report financial cybercrime through the National Cyber Crime Reporting Portal.','Do not pay a recovery agent, release fee or further deposit to recover lost money.']:['End the conversation. Open the institution’s app yourself or use the number printed on your bank card.','Ignore the request or block the sender in your phone or messaging app after preserving needed evidence.','Report suspicious calls, SMS or WhatsApp through Chakshu on Sanchar Saathi.'],routes:paid==='yes'?[{id:'cybercrime',label:'Financial cybercrime portal',url:'https://cybercrime.gov.in/'},{id:'helpline',label:'Dial 1930',url:'tel:1930'}]:[{id:'chakshu',label:'Sanchar Saathi / Chakshu',url:'https://www.sancharsaathi.gov.in/'}]};}
const EXPLANATION_LABELS={...LABELS,trust:'Trust-building before a request',reward:'Reward or incentive',redirection:'Payment redirected to another destination',recovery:'Recovery payment / sunk-cost pressure',coercion:'Indirect pressure to comply'};
export const REVIEW_LABELS=Object.freeze(EXPLANATION_LABELS);
const ACTION_LABELS={transfer:'Outgoing transfer request',credentials:'Secret credential request',remote_access:'Remote access request',install_app:'App installation request',open_link:'Link opening request'};
const VERIFICATION=['verified','unverified','mismatch','unknown'];
function explanations(event){return [...new Set([...event.tactics,...(event.persuasion_signals||[])])].filter(type=>EXPLANATION_LABELS[type]).map(type=>({type,label:EXPLANATION_LABELS[type]}));}
function timelineEntry(event,result,previous,metadata={}){
 const evidence=explanations(event).map(e=>e.type);
 const seen=new Set((metadata.history||[]).flatMap(e=>e.evidence));
 const added=evidence.filter(type=>!seen.has(type));
 const changes=added.map(type=>EXPLANATION_LABELS[type]+' added');
 const action=ACTION_LABELS[event.requested_action];
 if(action&&(event.requested_action!==previous?.requested_action||result.severity!==previous?.severity))changes.push(action);
 const transition=result.transition;
 if(transition?.from&&transition?.to&&transition.from!==transition.to)changes.push(`Workflow ${transition.from} → ${transition.to}`);
 if(result.escalating&&!previous?.escalating)changes.push('Payment increased across coarse amount buckets');
 const prior=previous?.severity||'quiet';
 changes.push(prior===result.severity?'warning level unchanged':`risk ${prior} → ${result.severity}`);
 return {timestamp:event.timestamp,channel:event.channel,evidence_type:metadata.evidence_type==='screenshot'?'screenshot':event.channel==='call'?(['live_call_audio','recorded_call_audio','uploaded_call_audio'].includes(metadata.evidence_type)?metadata.evidence_type:'user_call_signals'):event.channel,verification:event.verification_status,evidence,new_evidence:added,requested_action:event.requested_action,stage:result.stage,severity:result.severity,evidence_strength:result.evidenceStrength??result.evidenceScore,workflow_confidence:result.workflowConfidence??0,action_risk:result.actionRisk,escalating:Boolean(result.escalating),reason:result.reason,change:changes.join(' → ')};
}
const IDS=/^[a-zA-Z0-9-]{8,64}$/;
export class ReviewSession extends Session {
 reset(){super.reset();this.direction='unknown';this.user_flagged=false;this.claimed_org=null;this.timeline=[];this.payment_status='unknown';this.actions_taken=[];this.consent=false;this.workflow_state='Not checked';}
 startCall({id,direction='unknown'}={}){if(id&&(typeof id!=='string'||!IDS.test(id)))throw Error('Invalid review ID');if(id)this.id=id;this.direction=['incoming','outgoing','unknown'].includes(direction)?direction:'unknown';this.user_flagged=true;}
 add(input){if(input.userTriggered!==true)throw Error('Tap Check or Review before analysis.');
  // Existing engine owns expiry, warning decisions and fingerprint vocabulary.
  const expired=this.events.length&&(input.timestamp??Date.now())-this.events.at(-1).timestamp>1200000;
  const verification=verifyCommunication(input.text,expired?null:this.claimed_org,input.sender_context,undefined,{mediaAuthenticity:input.acousticEvidence,userConfirmedIdentity:input.userConfirmedIdentity});
  const result=super.add({...input,verification_status:verification.status});
  if(verification.claimed_org)this.claimed_org=verification.claimed_org;
  const evidence=explanations(result.event);
  this.workflow_state=result.stage;
  this.timeline.push(timelineEntry(result.event,result,this.timeline.at(-1),{evidence_type:input.evidence_type,history:this.timeline}));
  if(this.timeline.length>64)this.timeline.shift();
  const fused=fuseMultimodalEvidence({session:this,riskAssessment:result,verification,acousticEvidence:input.acousticEvidence,currentEvent:result.event});
  return {...result,verification,manipulation:evidence,fused};
 }
 choosePayment(paid){const plan=responsePlan(paid);this.payment_status=plan.payment_status;this.recordAction(paid==='yes'?'reported_paid':'reported_not_paid');return plan;}
 recordAction(action){if(!['reported_paid','reported_not_paid','verify_independently','block_ignore','report_route','export','cancel_simulation','continue_simulation'].includes(action))throw Error('Unsupported action');this.actions_taken.push({action,timestamp:Date.now()});this.actions_taken=this.actions_taken.slice(-32);}
 report(){if(!this.consent)throw Error('Choose to share this pattern first.');if(!this.events.length)throw Error('Check at least one event first.');return {consent:true,fingerprint:this.fingerprint()};}
 snapshot(){return {schema:1,session_id:this.id,started:this.started,updated:this.timeline.at(-1)?.timestamp||this.started,direction:this.direction,user_flagged:this.user_flagged,claimed_org:this.claimed_org,events:this.events.map(e=>({...sanitiseEvidenceEvent(e),modelScores:null})),timeline:this.timeline.map(e=>({timestamp:e.timestamp,channel:e.channel,evidence_type:e.evidence_type,verification:e.verification,evidence:[...e.evidence],new_evidence:[...e.new_evidence],requested_action:e.requested_action,stage:e.stage,severity:e.severity,evidence_strength:e.evidence_strength,workflow_confidence:e.workflow_confidence,action_risk:e.action_risk,escalating:e.escalating,reason:e.reason,change:e.change})),workflow_state:this.workflow_state,payment_status:this.payment_status,actions_taken:this.actions_taken.map(a=>({action:a.action,timestamp:a.timestamp}))};}
 static restore(raw,model=null){
  if(!raw||raw.schema!==1||typeof raw.session_id!=='string'||!IDS.test(raw.session_id)||!Number.isFinite(raw.started)||Date.now()-raw.started>86400000||raw.started>Date.now()+60000||!Array.isArray(raw.events)||raw.events.length>64||!Array.isArray(raw.timeline)||raw.timeline.length!==raw.events.length)throw Error('Review expired or invalid.');
  const s=new ReviewSession(model);s.id=raw.session_id;s.started=raw.started;s.direction=['incoming','outgoing','unknown'].includes(raw.direction)?raw.direction:'unknown';s.user_flagged=raw.user_flagged===true;s.claimed_org=REGISTRY.some(o=>o.id===raw.claimed_org)?raw.claimed_org:null;
  for(const [index,e] of raw.events.entries()){if(!e||!CHANNELS.includes(e.channel)||!Number.isFinite(e.timestamp)||e.timestamp<(s.events.at(-1)?.timestamp||0)||!Array.isArray(e.tactics)||e.tactics.some(t=>!TACTICS.includes(t)))throw Error('Invalid derived event');const t=raw.timeline[index];s.events.push({...sanitiseEvidenceEvent({...e,verification_status:VERIFICATION.includes(e.verification_status)?e.verification_status:VERIFICATION.includes(t?.verification)?t.verification:'unknown',persuasion_signals:e.persuasion_signals??(Array.isArray(t?.evidence)?t.evidence.filter(type=>['urgency','threat','isolation','trust','reward','redirection','recovery','coercion'].includes(type)):undefined)}),modelScores:null});}
  // Regenerate explanations from enum-only data; never trust persisted prose.
  const all=s.events;s.events=[];
  for(const e of all){s.events.push(e);const r=s.assess(e);const t=raw.timeline[s.timeline.length];s.timeline.push(timelineEntry(e,r,s.timeline.at(-1),{evidence_type:t?.evidence_type,history:s.timeline}));}
  s.workflow_state=s.timeline.at(-1)?.stage||'Not checked';s.payment_status=['sent','not_sent','unknown'].includes(raw.payment_status)?raw.payment_status:'unknown';
  for(const a of (Array.isArray(raw.actions_taken)?raw.actions_taken:[]).slice(-32)){try{s.recordAction(a.action);}catch{}}
  // Consent is intentionally never restored.
  return s;
 }
}
