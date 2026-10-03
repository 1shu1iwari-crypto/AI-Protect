import {Session,TACTICS,CHANNELS,LABELS} from './engine.mjs';
import {verifyCommunication,REGISTRY} from './verification.mjs';
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
function explanations(text,tactics){const result=tactics.map(t=>({type:t,label:LABELS[t]}));const t=String(text);for(const [type,label,re] of [['trust','Trust-building before a request',/\b(?:trust me|here to help|small task|test payment|already earned)\b/i],['reward','Reward or incentive',/\b(?:reward|prize|cashback|bonus|lottery)\b/i],['redirection','Payment redirected to another destination',/\b(?:new account|different account|safe account|personal account)\b/i],['recovery','Recovery payment / sunk-cost pressure',/\b(?:recover.{0,25}(?:money|funds)|recovery fee|already paid|one more payment)\b/i]])if(re.test(t))result.push({type,label});return result;}
const IDS=/^[a-zA-Z0-9-]{8,64}$/;
export class ReviewSession extends Session {
 reset(){super.reset();this.direction='unknown';this.user_flagged=false;this.claimed_org=null;this.timeline=[];this.payment_status='unknown';this.actions_taken=[];this.consent=false;this.workflow_state='Not checked';}
 startCall({id,direction='unknown'}={}){if(id&&!IDS.test(id))throw Error('Invalid review ID');if(id)this.id=id;this.direction=['incoming','outgoing','unknown'].includes(direction)?direction:'unknown';this.user_flagged=true;}
 add(input){if(input.userTriggered!==true)throw Error('Tap Check or Review before analysis.');
  // Existing engine owns expiry, warning decisions and fingerprint vocabulary.
  const expired=this.events.length&&(input.timestamp??Date.now())-this.events.at(-1).timestamp>1200000;
  const verification=verifyCommunication(input.text,expired?null:this.claimed_org,input.sender_context);
  const prior=this.timeline.at(-1)?.severity||'quiet';const result=super.add(input);
  if(verification.claimed_org)this.claimed_org=verification.claimed_org;
  const evidence=explanations(input.text,result.event.tactics);
  this.workflow_state=result.stage;
  this.timeline.push({timestamp:result.event.timestamp,channel:input.channel,evidence_type:input.evidence_type==='screenshot'?'screenshot':input.channel==='call'?'user_call_signals':input.channel,verification:verification.status,evidence:evidence.map(e=>e.type),stage:result.stage,severity:result.severity,reason:result.reason,change:prior===result.severity?'Context added; warning level unchanged':`${prior} → ${result.severity}`});
  if(this.timeline.length>64)this.timeline.shift();
  return {...result,verification,manipulation:evidence};
 }
 choosePayment(paid){const plan=responsePlan(paid);this.payment_status=plan.payment_status;this.recordAction(paid==='yes'?'reported_paid':'reported_not_paid');return plan;}
 recordAction(action){if(!['reported_paid','reported_not_paid','verify_independently','block_ignore','report_route','export','cancel_simulation','continue_simulation'].includes(action))throw Error('Unsupported action');this.actions_taken.push({action,timestamp:Date.now()});this.actions_taken=this.actions_taken.slice(-32);}
 report(){if(!this.consent)throw Error('Choose to share this pattern first.');if(!this.events.length)throw Error('Check at least one event first.');return {consent:true,fingerprint:this.fingerprint()};}
 snapshot(){return {schema:1,session_id:this.id,started:this.started,updated:this.timeline.at(-1)?.timestamp||this.started,direction:this.direction,user_flagged:this.user_flagged,claimed_org:this.claimed_org,events:this.events.map(e=>({channel:e.channel,timestamp:e.timestamp,tactics:e.tactics,payment:e.payment,modelScores:null})),timeline:this.timeline,workflow_state:this.workflow_state,payment_status:this.payment_status,actions_taken:this.actions_taken};}
 static restore(raw,model=null){
  if(!raw||raw.schema!==1||!IDS.test(raw.session_id)||!Number.isFinite(raw.started)||Date.now()-raw.started>86400000||raw.started>Date.now()+60000||!Array.isArray(raw.events)||raw.events.length>64||!Array.isArray(raw.timeline)||raw.timeline.length!==raw.events.length)throw Error('Review expired or invalid.');
  const s=new ReviewSession(model);s.id=raw.session_id;s.started=raw.started;s.direction=['incoming','outgoing','unknown'].includes(raw.direction)?raw.direction:'unknown';s.user_flagged=raw.user_flagged===true;s.claimed_org=REGISTRY.some(o=>o.id===raw.claimed_org)?raw.claimed_org:null;
  const stages=['Not checked','Transfer prepared','Payment intent','Sensitive action','Pressure','Pretext','Normal'];
  for(const e of raw.events){if(!CHANNELS.includes(e.channel)||!Number.isFinite(e.timestamp)||e.timestamp<(s.events.at(-1)?.timestamp||0)||!Array.isArray(e.tactics)||e.tactics.some(t=>!TACTICS.includes(t)))throw Error('Invalid derived event');const p=e.payment;s.events.push({channel:e.channel,timestamp:e.timestamp,tactics:[...new Set(e.tactics)],modelScores:null,payment:p?{amountBucket:['unknown','under_1k','1k_10k','10k_50k','50k_plus'].includes(p.amountBucket)?p.amountBucket:'unknown',newPayee:p.newPayee===true,direction:'outgoing'}:null});}
  // Regenerate explanations from enum-only data; never trust persisted prose.
  const all=s.events;s.events=[];
  for(const e of all){s.events.push(e);const r=s.assess(e);const t=raw.timeline[s.timeline.length];s.timeline.push({timestamp:e.timestamp,channel:e.channel,evidence_type:t?.evidence_type==='screenshot'?'screenshot':e.channel,verification:['verified','unverified','mismatch','unknown'].includes(t?.verification)?t.verification:'unknown',evidence:Array.isArray(t?.evidence)?t.evidence.filter(k=>[...TACTICS,'trust','reward','redirection','recovery'].includes(k)):e.tactics,stage:r.stage,severity:r.severity,reason:r.reason,change:'Restored local review'});}
  s.workflow_state=stages.includes(raw.workflow_state)?raw.workflow_state:'Not checked';s.payment_status=['sent','not_sent','unknown'].includes(raw.payment_status)?raw.payment_status:'unknown';
  for(const a of (Array.isArray(raw.actions_taken)?raw.actions_taken:[]).slice(-32)){try{s.recordAction(a.action);}catch{}}
  // Consent is intentionally never restored.
  return s;
 }
}
