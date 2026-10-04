import {tokens} from './input.mjs';
export function classify(text, model) {
 if (!model) return null;
 const ts=tokens(text), scores={};
 for (const [label, weights] of Object.entries(model.weights)) {let z=model.intercepts[label];for(const t of ts)z+=weights[t]||0;scores[label]=1/(1+Math.exp(-z));}
 return scores;
}
