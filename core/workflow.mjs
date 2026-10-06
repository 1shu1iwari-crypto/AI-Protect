// Ordered derived events are the unit of reasoning, including transitions
// within one event. The bounded 64-event scan requires no source content.
const tactic=(...keys)=>e=>keys.some(k=>e.tactics.includes(k));
const persuasion=(...keys)=>e=>keys.some(k=>e.persuasion_signals?.includes(k));
const either=(a,b)=>e=>a(e)||b(e);
const payment=tactic('payment');
const sensitive=e=>Boolean(e.payment)||['credentials','remote_access','install_app','open_link'].includes(e.requested_action);
const paths=[
 {id:'refund',family:'Refund / QR reversal',stages:[tactic('refund'),e=>Boolean(e.payment)],names:['Refund pretext','Outgoing payment'],score:92},
 {id:'authority',family:'Authority / digital arrest',stages:[tactic('authority'),either(tactic('threat','isolation'),persuasion('coercion')),payment],names:['Authority claim','Threat or isolation','Transfer request'],score:89},
 {id:'investment',family:'Investment escalation',stages:[tactic('investment'),payment],names:['Promised yield','Initial payment'],score:75},
 {id:'kyc',family:'KYC / verification lure',stages:[tactic('verification'),tactic('threat','urgency'),tactic('link_risk','apk','credentials')],names:['Verification pretext','Verification pressure','Sensitive request'],score:86},
 {id:'task',family:'Task / advance fee',stages:[persuasion('reward'),tactic('fee'),payment],names:['Task or reward pretext','Deposit / release fee','Withdrawal / recovery payment'],score:80},
 {id:'task',family:'Task / advance fee',stages:[tactic('fee'),payment],names:['Deposit or release fee','Withdrawal / recovery payment'],score:80},
 {id:'remote',family:'Remote access support',stages:[either(tactic('authority','refund','payment'),e=>e.claimed_identity==='support'||persuasion('trust')(e)),tactic('remote_access')],names:['Support pretext','Remote access request'],score:86},
 {id:'credential',family:'Credential theft',stages:[tactic('credentials')],names:['Secret credential request'],score:86},
 {id:'pressure',family:'Pressure to transfer',stages:[tactic('urgency'),either(tactic('threat','isolation'),persuasion('coercion')),payment],names:['Urgency','Threat or coercion','Transfer request'],score:78},
 {id:'trust',family:'Coercive sensitive request',stages:[either(persuasion('trust','reward'),e=>e.claimed_identity!=='none'),either(tactic('threat','isolation'),persuasion('coercion')),sensitive],names:['Trust or reward pretext','Coercion','Sensitive action'],score:82},
 {id:'redirection',family:'Financial redirection',stages:[persuasion('financial_redirection','redirection'),e=>Boolean(e.payment)||e.channel==='payment'||e.channel==='qr'],names:['Redirection pretext','Outgoing transfer'],score:84}
];
function follow(events,path){
 // Find the most recent ordered completion, rather than keeping the first
 // completed workflow forever. Equal-time stages within one event are valid.
 const recent=[];let cursor=events.length-1;
 for(let stage=path.stages.length-1;stage>=0;stage--){
  while(cursor>=0&&!path.stages[stage](events[cursor]))cursor--;
  if(cursor<0)break;recent.unshift(cursor);
 }
 if(recent.length===path.stages.length)return {path,next:path.stages.length,indices:recent,complete:true};
 let next=0;const indices=[];
 for(const [i,e] of events.entries())while(next<path.stages.length&&path.stages[next](e)){indices.push(i);next++;}
 return {path,next,indices,complete:next===path.stages.length};
}
export function workflowState(events,current){
 const states=paths.map(p=>follow(events,p));
 const match=states.filter(s=>s.complete&&(s.path.id!=='refund'||current.payment))
  .sort((a,b)=>b.indices.at(-1)-a.indices.at(-1)||b.indices[0]-a.indices[0])[0];
 const partial=states.filter(s=>s.next).sort((a,b)=>(b.next/b.path.stages.length)-(a.next/a.path.stages.length))[0];
 const chosen=match||partial;
 const payments=events.filter(e=>e.payment&&e.payment.amountBucket!=='unknown'),buckets=['under_1k','1k_10k','10k_50k','50k_plus'];
 const escalating=payments.length>1&&buckets.indexOf(payments.at(-1).payment.amountBucket)-buckets.indexOf(payments[0].payment.amountBucket)>=2;
 if(!chosen)return {id:'none',family:'Unclassified workflow',state:'Normal',matched:false,confidence:0,score:0,escalating,indices:[]};
 const {path,next,indices}=chosen;let state=path.names[next-1];
 if(match&&path.id==='investment'&&escalating)state='Payment escalation';
 if(match&&path.id==='remote'&&current.payment)state='Financial action after remote access';
 let score=match?path.score:0;
 if(match&&path.id==='investment'&&events.some(e=>e.tactics.includes('apk')))score=88;
 return {id:path.id,family:match?path.family:'Unclassified workflow',state,matched:Boolean(match),confidence:match?score:Math.round(next/path.stages.length*60),score,escalating,indices};
}
export function workflowTransition(events,current,workflow){
 const previous=events.length>1?workflowState(events.slice(0,-1),events.at(-2)):null;
 const seen=new Set(events.slice(0,-1).flatMap(e=>[...e.tactics,...(e.persuasion_signals||[])]));
 const newEvidence=[...new Set([...current.tactics,...(current.persuasion_signals||[])])].filter(t=>!seen.has(t));
 return {workflow:workflow.id,from:previous?.state||'Normal',to:workflow.state,new_evidence:newEvidence,changed:previous?.state!==workflow.state};
}
