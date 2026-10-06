// 64-dimensional Temporal Scam Trajectory Vectorizer
// Encodes multi-channel, multi-step session journeys into a compact, privacy-safe
// mathematical embedding z_session in R^64.
// Zero raw text, zero phone numbers, zero accounts, zero audio.

import { TACTICS, CHANNELS } from './constants.mjs';
import { PERSUASION, BUCKETS } from './evidence.mjs';
import { CONTRADICTION_TYPES } from './intent-contradiction.mjs';

export const TRAJECTORY_DIM = 64;

const PERSUASION_KEYS = ['coercion', 'redirection', 'recovery', 'trust', 'reward', 'urgency', 'threat', 'isolation'];
const CONTRADICTION_KEYS = [
 CONTRADICTION_TYPES.CREDIT_VS_DEBIT,
 CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH,
 CONTRADICTION_TYPES.INVESTMENT_ADVANCE_FEE,
 CONTRADICTION_TYPES.KYC_SIDELOAD_MISMATCH
];

/**
 * Encodes a Session object into a normalized Float32Array of length 64.
 */
export function encodeTrajectory(session) {
 const vec = new Float32Array(TRAJECTORY_DIM);
 const events = session.events || [];
 if (!events.length) return Array.from(vec);

 const nEvents = events.length;
 const totalDurationMs = Math.max(0, (events.at(-1)?.timestamp || 0) - (events[0]?.timestamp || 0));

 // 1. Tactics presence and frequency (dims 0 - 12)
 TACTICS.forEach((tactic, idx) => {
  const count = events.filter(e => e.tactics?.includes(tactic)).length;
  vec[idx] = Math.min(1.0, count / Math.max(1, nEvents));
 });

 // 2. Persuasion signals (dims 13 - 20)
 PERSUASION_KEYS.forEach((sig, idx) => {
  const present = events.some(e => e.persuasion_signals?.includes(sig));
  vec[13 + idx] = present ? 1.0 : 0.0;
 });

 // 3. Channel presence & proportion (dims 21 - 25)
 CHANNELS.forEach((ch, idx) => {
  const count = events.filter(e => e.channel === ch).length;
  vec[21 + idx] = count / Math.max(1, nEvents);
 });

 // 4. Channel transitions bigrams (dims 26 - 41: top 16 transitions)
 const topTransitions = [
  'call->message', 'message->call', 'message->link', 'link->message',
  'message->qr', 'qr->payment', 'call->qr', 'call->payment',
  'link->payment', 'message->payment', 'link->qr', 'qr->call',
  'call->link', 'message->message', 'call->call', 'payment->payment'
 ];
 const transitions = [];
 for (let i = 0; i < events.length - 1; i++) {
  transitions.push(`${events[i].channel}->${events[i + 1].channel}`);
 }
 topTransitions.forEach((trans, idx) => {
  const count = transitions.filter(t => t === trans).length;
  vec[26 + idx] = Math.min(1.0, count / Math.max(1, transitions.length || 1));
 });

 // 5. Intent Contradictions (dims 42 - 45)
 const contradictions = session.lastAlert?.hasContradiction 
  ? (session.events.flatMap(e => e.contradictions || []))
  : [];
 CONTRADICTION_KEYS.forEach((cKey, idx) => {
  const active = contradictions.some(c => c.type === cKey);
  vec[42 + idx] = active ? 1.0 : 0.0;
 });

 // 6. Financial progression & amounts (dims 46 - 51)
 const paymentEvents = events.filter(e => Boolean(e.payment));
 const paymentsCount = paymentEvents.length;
 vec[46] = paymentsCount ? 1.0 : 0.0;
 vec[47] = Math.min(1.0, paymentsCount / 4.0);
 vec[48] = paymentEvents.some(e => e.payment?.newPayee === true) ? 1.0 : 0.0;
 
 const lastBucket = paymentEvents.at(-1)?.amount_bucket || 'unknown';
 const bucketIdx = BUCKETS.indexOf(lastBucket);
 vec[49] = bucketIdx >= 0 ? bucketIdx / (BUCKETS.length - 1) : 0.0;

 const escalating = session.lastAlert?.escalating ? 1.0 : 0.0;
 vec[50] = escalating;
 vec[51] = (paymentsCount > 1 && escalating) ? 1.0 : 0.0;

 // 7. Temporal pacing features (dims 52 - 57)
 vec[52] = Math.min(1.0, nEvents / 16.0); // Event count scaled
 vec[53] = Math.min(1.0, totalDurationMs / (10 * 60 * 1000)); // Total duration scaled (10 mins)
 
 let minDelta = Infinity;
 for (let i = 0; i < events.length - 1; i++) {
  const d = Math.max(0, (events[i + 1].timestamp || 0) - (events[i].timestamp || 0));
  if (d < minDelta) minDelta = d;
 }
 vec[54] = (minDelta !== Infinity && minDelta < 30000) ? 1.0 : 0.0; // Rapid succession (<30s)
 vec[55] = (totalDurationMs < 60000 && nEvents >= 3) ? 1.0 : 0.0; // High burst velocity
 vec[56] = events.some(e => e.channel === 'call') ? 1.0 : 0.0;
 vec[57] = events.some(e => e.channel === 'qr' || e.channel === 'payment') ? 1.0 : 0.0;

 // 8. Action risk and final severity (dims 58 - 63)
 const hasSensitiveAction = events.some(e => ['transfer', 'credentials', 'remote_access', 'install_app'].includes(e.requested_action));
 vec[58] = hasSensitiveAction ? 1.0 : 0.0;
 vec[59] = events.some(e => e.requested_action === 'transfer') ? 1.0 : 0.0;
 vec[60] = events.some(e => e.requested_action === 'remote_access' || e.tactics?.includes('remote_access')) ? 1.0 : 0.0;
 vec[61] = events.some(e => e.requested_action === 'install_app' || e.tactics?.includes('apk')) ? 1.0 : 0.0;
 
 const sev = session.lastAlert?.severity;
 vec[62] = sev === 'high' ? 1.0 : (sev === 'warning' ? 0.7 : (sev === 'watch' ? 0.4 : 0.0));
 vec[63] = session.lastAlert ? 1.0 : 0.0;

 // Round floats to 4 decimals for clean transmission
 return Array.from(vec).map(v => Math.round(v * 10000) / 10000);
}

/**
 * Computes cosine similarity between two 64-dimensional trajectory vectors.
 */
export function trajectoryCosineSimilarity(v1, v2) {
 if (!v1 || !v2 || v1.length !== v2.length) return 0.0;
 let dot = 0.0, mag1 = 0.0, mag2 = 0.0;
 for (let i = 0; i < v1.length; i++) {
  dot += v1[i] * v2[i];
  mag1 += v1[i] * v1[i];
  mag2 += v2[i] * v2[i];
 }
 if (mag1 === 0 || mag2 === 0) return 0.0;
 return Math.round((dot / (Math.sqrt(mag1) * Math.sqrt(mag2))) * 10000) / 10000;
}
