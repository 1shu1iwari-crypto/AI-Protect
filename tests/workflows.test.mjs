import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Session,classify,inspectLink,TACTICS,CHANNELS} from '../core/engine.mjs';
import {ReviewSession} from '../core/review.mjs';
import {verifyCommunication} from '../core/verification.mjs';
import {INSTITUTION_REGISTRY_DATA,createInstitutionRegistry} from '../core/institution-registry.mjs';
import {challenges} from '../simulator/challenges.mjs';
import {adversarial} from '../simulator/adversarial.mjs';

const model=JSON.parse(await readFile(new URL('../core/model.json',import.meta.url),'utf8'));
function run(fixture,session=new Session(model)){
 const start=session.started;
 return fixture.events.map((event,index)=>session.add({...event,timestamp:start+(event.offset_ms??index*20000)}));
}

test('the two original semantic misses warn only after the outgoing payment action',()=>{
 for(const id of ['soft-coercion','implicit-yield']){
  const results=run(challenges.find(fixture=>fixture.id===id));
  assert.equal(results[0].showWarning,false,`${id}: passive context`);
  assert.equal(results.at(-1).showWarning,true,`${id}: sensitive action`);
 }
});

test('semantic evidence improves the original misses beyond deterministic-only detection',()=>{
 for(const id of ['soft-coercion','implicit-yield']){
  const fixture=challenges.find(row=>row.id===id);
  assert(run(fixture,new Session(model)).some(result=>result.showWarning),`${id}: semantic contribution`);
  assert(run(fixture,new Session(null,{semanticClassifier:null})).every(result=>!result.showWarning),`${id}: deterministic-only baseline`);
 }
});

test('adversarial paraphrases, Hindi, Hinglish and evasion preserve scam and benign behavior',()=>{
 for(const fixture of adversarial){
  const results=run(fixture);
  assert.equal(results.some(result=>result.showWarning),fixture.scam,fixture.id);
 }
});

test('delayed multi-step context uses temporal order and expires after inactivity',()=>{
 for(const id of ['delayed-authority','delayed-task-recovery','delayed-kyc-apk']){
  const results=run(adversarial.find(fixture=>fixture.id===id));
  assert.equal(results[0].showWarning,false,id);
  assert(results.at(-1).showWarning,id);
 }
 const session=new Session(model);
 const originalId=session.id;
 const results=run(adversarial.find(fixture=>fixture.id==='benign-expired-pretext'),session);
 assert(results.every(result=>!result.showWarning));
 assert.notEqual(session.id,originalId);
 assert.equal(session.events.length,1);
 const reversed=run(adversarial.find(fixture=>fixture.id==='benign-order-reversed'));
 assert(reversed.every(result=>!result.showWarning));
});

test('semantic detection keeps negated advice and high new-payee payments uninterrupted',()=>{
 for(const id of ['benign-high-new-payee','benign-high-only','benign-negated-yield','benign-negated-reserve','benign-hindi-safety-unicode','benign-hinglish-safety']){
  assert(run(adversarial.find(fixture=>fixture.id===id)).every(result=>!result.showWarning),id);
 }
});

test('advice against withdrawal fees and guaranteed-return schemes cannot taint an ordinary payment',()=>{
 for(const text of ['Never pay a withdrawal fee to unlock earnings.','Never invest in guaranteed return schemes.','Avoid guaranteed return offers; they are scams.']){
  const session=new Session(model);
  assert.equal(session.add({channel:'message',text}).showWarning,false,text);
  assert.equal(session.add({channel:'payment',payment:{amount:500,newPayee:false}}).showWarning,false,text);
 }
});

test('Unicode sentence and line boundaries scope safety advice before a positive OTP request',()=>{
 for(const separator of ['\u3002','\u2028']){
  const session=new Session(model);
  const result=session.add({channel:'message',text:`Never share your OTP${separator}Send your OTP to our agent.`});
  assert.equal(result.showWarning,true,`separator U+${separator.codePointAt(0).toString(16)}`);
  assert(result.event.tactics.includes('credentials'));
 }
});

test('polite Hindi and English secret requests warn while equivalent safety advice stays quiet',()=>{
 for(const text of ['अपना ओटीपी बताइए।','अपना ओटीपी बताएं।','Please give me your OTP.']){
  assert.equal(new Session(model).add({channel:'message',text}).showWarning,true,text);
 }
 for(const text of ['ओटीपी किसी को मत बताइए।','ओटीपी किसी को मत बताएं।','Never give your OTP to anyone.']){
  const session=new Session(model);
  assert.equal(session.add({channel:'message',text}).showWarning,false,text);
  assert.equal(session.add({channel:'payment',payment:{amount:800,newPayee:false}}).showWarning,false,text);
 }
});

test('Unicode-obscured suspicious links retain the existing pressured KYC warning',()=>{
 for(const text of ['h\u200bttps://bank-kyc.xyz/verify','ｈｔｔｐｓ：／／bank-kyc.xyz/verify']){
  assert.equal(inspectLink(text).unusualVerification,true,text);
  const session=new Session(model);
  assert.equal(session.add({channel:'message',text:'Update KYC immediately or your account will be blocked.'}).showWarning,false);
  assert.equal(session.add({channel:'link',text}).showWarning,true,text);
 }
});

test('a new workflow re-warns during cooldown in both refund and investment orders',()=>{
 const contexts={refund:{channel:'message',text:'Receive your refund.'},investment:{channel:'message',text:'Guaranteed return.'}};
 const actions={refund:{channel:'qr',text:'upi://pay?pa=fixture@demo&am=500'},investment:{channel:'payment',payment:{amount:500,newPayee:true}}};
 for(const order of [['refund','investment'],['investment','refund']]){
  const session=new Session(model),start=session.started;
  session.add({...contexts[order[0]],timestamp:start});
  const first=session.add({...actions[order[0]],timestamp:start+1});
  assert(first.showWarning,order[0]);
  session.add({...contexts[order[1]],timestamp:start+2});
  const second=session.add({...actions[order[1]],timestamp:start+3});
  assert.notEqual(second.family,first.family,order.join(' -> '));
  assert.equal(second.suppressed,false,order.join(' -> '));
  assert.equal(second.showWarning,true,order.join(' -> '));
 }
});

test('a current direct credential request takes priority over an older completed payment workflow',()=>{
 const session=new Session(model),start=session.started;
 session.add({channel:'message',text:'Guaranteed return.',timestamp:start});
 assert(session.add({channel:'payment',payment:{amount:500,newPayee:true},timestamp:start+1}).showWarning);
 const result=session.add({channel:'message',text:'Share your OTP with our agent.',timestamp:start+2});
 assert.equal(result.family,'Credential theft');
 assert.equal(result.workflow.id,'credential');
 assert.equal(result.showWarning,true);
});

test('evidence, workflow and action scores have distinct heuristic roles',()=>{
 const session=new Session(model);
 const passive=session.add({channel:'message',text:'Our allocation desk turns each unit into four. This private route is available to selected members.'});
 assert.equal(passive.showWarning,false);
 assert(passive.actionRisk<=25);
 const active=session.add({channel:'payment',payment:{amount:36000,newPayee:true}});
 for(const key of ['evidenceStrength','workflowConfidence','actionRisk']){
  assert(Number.isFinite(active[key]),key);
  assert(active[key]>=0&&active[key]<=99,key);
 }
 assert.equal(active.evidenceScore,active.evidenceStrength);
 assert(active.actionRisk>passive.actionRisk);
 assert.equal(active.showWarning,true);
});

test('structured evidence and persisted reviews retain no raw content or exact financial values',()=>{
 const session=new ReviewSession(model);
 const secretText='PRIVACY_SENTINEL_42 call +919876543219. Our allocation desk turns each unit into four. This private route is available to selected members. https://private.example.invalid/secret';
 session.add({channel:'message',text:secretText,userTriggered:true});
 const result=session.add({channel:'qr',text:'upi://pay?pa=privateperson@demo&am=35217.47&tn=private-note',userTriggered:true});
 const event=result.event;
 for(const key of ['channel','timestamp','tactics','requested_action','claimed_identity','persuasion_signals','verification_status','amount_bucket','beneficiary_novelty','semantic_confidence'])assert(Object.hasOwn(event,key),key);
 const snapshot=session.snapshot();
 const all=JSON.stringify({events:session.events,snapshot,fingerprint:session.fingerprint()});
 for(const secret of ['PRIVACY_SENTINEL_42','919876543219','private.example.invalid','privateperson','private-note','35217.47','upi://'])assert(!all.includes(secret),secret);
 const restored=ReviewSession.restore(snapshot,model);
 assert(!JSON.stringify(restored.snapshot()).includes('privateperson'));
 assert(restored.events.at(-1).amount_bucket==='10k_50k');
 const fingerprint=session.fingerprint();
 assert.deepEqual(Object.keys(fingerprint).sort(),['version','session_id','tactics','channels','sequence','amount_bucket','event_count'].sort());
 assert(fingerprint.tactics.every(tactic=>TACTICS.includes(tactic)));
 assert(fingerprint.sequence.every(tactic=>TACTICS.includes(tactic)));
 assert(fingerprint.channels.every(channel=>CHANNELS.includes(channel)));
});

test('a semantic workflow still observes repeat suppression and inactivity expiry',()=>{
 const session=new Session(model),start=session.started;
 session.add({channel:'message',text:'The clearance procedure needs funds in the holding reserve. The compliance window ends shortly.',timestamp:start});
 assert(session.add({channel:'payment',payment:{amount:43000,newPayee:true},timestamp:start+1}).showWarning);
 const repeated=session.add({channel:'payment',payment:{amount:43000,newPayee:true},timestamp:start+2});
 assert.equal(repeated.showWarning,false);
 assert.equal(repeated.suppressed,true);
 const expired=session.add({channel:'payment',payment:{amount:43000,newPayee:true},timestamp:start+21*60000});
 assert.equal(expired.showWarning,false);
 assert.equal(session.events.length,1);
});

test('semantic classifiers are pluggable while the frozen logistic model remains available',()=>{
 let calls=0;
 const classifier={classify(text){calls++;return {scores:text.toLowerCase().includes('synthetic_semantic_cue')?{investment:0.92,PRIVATE_MODEL_FIELD:0.99}:{},raw:'PRIVATE_MODEL_PROSE'};}};
 for(const text of ['SYNTHETIC_SEMANTIC_CUE','SYNTHETIC_SEMANTIC_CUE college allocation']){
  const session=new Session(null,{semanticClassifier:classifier});
  assert.equal(session.add({channel:'message',text}).showWarning,false);
  assert.equal(session.add({channel:'payment',payment:{amount:1500,newPayee:true}}).showWarning,true);
  assert(!JSON.stringify({events:session.events,fingerprint:session.fingerprint()}).includes('PRIVATE_MODEL'));
 }
 assert(calls>=1);
 assert(classify('Tell me your OTP',model).credentials>classify('Never share your OTP',model).credentials);
});

test('matching institution domain never suppresses behavioral risk or authenticates a caller',()=>{
 const session=new ReviewSession(model);
 const result=session.add({channel:'call',text:'HDFC https://www.hdfc.bank.in/help Share your OTP with this agent.',userTriggered:true});
 assert.equal(result.verification.status,'verified');
 assert.equal(result.verification.caller_status,'unverified');
 assert(result.showWarning);
});

test('institution data can be extended without changing workflow logic or authenticating callers',()=>{
 const record={id:'example',name:'Example Bank',aliases:['example bank'],domains:['example.invalid'],url:'https://www.example.invalid/',source:'https://www.example.invalid/',checked_at:'2026-10-04'};
 const registry=createInstitutionRegistry({...INSTITUTION_REGISTRY_DATA,version:'synthetic-test',institutions:[...INSTITUTION_REGISTRY_DATA.institutions,record]});
 const matched=verifyCommunication('Example Bank https://www.example.invalid/help',null,'unknown',registry);
 assert.equal(matched.claimed_org,'example');
 assert.equal(matched.status,'verified');
 assert.equal(matched.caller_status,'unverified');
 assert.equal(verifyCommunication('Example Bank https://example.invalid.evil.invalid/',null,'unknown',registry).status,'mismatch');
 assert.equal(verifyCommunication('Example Bank https://example.invalid@evil.invalid/',null,'unknown',registry).status,'mismatch');
 assert.throws(()=>createInstitutionRegistry({...INSTITUTION_REGISTRY_DATA,institutions:[record,record]}));
 assert.throws(()=>createInstitutionRegistry({...INSTITUTION_REGISTRY_DATA,institutions:[{...record,url:'http://example.invalid/'}]}));
});

test('review timeline explains the new evidence that changes risk without persisting source text',()=>{
 const session=new ReviewSession(model);
 session.add({channel:'call',text:'I am a customs officer. PRIVATE_CALL_SENTINEL',userTriggered:true});
 session.add({channel:'message',text:'A criminal warrant is pending. Do not tell your family.',userTriggered:true});
 const result=session.add({channel:'payment',payment:{amount:39000,newPayee:true},userTriggered:true});
 assert(result.showWarning);
 assert.match(session.timeline.at(-1).reason,/authority|official/i);
 assert.match(session.timeline.at(-1).reason,/transfer|payment/i);
 assert.match(session.timeline.at(-1).change,/transfer|payment|outgoing|sensitive/i);
 assert(!JSON.stringify(session.snapshot()).includes('PRIVATE_CALL_SENTINEL'));
});

test('new adversarial text is excluded from frozen logistic and semantic training examples',async()=>{
 for(const file of ['../ml/training.json','../ml/semantic-training.json']){
  const seeds=new Set(JSON.parse(await readFile(new URL(file,import.meta.url),'utf8')).map(row=>row.text));
  for(const fixture of adversarial)for(const event of fixture.events)if(event.text)assert(!seeds.has(event.text),`${file}: ${fixture.id}`);
 }
});
