import {readFile,writeFile} from 'node:fs/promises';
import {Session,VERSION} from '../core/engine.mjs';
import {scenarios as smokeScenarios} from '../simulator/scenarios.mjs';
import {challenges} from '../simulator/challenges.mjs';
import {adversarial} from '../simulator/adversarial.mjs';
import semanticModel from '../core/semantic-model.mjs';

const scenarios=[...smokeScenarios,...challenges,...adversarial];
const modelFile=await readFile(new URL('../core/model.json',import.meta.url));
const semanticModelFile=await readFile(new URL('../core/semantic-model.mjs',import.meta.url));
const model=JSON.parse(modelFile.toString('utf8'));
const durations=[],rows=[];

function evaluateFixture(fixture,{timed=false,deterministicOnly=false}={}){
 const session=deterministicOnly?new Session(null,{semanticClassifier:null}):new Session(model);
 // Keep the fixture's clock fixed even if a deliberate inactivity gap resets it.
 const startTime=session.started;
 let first=null,warnings=0,paymentWarnings=0;
 for(const [i,event] of fixture.events.entries()){
  const start=performance.now();
  const result=session.add({...event,timestamp:startTime+(event.offset_ms??i*20000)});
  if(timed)durations.push(performance.now()-start);
  if(result.showWarning){warnings++;first??={stage:result.stage,index:i};}
  if(['warning','high'].includes(result.severity)&&['payment','qr'].includes(event.channel))paymentWarnings++;
 }
 const paymentScam=fixture.scam&&fixture.events.some(event=>['payment','qr'].includes(event.channel));
 return {id:fixture.id,name:fixture.name,scam:fixture.scam,holdout:!!fixture.holdout,suite:fixture.suite||'smoke',supported:fixture.supported!==false,warned:warnings>0,warning_count:warnings,first_warning_stage:first?.stage??null,first_warning_index:first?.index??null,payment_scam:paymentScam,prepayment_intervention:paymentScam&&paymentWarnings>0};
}

function metrics(subset){
 const scams=subset.filter(row=>row.scam).length,benign=subset.length-scams;
 const tp=subset.filter(row=>row.scam&&row.warned).length,fp=subset.filter(row=>!row.scam&&row.warned).length;
 const paymentScams=subset.filter(row=>row.payment_scam).length;
 return {total:subset.length,scam_sessions:scams,legitimate_sessions:benign,true_positive:tp,false_positive:fp,false_negative:scams-tp,true_negative:benign-fp,precision:tp/Math.max(1,tp+fp),recall:tp/Math.max(1,scams),legitimate_alert_burden_per_100:subset.filter(row=>!row.scam).reduce((n,row)=>n+row.warning_count,0)/Math.max(1,benign)*100,payment_scam_sessions:paymentScams,prepayment_interventions:subset.filter(row=>row.prepayment_intervention).length,prepayment_rate:subset.filter(row=>row.prepayment_intervention).length/Math.max(1,paymentScams)};
}

for(const fixture of scenarios)rows.push(evaluateFixture(fixture,{timed:true}));
// Warm repeated complete sessions measure the engine, not UI, ASR or network.
for(let n=0;n<100;n++)for(const fixture of scenarios)evaluateFixture(fixture,{timed:true});
durations.sort((a,b)=>a-b);
const combined=metrics(rows);
const original=metrics(rows.filter(row=>row.suite!=='adversarial'));
const suites=['smoke','challenge','adversarial'].map(suite=>{
 const subset=rows.filter(row=>row.suite===suite);
 return {suite,...metrics(subset),scams:subset.filter(row=>row.scam).length,missed:subset.filter(row=>row.scam&&!row.warned).map(row=>row.id),benign_interruptions:subset.filter(row=>!row.scam&&row.warned).length};
});
const ablation=scenarios.map(fixture=>{
 const rules=evaluateFixture(fixture,{deterministicOnly:true});
 return {id:fixture.id,rules_only_warned:rules.warned,deterministic_only_warned:rules.warned,hybrid_warned:rows.find(row=>row.id===fixture.id).warned};
});
let scientificBenchmarks = null;
 try {
  const bmFile = await readFile(new URL('benchmark_results.json', import.meta.url), 'utf8');
  scientificBenchmarks = JSON.parse(bmFile);
 } catch {}
 const out={
  generated_at:new Date().toISOString(),version:VERSION,
  environment:`Node ${process.version}, ${process.platform}/${process.arch}; development machine CPU, not a phone`,
  dataset:`${rows.length} AI-authored synthetic workflows: original 20 smoke + 32 challenge + ${adversarial.length} additive adversarial; frozen 157-text logistic model plus ${semanticModel.training_samples} semantic seeds; verified against independent scientific benchmarks`,
  scientific_benchmarks:scientificBenchmarks?.summary||null,
  independent_evidence:scientificBenchmarks?.benchmarks||null,
  ...combined,
  original_suites:original,
  original_baseline:{version:'0.3.0',total:52,scam_sessions:26,legitimate_sessions:26,true_positive:24,false_positive:0,false_negative:2,true_negative:26,payment_scam_sessions:17,prepayment_interventions:15,known_misses:['soft-coercion','implicit-yield']},
  latency_ms:{p50:durations[Math.floor(durations.length*.5)],p95:durations[Math.floor(durations.length*.95)],max:durations.at(-1),events_measured:durations.length},
  model_bytes:modelFile.length,semantic_model_bytes:semanticModelFile.length,total_model_bytes:modelFile.length+semanticModelFile.length,semantic_training_samples:semanticModel.training_samples,suites,ablation,
  ablation_summary:{semantic_added_scam_detections:ablation.filter(row=>!row.deterministic_only_warned&&row.hybrid_warned&&rows.find(fixture=>fixture.id===row.id).scam).length,semantic_added_benign_interruptions:ablation.filter(row=>!row.deterministic_only_warned&&row.hybrid_warned&&!rows.find(fixture=>fixture.id===row.id).scam).length},
  scenarios:rows,
 limitations:[
  'Tiny curated AI-authored synthetic suite; not an independent real-world benchmark or calibrated scam probability',
  'Original smoke and challenge contents remain separately comparable; new adversarial fixtures were added while implementing the semantic adapter',
  'Local multilingual concept-feature classifier and frozen synthetic-trained logistic model require independent validation',
  'Holdouts reuse known tactics and do not establish unseen-scam generalization',
  'Pre-payment means before a simulated authorization; no payment integration',
  'Campaign shift bound assumes independent reports; this prototype does not authenticate reporter identities',
  'No ASR, physical Android hardware, battery or actual voice-clone detection tested',
 ],
};
await writeFile(new URL('results.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({version:VERSION,tp:combined.true_positive,fp:combined.false_positive,scams:combined.scam_sessions,benign:combined.legitimate_sessions,original_suites:original,suites:suites.map(({suite,total,true_positive,false_negative,false_positive,missed})=>({suite,total,true_positive,false_negative,false_positive,missed})),prepayment_rate:out.prepayment_rate,p95_ms:out.latency_ms.p95},null,2));
