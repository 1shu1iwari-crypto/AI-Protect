// Compatibility facade for the web, Android, simulator and historical imports.
export {VERSION} from './version.mjs';
export {TACTICS,CHANNELS,LABELS} from './constants.mjs';
export {RULES} from './rules.mjs';
export {normalize,tokens,inspectLink,parseUPI,amountBucket,randomId} from './input.mjs';
export {classify} from './legacy-model.mjs';
export {extract} from './evidence.mjs';
import {CHANNELS,LABELS} from './constants.mjs';
import {parseUPI,randomId} from './input.mjs';
import {evidenceEvent} from './evidence.mjs';
import {defaultSemanticClassifier} from './semantic.mjs';
import {workflowState,workflowTransition} from './workflow.mjs';
import {riskAssessment,intervention} from './policy.mjs';
import {explain} from './explanations.mjs';
import {fingerprint} from './fingerprint.mjs';

export class Session {
 constructor(model=null,options={}){this.model=model;this.semanticClassifier=Object.hasOwn(options,'semanticClassifier')?options.semanticClassifier:defaultSemanticClassifier;this.reset();}
 reset(){this.id=randomId();this.events=[];this.lastAlert=null;this.lastWarningAt=-Infinity;this.started=Date.now();}
 add(input){
  if(!CHANNELS.includes(input.channel))throw Error('Unsupported channel.');
  const text=String(input.text||'');if(text.length>10000)throw Error('Keep one event under 10,000 characters.');
  const now=input.timestamp??Date.now();if(!Number.isFinite(now)||now<(this.events.at(-1)?.timestamp??0))throw Error('Events must arrive in timestamp order.');
  const payment=input.channel==='qr'?parseUPI(text):input.payment;
  if(input.channel==='payment'&&!payment)throw Error('A simulated payment amount is required.');
  if(payment&&(!Number.isFinite(payment.amount)&&payment.amount!==null||payment.amount!==null&&(payment.amount<=0||payment.amount>10000000)))throw Error('Invalid payment amount.');
  if(payment&&payment.newPayee!==undefined&&typeof payment.newPayee!=='boolean')throw Error('Beneficiary context must be true or false.');
  // Invalid input cannot erase previously collected risk context.
  if(this.events.length&&now-this.events.at(-1).timestamp>20*60*1000)this.reset();
  const event=evidenceEvent({...input,text,timestamp:now},payment,this.model,this.semanticClassifier);
  this.events.push(event);if(this.events.length>64)this.events.shift();
  return this.assess(event);
 }
 assess(current){
  const workflow=workflowState(this.events,current),transition=workflowTransition(this.events,current,workflow);
  const risk=riskAssessment(this.events,current,workflow),decision=intervention(risk,current,workflow,this.lastAlert,this.lastWarningAt);
  if(decision.showWarning){this.lastWarningAt=current.timestamp;this.lastAlert={signature:workflow.family+':'+risk.severity,family:workflow.family,severity:risk.severity,tactics:risk.tactics,escalating:workflow.escalating};}
  return {...risk,...decision,family:workflow.family,workflow,transition,...explain(workflow,transition,risk),labels:risk.tactics.map(k=>LABELS[k]),event:current};
 }
 fingerprint(){return fingerprint(this);}
}
