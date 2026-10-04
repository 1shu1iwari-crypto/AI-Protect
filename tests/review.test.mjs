import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ReviewSession,signalText,responsePlan} from '../core/review.mjs';
import {verifyCommunication} from '../core/verification.mjs';
const model=JSON.parse(await readFile(new URL('../core/model.json',import.meta.url),'utf8'));
test('no analysis before user action; signal selection is explicit',()=>{const s=new ReviewSession();assert.throws(()=>s.add({channel:'call',text:'share OTP'}),/Tap/);s.startCall({direction:'incoming'});assert.equal(s.events.length,0);assert.equal(s.user_flagged,true);s.add({channel:'call',text:signalText(['authority','credentials']),userTriggered:true});assert.equal(s.events.length,1);});
test('call message link QR payment share one review and explain escalation',()=>{const s=new ReviewSession();const id=s.id;s.startCall({direction:'outgoing'});for(const e of [{channel:'call',text:'HDFC bank officer. Urgent account blocked.'},{channel:'message',text:'Update your KYC immediately'},{channel:'link',text:'https://hdfc-kyc.example.invalid/verify'},{channel:'qr',text:'upi://pay?pa=test@demo&am=5000'},{channel:'payment',payment:{amount:5000,newPayee:true}}])s.add({...e,userTriggered:true});assert.equal(s.id,id);assert.equal(s.timeline.length,5);assert.equal(s.timeline[2].verification,'mismatch');assert.equal(s.timeline.at(-1).severity,'high');assert(s.timeline.some(e=>e.change.includes('→')));assert(!JSON.stringify(s.snapshot()).includes('test@demo'));assert(!JSON.stringify(s.snapshot()).includes('example.invalid'));});
test('caller-provided contacts never authenticate caller; strict domain boundaries',()=>{for(const url of ['https://hdfc.bank.in.evil.invalid','https://hdfc.bank.in@evil.invalid','http://hdfc.bank.in'])assert.equal(verifyCommunication('HDFC '+url).status,'mismatch');const match=verifyCommunication('HDFC https://www.hdfc.bank.in/help Contact 9876543210');assert.equal(match.status,'verified');assert.equal(match.caller_status,'unverified');assert.equal(match.support_contact,'supplied_unverified');assert.equal(verifyCommunication('HDFC support').status,'unverified');assert.equal(verifyCommunication('hello').status,'unknown');});
test('paid and not-paid paths select the appropriate official routes',()=>{const s=new ReviewSession();assert.equal(s.choosePayment('yes').routes[0].id,'cybercrime');assert.equal(s.payment_status,'sent');assert(responsePlan('yes').steps.some(x=>x.includes('recovery')));assert.equal(s.choosePayment('no').routes[0].id,'chakshu');assert.equal(s.payment_status,'not_sent');assert.throws(()=>responsePlan('maybe'));});
test('normal call and familiar purchase do not interrupt',()=>{const s=new ReviewSession();const a=s.add({channel:'call',text:'Your groceries are ready for pickup.',userTriggered:true});const b=s.add({channel:'payment',payment:{amount:450,newPayee:false},userTriggered:true});assert(!a.showWarning&&!b.showWarning);});
test('report consent is required and never persisted; restoration is redacted',()=>{const s=new ReviewSession();s.add({channel:'message',text:'Share OTP with HDFC at 9876543210',userTriggered:true});assert.throws(()=>s.report(),/Choose/);s.consent=true;assert(s.report().consent);const raw=s.snapshot();assert(!JSON.stringify(raw).includes('9876543210'));raw.timeline[0].reason='untrusted supplied phone';const restored=ReviewSession.restore(raw);assert.equal(restored.id,s.id);assert(!restored.consent);assert(!JSON.stringify(restored.snapshot()).includes('untrusted'));assert.throws(()=>restored.report(),/Choose/);});
test('expiry starts a separate review and clears response and consent',()=>{const s=new ReviewSession();s.add({channel:'message',text:'HDFC hello',userTriggered:true,timestamp:1000});const old=s.id;s.choosePayment('yes');s.consent=true;s.add({channel:'message',text:'hello',userTriggered:true,timestamp:1300000});assert.notEqual(s.id,old);assert.equal(s.timeline.length,1);assert.equal(s.payment_status,'unknown');assert.equal(s.consent,false);});
test('snapshot restore bounds and unsupported signals are rejected',()=>{const s=new ReviewSession();assert.throws(()=>signalText(['injected']));const raw=s.snapshot();raw.started=Date.now()-90000000;assert.throws(()=>ReviewSession.restore(raw));});
test('timeline identifies the new evidence and action behind risk changes',()=>{
 const s=new ReviewSession();const now=Date.now();
 s.add({channel:'call',text:'I am a bank officer.',timestamp:now,userTriggered:true});
 s.add({channel:'message',text:'Your account will be blocked. Stay on the call.',timestamp:now+1000,userTriggered:true});
 const result=s.add({channel:'payment',payment:{amount:6500,newPayee:true},timestamp:now+2000,userTriggered:true});
 assert(result.showWarning);assert(s.timeline[0].new_evidence.includes('authority'));
 assert(s.timeline[1].new_evidence.includes('threat'));assert(s.timeline[1].new_evidence.includes('isolation'));
 assert.equal(s.timeline[2].requested_action,'transfer');assert.match(s.timeline[2].change,/Outgoing transfer request/);
 assert.match(s.timeline[2].change,/risk .* → (high|warning)/);
 assert.equal(s.timeline[2].action_risk,result.actionRisk);assert.equal(s.timeline[2].workflow_confidence,result.workflowConfidence);
});
test('structured reviews preserve only coarse derived evidence across restoration',()=>{
 const s=new ReviewSession();
 s.add({channel:'message',text:'Private reference xyzPrivateSignal. HDFC account blocked. Contact 9876543210 at https://private-kyc.example.invalid/verify then pay.',userTriggered:true});
 s.add({channel:'qr',text:'upi://pay?pa=private-vpa@bank&am=73421&tn=xyzPrivateSignal',userTriggered:true});
 const raw=s.snapshot();
 for(const privateValue of ['xyzPrivateSignal','9876543210','private-kyc.example.invalid','private-vpa@bank','73421','upi://'])assert(!JSON.stringify(raw).includes(privateValue),privateValue);
 assert.equal(raw.events.at(-1).amount_bucket,'50k_plus');assert.equal(raw.events.at(-1).requested_action,'transfer');
 raw.events[0].text='Injected raw content';raw.events[0].claimed_identity='https://injected.invalid';raw.events[0].semantic_confidence='secret exact amount 73421';raw.timeline[0].reason='Injected raw prose';raw.timeline[0].change='Injected raw timeline';
 raw.consent=true;raw.analytics_consent=true;
 const restored=ReviewSession.restore(raw);const redacted=JSON.stringify(restored.snapshot());
 assert(!redacted.includes('Injected'));assert(!redacted.includes('injected.invalid'));assert(!redacted.includes('73421'));
 assert.equal(restored.consent,false);assert.throws(()=>restored.report(),/Choose/);
});
test('legacy snapshots remain restorable and warning suppression survives restore',()=>{
 const s=new ReviewSession();const now=Date.now();
 s.add({channel:'message',text:'Please share your OTP.',timestamp:now,userTriggered:true});
 const raw=s.snapshot();raw.events=raw.events.map(({channel,timestamp,tactics,payment})=>({channel,timestamp,tactics,payment,modelScores:null}));
 const restored=ReviewSession.restore(raw);
 assert.equal(restored.events[0].requested_action,'credentials');
 assert.equal(restored.add({channel:'message',text:'Please share your OTP.',timestamp:now+1000,userTriggered:true}).suppressed,true);
});
test('semantic temporal workflow state and repeat suppression survive redacted restoration',()=>{
 for(const text of ['The clearance procedure needs funds in the holding reserve. The compliance window ends shortly.','Our allocation desk turns each unit into four. This private route is available to selected members.']){
  const s=new ReviewSession();const now=Date.now();
  s.add({channel:'message',text,timestamp:now,userTriggered:true});
  const warned=s.add({channel:'payment',payment:{amount:35000,newPayee:true},timestamp:now+1000,userTriggered:true});
  assert(warned.showWarning);
  const restored=ReviewSession.restore(s.snapshot());const result=restored.assess(restored.events.at(-1));
  for(const key of ['family','severity','stage','evidenceScore','workflowConfidence','actionRisk'])assert.equal(result[key],warned[key],key);
  assert.equal(result.workflow.state,warned.workflow.state);
  const repeated=restored.add({channel:'payment',payment:{amount:35000,newPayee:true},timestamp:now+2000,userTriggered:true});
  assert(repeated.suppressed);assert(!repeated.showWarning);
 }
});
test('legacy-model corroboration survives redacted restore without repeating the warning',()=>{
 const s=new ReviewSession(model);const now=Date.now();
 const warned=s.add({channel:'message',text:'Tell me your OTP',timestamp:now,userTriggered:true});
 assert.equal(warned.severity,'high');assert(warned.showWarning);
 const snapshot=s.snapshot();
 assert.equal(snapshot.events[0].modelScores,null);
 assert.equal(snapshot.events[0].model_corroboration,true);
 const restored=ReviewSession.restore(snapshot,model);
 const assessed=restored.assess(restored.events.at(-1));
 assert.equal(assessed.severity,warned.severity);assert.equal(assessed.actionRisk,warned.actionRisk);
 assert.equal(restored.timeline[0].severity,warned.severity);
 const repeated=restored.add({channel:'message',text:'Tell me your OTP',timestamp:now+1,userTriggered:true});
 assert(repeated.suppressed);assert(!repeated.showWarning);
 assert.equal(repeated.severity,warned.severity);
});
