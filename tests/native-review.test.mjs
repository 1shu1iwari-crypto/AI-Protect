import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeReviewBridge} from '../web/native-review.mjs';
import {ReviewSession} from '../core/review.mjs';

test('origin-scoped native bridge uses asynchronous request and reply protocol',async()=>{
 const requests=[];const received=[];
 const transport={postMessage(raw){const request=JSON.parse(raw);requests.push(request);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:request.id,result:request.method==='loadReviews'?'{}':true})}));}};
 const native=createNativeReviewBridge(transport,payload=>received.push(payload));
 assert.equal(await native.loadReviews(),'{}');assert.equal(await native.ready(),true);
 assert.equal(await native.saveReviews('{"reviews":[]}'),true);assert.equal(await native.openRoute('chakshu'),true);
 assert.deepEqual(requests.map(r=>r.method),['loadReviews','ready','saveReviews','openRoute']);
 assert(requests.every(r=>Object.keys(r).sort().join(',')==='id,method,payload'));
 assert.deepEqual(requests.slice(0,2).map(r=>r.payload),[null,null]);
 transport.onmessage({data:JSON.stringify({type:'native',payload:{kind:'call',id:'review-test-123'}})});
 await Promise.resolve();assert.equal(received[0].kind,'call');
 await assert.rejects(native.openRoute('https://untrusted.invalid'),/Unsupported/);
 await assert.rejects(native.saveReviews('a'.repeat(512001)),/too large/);
});
test('native call and share arrivals never analyze a review',async()=>{
 const session=new ReviewSession();let share=null;
 const transport={postMessage(){}};
 createNativeReviewBridge(transport,payload=>{if(payload.kind==='call')session.startCall(payload);if(payload.kind==='share')share=payload.text;});
 for(const payload of [{kind:'call',id:'review-native-1234',direction:'incoming'},{kind:'share',text:'Share OTP to transfer money.'}])transport.onmessage({data:JSON.stringify({type:'native',payload})});
 await Promise.resolve();assert.equal(session.events.length,0);assert.equal(session.user_flagged,true);assert(share);
 assert.throws(()=>session.add({channel:'message',text:share}),/Tap/);
 assert.equal(session.add({channel:'message',text:share,userTriggered:true}).showWarning,true);
});
test('native bridge rejects errors and timeouts without leaking supplied data',async()=>{
 const transport={postMessage(raw){const request=JSON.parse(raw);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:request.id,error:'Invalid native request.'})}));}};
 const native=createNativeReviewBridge(transport,()=>{});
 await assert.rejects(native.exportReport('{}'),/Invalid native request/);
 const unavailable=createNativeReviewBridge({postMessage(){}},()=>{},{timeoutMs:5});
 await assert.rejects(unavailable.loadReviews(),/timed out/);
});
