import model from './semantic-model.mjs';
import {TACTICS} from './constants.mjs';
import {clauses,semanticFeatures,safeSemanticTactic} from './semantic-features.mjs';

export class ConceptClassifier {
 constructor(parameters=model){this.parameters=parameters;}
 classify(text){
  const p=this.parameters,f=semanticFeatures(text),scores={};
  for(const [label,weights] of Object.entries(p.weights)){
   let z=p.intercepts[label];p.features.forEach((name,i)=>{z+=(f[name]||0)*weights[i];});
   scores[label]=1/(1+Math.exp(-z));
  }
  return {scores};
 }
}
export const defaultSemanticClassifier = new ConceptClassifier();
// Adapter: synchronous classify(text) -> {scores: {tactic: 0..1}}. A future
// local model can replace this without changing workflow or intervention code.
export function semanticEvidence(text,classifier=defaultSemanticClassifier){
 const scores={},tactics=new Set(),signals=new Set();
 if(!classifier)return {scores,tactics:[],persuasion_signals:[],confidence:null};
 try{
  for(const clause of clauses(text)){
   const f=semanticFeatures(clause),out=classifier.classify(clause);
   if(!out||typeof out!=='object'||out instanceof Promise)continue;
   for(const [label,value] of Object.entries(out.scores||{})){
    if(!TACTICS.includes(label)||typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)continue;
    scores[label]=Math.max(scores[label]||0,value);
    // Vocabulary gates belong to this shipped concept model. A replacement
    // classifier supplies its own semantics; only safety-negation guards are
    // shared so it is not constrained to this prototype's feature vocabulary.
    const safetyAdvice=/\b(?:never|do not|don't|avoid|must not|should not|not to|not guaranteed|can lose|market risk|mat|nahi)\b|मत|नहीं/iu.test(clause);
    const allowed=classifier instanceof ConceptClassifier?safeSemanticTactic(label,f,clause):(!safetyAdvice||label==='isolation');
    if(value>=model.threshold&&allowed)tactics.add(label);
   }
   if(!f.caution&&!f.risk_notice){
    if(f.trust)signals.add('trust');if(f.reward)signals.add('reward');
    if(f.reserve&&f.routing)signals.add('coercion');
    if(f.release&&f.routing)signals.add('recovery');
    if(/\b(?:safe|different|personal|new|holding) account\b|holding reserve/iu.test(clause))signals.add('redirection');
   }
  }
 }catch{return {scores:{},tactics:[],persuasion_signals:[],confidence:null};}
 return {scores,tactics:[...tactics],persuasion_signals:[...signals],confidence:tactics.size?Math.max(...[...tactics].map(t=>scores[t])):null};
}
