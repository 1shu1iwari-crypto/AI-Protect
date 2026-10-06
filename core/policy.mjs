const sensitiveTactics=['credentials','remote_access','apk','link_risk'];
export function riskAssessment(events,current,workflow,contradiction=null){
 const all=new Set(events.flatMap(e=>e.tactics)),has=k=>all.has(k),payment=Boolean(current.payment);
 const isExecutingPayment=payment||current.channel==='payment'||current.channel==='qr';
 const isExecutingSensitiveTactic=sensitiveTactics.some(t=>current.tactics.includes(t));
 const currentAction=isExecutingPayment||isExecutingSensitiveTactic;

 const signals=new Set(events.flatMap(e=>e.persuasion_signals||[]));
 const independent=['authority','threat','isolation','investment','refund','fee','credentials','remote_access','apk','verification','link_risk'].filter(has).length+(signals.has('financial_redirection')||signals.has('verification_suppression')?1:0)+(payment?1:0);
 const corroboration=current.model_corroboration===true||current.tactics.some(t=>(current.modelScores?.[t]??0)>=0.75);
 let score=workflow.score;if(score&&corroboration)score+=3;
 if(payment&&score){score+=current.payment.newPayee?5:0;score+=workflow.escalating?6:0;}
 if(contradiction?.hasContradiction){score=Math.max(score,92);}
 score=Math.min(99,score);

 const weights={authority:14,urgency:8,threat:18,isolation:18,credentials:86,remote_access:35,investment:35,refund:35,fee:35,payment:8,apk:22,verification:15,link_risk:22};
 const evidenceStrength=Math.min(99,[...all].reduce((total,t)=>total+(weights[t]||0),0)+(signals.has('coercion')?20:0)+(signals.has('verification_suppression')?25:0)+(signals.has('financial_redirection')?25:0)+(contradiction?.hasContradiction?25:0));

 // 1. Requested Action Risk: what the other party is asking the user to do
 const requestedActions=new Set([
  current.requested_action,
  current.frame?.requested_action,
  ...events.map(e=>e.requested_action),
  ...events.map(e=>e.frame?.requested_action)
 ].filter(Boolean));

 const hasTransferRequest=requestedActions.has('transfer')||requestedActions.has('scan_qr')||has('payment')||has('fee')||Boolean(current.frame?.financial_redirection)||Boolean(current.frame?.requested_outbound_money);
 const hasCredentialRequest=requestedActions.has('share_credentials')||has('credentials');
 const hasRemoteRequest=requestedActions.has('enable_remote_access')||has('remote_access');
 const hasAppRequest=requestedActions.has('install_app')||has('apk');
 const hasBeneficiaryRequest=requestedActions.has('add_beneficiary')||Boolean(current.frame?.beneficiary_creation);
 const hasAnyRequestedAction=hasTransferRequest||hasCredentialRequest||hasRemoteRequest||hasAppRequest||hasBeneficiaryRequest;

 let requestedActionRisk=0;
 if(hasAnyRequestedAction){
  if(hasCredentialRequest)requestedActionRisk=Math.max(requestedActionRisk,86);
  if(hasRemoteRequest||hasAppRequest)requestedActionRisk=Math.max(requestedActionRisk,80);
  if(hasTransferRequest)requestedActionRisk=Math.max(requestedActionRisk,workflow.score>0?workflow.score:(evidenceStrength>=30?75:45));
  if(hasBeneficiaryRequest)requestedActionRisk=Math.max(requestedActionRisk,65);
 }
 requestedActionRisk=Math.min(99,requestedActionRisk);

 // 2. Execution Risk: only rises strongly when user is actually executing now
 let executionRisk=0;
 if(currentAction){
  executionRisk=score>0?score:Math.min(99,evidenceStrength+20);
 }

 // Compatibility actionRisk
 const actionRisk=currentAction?executionRisk:Math.min(25,requestedActionRisk);

 let severity='quiet';
 if((currentAction&&workflow.matched&&score>=75&&(independent>=2||has('credentials')))||(currentAction&&contradiction?.hasContradiction)){
  severity=score>=88?'high':'warning';
 }else if(has('credentials')&&current.tactics.includes('credentials')){
  severity='high';
 }else if(evidenceStrength>=40||workflow.confidence>=40||requestedActionRisk>=60){
  severity='watch';
 }

 const stage=current.channel==='payment'?'Transfer prepared':payment?'Payment intent':currentAction?'Sensitive action':hasAnyRequestedAction?'Action requested':has('urgency')||has('threat')||signals.has('verification_suppression')?'Pressure':all.size?'Pretext':'Normal';
 const ml=Object.values(current.modelScores||{});
 return {severity,stage,evidenceStrength,evidenceScore:evidenceStrength,workflowConfidence:workflow.confidence,actionRisk,
  requestedActionRisk,executionRisk,
  modelSupport:ml.length?Math.max(...ml):null,tactics:[...all],channels:[...new Set(events.map(e=>e.channel))],escalating:workflow.escalating,
  hasContradiction:Boolean(contradiction?.hasContradiction),contradictions:contradiction?.contradictions||[]};
}
export function intervention(risk,current,workflow,previous,lastWarningAt){
 const upgrade=risk.severity==='high'&&previous?.severity==='warning';
 const novelAction=sensitiveTactics.some(t=>current.tactics.includes(t)&&!previous?.tactics.includes(t));
 const increasedStake=Boolean(current.payment)&&workflow.escalating&&!previous?.escalating;
 const newContradiction=Boolean(risk.hasContradiction)&&!previous?.hasContradiction;
 const changedFamily=previous&&previous.family!==workflow.family,cooldown=current.timestamp-lastWarningAt<60000;
 const warned=['high','warning'].includes(risk.severity),suppressed=warned&&cooldown&&!upgrade&&!novelAction&&!increasedStake&&!changedFamily&&!newContradiction;
 return {showWarning:warned&&!suppressed,suppressed};
}
