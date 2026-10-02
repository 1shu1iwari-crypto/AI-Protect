import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Session,extract,inspectLink} from '../core/engine.mjs';
import {challenges} from '../simulator/challenges.mjs';
const model=JSON.parse(await readFile(new URL('../core/model.json',import.meta.url),'utf8'));

test('supported challenge fixtures catch dangerous transitions without benign interruptions',()=>{
 for(const fixture of challenges.filter(s=>s.supported!==false)){
  const s=new Session(model);let warned=false;
  for(const [i,e] of fixture.events.entries())warned=s.add({...e,timestamp:s.started+i*20000}).showWarning||warned;
  assert.equal(warned,fixture.scam,fixture.id);
 }
});
test('mixed and newline instructions keep positive credential requests',()=>{
 assert(extract('Do not tell anyone, send your OTP to me.').tactics.includes('credentials'));
 assert(extract('Never share your PIN\nSend your OTP now.').tactics.includes('credentials'));
 assert(!extract('OTP mat bhejo.').tactics.includes('credentials'));
});
test('an unusual link alone is evidence, never a fraud verdict',()=>{
 assert(inspectLink('https://bank-kyc.xyz/verify').unusualVerification);
 assert(!inspectLink('https://www.example.com/kyc').unusualVerification);
 const r=new Session().add({channel:'link',text:'https://bank-kyc.xyz/verify'});
 assert(!r.showWarning);
});
test('a new workflow can re-warn during the cooldown',()=>{
 const s=new Session();const t=s.started;
 s.add({channel:'message',text:'Guaranteed return',timestamp:t});
 assert(s.add({channel:'payment',payment:{amount:500,newPayee:true},timestamp:t+1}).showWarning);
 s.add({channel:'message',text:'Receive your refund',timestamp:t+2});
 assert(s.add({channel:'qr',text:'upi://pay?pa=fixture@demo&am=500',timestamp:t+3}).showWarning);
});
test('bound event memory, reject malformed payment context, and preserve privacy',()=>{
 const s=new Session();for(let i=0;i<100;i++)s.add({channel:'message',text:'Hello '+i,timestamp:s.started+i});
 assert.equal(s.events.length,64);
 assert.throws(()=>s.add({channel:'payment'}));
 assert.throws(()=>s.add({channel:'payment',payment:{amount:100,newPayee:'false'}}));
 assert(!JSON.stringify(s.fingerprint()).includes('Hello'));
 assert.match(s.id,/^[a-zA-Z0-9-]{32,36}$/);
});
test('challenge text is excluded from model training',async()=>{
 const training=JSON.parse(await readFile(new URL('../ml/training.json',import.meta.url),'utf8'));
 const seeds=new Set(training.map(s=>s.text));
 for(const s of challenges)for(const e of s.events)if(e.text)assert(!seeds.has(e.text),s.id);
});
