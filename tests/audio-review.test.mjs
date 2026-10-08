import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRecordedTranscript, validateTranscript, audioResponsePlan} from '../core/audio-review.mjs';
import {normalizeAcousticEvidence, fuseMultimodalEvidence} from '../core/evidence-fusion.mjs';
import {ReviewSession} from '../core/review.mjs';

const segment = (text, extra = {}) => ({text, language:'en', speaker:'unknown', quality:'adequate', start_ms:0, end_ms:5000, ...extra});
const transcript = (segments, extra = {}) => ({schema_version:1, source:'shared_recording', language:'en', asr_model:'test-asr', quality:'adequate', duration_ms:10000, segments, ...extra});
const review = (source, extra = {}) => reviewRecordedTranscript({id:'recording-test-1234',transcript:source,userTriggered:true,...extra});

test('recording analysis requires a separate user tap and validates bounded timestamped speech', () => {
  const source = transcript([segment('Send your OTP to me immediately.')]);
  assert.throws(() => reviewRecordedTranscript({id:'recording-test-1234',transcript:source}), /Tap Analyze/);
  for (const invalid of [segment('x',{start_ms:-1}),segment('x',{end_ms:10001}),segment('x',{speaker:'scammer'}),segment('x',{confidence:NaN}),segment('x'.repeat(1801))]) {
    assert.throws(() => validateTranscript(transcript([invalid])), /Invalid/);
  }
  assert.throws(() => validateTranscript(transcript([segment('later',{start_ms:3000,end_ms:4000}),segment('earlier')])), /Invalid/);
});

test('shared English, Hindi and Hinglish requests use financial intent before payment', () => {
  const calls = [
    ['en','I am the SBI bank officer. Transfer money to a safe account immediately. Do not call the bank.'],
    ['hi','मैं बैंक अधिकारी हूँ। अपने पैसे सुरक्षित खाते में ट्रांसफर करो। किसी को मत बताना।'],
    ['hi-en','Sir aapka SBI account hold pe hai. Verification complete karne ke liye temporary settlement account mein transfer karna padega. Kisi ko mat batana.']
  ];
  for (const [language,text] of calls) {
    const result = review(transcript([segment(text,{language})],{language}));
    assert.equal(result.verdict.financial_risk,'high');
    assert.equal(result.verdict.voice_authenticity,'inconclusive');
    assert.equal(result.verdict.caller_identity,'unverified');
    assert.ok(result.verdict.action_plan.steps.some(x => x.includes('Do not transfer')));
    assert.equal(result.snapshot.events[0].channel,'call');
    assert.equal(result.snapshot.events[0].payment,null, 'Never invent an executed payment');
    assert.ok(result.verdict.factors.some(x => /money|account/.test(x)));
  }
});

test('harmless banking advice, refusals and corrected negations do not become credential demands', () => {
  for (const [language,text] of [['en','Your bank will never ask you to share an OTP. Use the official bank app.'],['hi','कभी अपना ओटीपी किसी को मत बताओ। बैंक के आधिकारिक ऐप का उपयोग करें।']]) {
    const result = review(transcript([segment(text,{language})],{language}));
    assert.equal(result.verdict.financial_risk,'no_strong_signs');
    assert.match(result.verdict.headline,/does not prove/);
    assert.equal(result.verdict.caller_identity,'unverified');
  }
  const original = review(transcript([segment('Send your OTP to me immediately.')]));
  assert.equal(original.verdict.financial_risk,'high');
  const corrected = review(transcript([segment('Do not send your OTP to anyone.',{user_reviewed:true})]));
  assert.equal(corrected.verdict.financial_risk,'no_strong_signs');
});

test('own speech is excluded and unknown speakers are never called authenticated scammers', () => {
  const source = transcript([segment('Someone asked me to send my OTP',{speaker:'me'}),segment('Please open your banking app independently.',{start_ms:5000,end_ms:9000})]);
  const result = review(source);
  assert.equal(result.verdict.financial_risk,'no_strong_signs');
  assert.equal(result.verdict.excluded_segments,1);
  assert.equal(result.verdict.caller_identity,'unverified');
  assert.equal(review(transcript([segment('Send your OTP to me immediately.',{speaker:'me'})])).verdict.financial_risk,'inconclusive');
});

test('silence, unsupported languages, uncertain words and degraded negative evidence are inconclusive', () => {
  const cases = [transcript([],{quality:'insufficient'}),transcript([segment('hello')]),
    transcript([segment('ஓடிபி எண்ணை யாருக்கும் சொல்ல வேண்டாம்',{language:'ta'})],{language:'ta'}),
    transcript([segment('Send your OTP to me immediately.',{confidence:0.1})]),
    transcript([segment('We are calling about tomorrow bank holiday.')],{quality:'degraded'})];
  for (const source of cases) assert.equal(review(source).verdict.financial_risk,'inconclusive');
  const mixed = transcript([segment('We are calling about tomorrow bank holiday.'),segment('uninterpreted regional request',{language:'ta',start_ms:5000,end_ms:8000})]);
  assert.equal(review(mixed).verdict.financial_risk,'inconclusive');
});

test('report and restored timeline contain bounded offsets and derived intent, never the transcript', () => {
  const text = 'Unique-secret-5561. SBI verification officer. Transfer ₹15000 to the temporary settlement account. Do not call the bank.';
  const result = review(transcript([segment(text)]));
  const json = JSON.stringify(result);
  assert.ok(!json.includes('Unique-secret-5561'));
  assert.ok(!json.includes('15000'));
  const restored = ReviewSession.restore(result.snapshot);
  assert.deepEqual(restored.snapshot().timeline[0].audio_segment,{index:0,start_ms:0,end_ms:5000,language:'en',speaker:'unknown',quality:'adequate',user_reviewed:false});
  assert.equal(restored.events[0].frame.financial_redirection,true);
  assert.equal(restored.events[0].frame.verification_suppression,true);
  const tampered = structuredClone(result.snapshot); tampered.timeline[0].audio_segment.text = 'private words';
  assert.ok(!JSON.stringify(ReviewSession.restore(tampered).snapshot()).includes('private words'));
});

test('long recordings retain peak risk even after the 64-event window expires', () => {
  const segments = Array.from({length:100},(_,i)=>segment(i===0?'Send your OTP to me immediately.':'The weather forecast is sunny tomorrow.',{start_ms:i*1000,end_ms:i*1000+1000}));
  const result = review(transcript(segments,{duration_ms:100000}));
  assert.equal(result.verdict.financial_risk,'high');
  assert.equal(result.snapshot.events.length,64);
  assert.equal(result.snapshot.timeline.length,64);
});

test('experimental acoustic scores cannot authenticate speech or override financial reasoning', () => {
  const demo = {analysis_status:'experimental_only',validation_status:'experimental',authenticity_assessment:'synthetic_suspected',raw_model_score:0.99,audio_quality:'adequate'};
  assert.equal(normalizeAcousticEvidence(demo).authenticity_assessment,'inconclusive');
  assert.equal(normalizeAcousticEvidence(demo).raw_model_score,null);
  const result = review(transcript([segment('Send your OTP to me immediately.')]),{acousticEvidence:demo});
  assert.equal(result.verdict.financial_risk,'high'); assert.equal(result.verdict.voice_authenticity,'inconclusive');
  const fused = fuseMultimodalEvidence({riskAssessment:{severity:'quiet'},acousticEvidence:demo});
  assert.ok(!fused.reason_codes.includes('synthetic_audio_manipulation'));
  assert.ok(!JSON.stringify(fused.evidence_items).includes('natural_speech_profile'));
  const evaluated = {...demo,analysis_status:'completed',validation_status:'real_speech_evaluated'};
  assert.equal(normalizeAcousticEvidence(evaluated).authenticity_assessment,'synthetic_suspected');
  assert.equal(review(transcript([segment('Your train is arriving at platform two.')]),{acousticEvidence:evaluated}).verdict.financial_risk,'no_strong_signs');
});

test('payment status selects appropriate incident response without defaulting to money not sent', () => {
  assert.equal(audioResponsePlan().payment_status,'unknown');
  assert.ok(audioResponsePlan('sent').routes.some(x=>x.url==='tel:1930'));
  assert.ok(audioResponsePlan('not_sent').routes.some(x=>x.id==='chakshu'));
  assert.throws(()=>audioResponsePlan('safe'),/Invalid/);
});
