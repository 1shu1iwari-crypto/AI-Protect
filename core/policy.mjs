const sensitiveTactics=['credentials','remote_access','apk','link_risk'];
export function riskAssessment(events,current,workflow){
 const all=new Set(events.flatMap(e=>e.tactics)),has=k=>all.has(k),payment=Boolean(current.payment);
 const currentAction=payment||sensitiveTactics.some(t=>current.tactics.includes(t));
 const independent=['authority','threat','isolation','investment','refund','fee','credentials','remote_access','apk','verification','link_risk'].filter(has).length+(payment?1:0);
 const corroboration=current.model_corroboration===true||current.tactics.some(t=>(current.modelScores?.[t]??0)>=0.75);
 let score=workflow.score;if(score&&corroboration)score+=3;
 if(payment&&score){score+=current.payment.newPayee?5:0;score+=workflow.escalating?6:0;}score=Math.min(99,score);
 // Evidence strength counts distinct derived signal families. Workflow
 // confidence describes ordered path completion; action risk adds stakes.
 // None of these indices is a calibrated probability.
 const weights={authority:14,urgency:8,threat:18,isolation:18,credentials:86,remote_access:35,investment:35,refund:35,fee:35,payment:8,apk:22,verification:15,link_risk:22};
 const signals=new Set(events.flatMap(e=>e.persuasion_signals||[]));
 const evidenceStrength=Math.min(99,[...all].reduce((total,t)=>total+(weights[t]||0),0)+(signals.has('coercion')?20:0));
 const actionRisk=currentAction?score:Math.min(25,score);
 let severity='quiet';
 if(currentAction&&workflow.matched&&score>=75&&(independent>=2||has('credentials')))severity=score>=88?'high':'warning';
 else if(evidenceStrength>=40||workflow.confidence>=40)severity='watch';
 const stage=current.channel==='payment'?'Transfer prepared':payment?'Payment intent':currentAction?'Sensitive action':has('urgency')||has('threat')?'Pressure':all.size?'Pretext':'Normal';
 const ml=Object.values(current.modelScores||{});
 return {severity,stage,evidenceStrength,evidenceScore:evidenceStrength,workflowConfidence:workflow.confidence,actionRisk,
  modelSupport:ml.length?Math.max(...ml):null,tactics:[...all],channels:[...new Set(events.map(e=>e.channel))],escalating:workflow.escalating};
}
export function intervention(risk,current,workflow,previous,lastWarningAt){
 const upgrade=risk.severity==='high'&&previous?.severity==='warning';
 const novelAction=sensitiveTactics.some(t=>current.tactics.includes(t)&&!previous?.tactics.includes(t));
 const increasedStake=Boolean(current.payment)&&workflow.escalating&&!previous?.escalating;
 const changedFamily=previous&&previous.family!==workflow.family,cooldown=current.timestamp-lastWarningAt<60000;
 const warned=['high','warning'].includes(risk.severity),suppressed=warned&&cooldown&&!upgrade&&!novelAction&&!increasedStake&&!changedFamily;
 return {showWarning:warned&&!suppressed,suppressed};
}
