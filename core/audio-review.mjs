import {ReviewSession, REVIEW_LABELS, responsePlan} from './review.mjs';
import {normalizeAcousticEvidence} from './evidence-fusion.mjs';

const LANG = /^(?:[a-z]{2,3}(?:-[a-z]{2,3})?|auto|unknown)$/;
const QUALITY = ['adequate', 'degraded', 'insufficient'];
const SPEAKERS = ['unknown', 'other', 'me'];
const RANK = ['quiet', 'watch', 'warning', 'high'];

/** Original-language words exist only during local review, never in the snapshot. */
export function validateTranscript(raw) {
  if (!raw || raw.schema_version !== 1 || !['shared_recording', 'imported_recording', 'microphone_recording'].includes(raw.source) ||
      typeof raw.language !== 'string' || !LANG.test(raw.language) ||
      typeof raw.asr_model !== 'string' || raw.asr_model.length > 100 ||
      !Number.isSafeInteger(raw.duration_ms) || raw.duration_ms < 0 || raw.duration_ms > 600000 ||
      !QUALITY.includes(raw.quality) || !Array.isArray(raw.segments) || raw.segments.length > 512) throw Error('Invalid recorded transcript.');
  let previous = 0, characters = 0;
  for (const s of raw.segments) {
    if (!s || !Number.isSafeInteger(s.start_ms) || !Number.isSafeInteger(s.end_ms) ||
        s.start_ms < previous || s.start_ms < 0 || s.end_ms <= s.start_ms || s.end_ms > raw.duration_ms ||
        typeof s.text !== 'string' || !s.text.trim() || s.text.length > 1800 ||
        !SPEAKERS.includes(s.speaker) || typeof s.language !== 'string' || !LANG.test(s.language) ||
        !QUALITY.includes(s.quality) || (s.confidence != null && (!Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1))) throw Error('Invalid transcript segment.');
    previous = s.start_ms; characters += s.text.length;
  }
  if (characters > 150000) throw Error('Transcript is too long.');
  return raw;
}

export function audioResponsePlan(paymentStatus = 'unknown') {
  if (paymentStatus === 'sent') return responsePlan('yes');
  if (paymentStatus === 'not_sent') return responsePlan('no');
  if (paymentStatus !== 'unknown') throw Error('Invalid payment status.');
  return {payment_status: 'unknown', title: 'Pause before acting', steps: [
    'Do not transfer money or share an OTP, PIN or password because of this call.',
    'Contact the institution independently through its app or the number on your bank card.',
    'Ask someone you trust to review the request with you.',
    'If you already sent money, contact your bank promptly and call 1930.'
  ], routes: []};
}

/** One user-owned recording, reusing the existing engine without inventing speakers. */
export function reviewRecordedTranscript({id, transcript, userTriggered, model = null, acousticEvidence = null, paymentStatus = 'unknown'}) {
  if (userTriggered !== true) throw Error('Tap Analyze before reviewing audio.');
  validateTranscript(transcript);
  const session = new ReviewSession(model); session.startCall({id, direction: 'unknown'});
  const findings = [];
  const signals = new Set();
  let severity = 'quiet', words = 0, analyzedWords = 0, analyzed = 0, excluded = 0, unsupported = 0, uncertain = 0;
  for (const [index, segment] of transcript.segments.entries()) {
    words += segment.text.trim().split(/\s+/u).length;
    // A recipient's refusal/advice is never represented as the caller's request.
    if (segment.speaker === 'me') { excluded++; continue; }
    if (!['en', 'hi', 'hi-en', 'en-hi'].includes(segment.language)) { unsupported++; continue; }
    if (segment.quality === 'insufficient' || (segment.confidence != null && segment.confidence < 0.45 && segment.user_reviewed !== true)) { uncertain++; continue; }
    const result = session.add({channel: 'call', text: segment.text, userTriggered: true,
      evidence_type: transcript.source === 'microphone_recording' ? 'recorded_call_audio' : 'uploaded_call_audio',
      audio_segment: {index, start_ms: segment.start_ms, end_ms: segment.end_ms, language: segment.language,
        speaker: segment.speaker, quality: segment.quality, user_reviewed: segment.user_reviewed === true}});
    analyzed++;
    analyzedWords += segment.text.trim().split(/\s+/u).length;
    if (RANK.indexOf(result.severity) > RANK.indexOf(severity)) severity = result.severity;
    // The live engine reserves modal interventions for execution. A requested
    // review can explain an already high-risk request without inventing a payment.
    if (result.requestedActionRisk >= 75 && result.event.requested_action !== 'none' &&
        (result.hasContradiction || result.event.frame?.financial_redirection &&
          result.tactics.some(t => ['authority', 'threat', 'isolation'].includes(t)))) severity = 'high';
    for (const item of result.manipulation) signals.add(item.type);
    if (result.manipulation.length || result.event.requested_action !== 'none') findings.push({
      segment_index: index, start_ms: segment.start_ms, end_ms: segment.end_ms, speaker: segment.speaker,
      language: segment.language, reason_codes: result.manipulation.map(x => x.type),
      requested_action: result.event.requested_action, severity: result.severity
    });
  }
  const insufficient = analyzedWords < 5 || !analyzed || transcript.quality === 'insufficient';
  const financialRisk = insufficient ? 'inconclusive' : severity === 'high' || severity === 'warning' ? 'high' : severity === 'watch' ? 'watch' :
    unsupported || uncertain || transcript.quality === 'degraded' ? 'inconclusive' : 'no_strong_signs';
  const headline = {inconclusive: 'We could not reliably assess this recording', high: 'This recording contains financial scam warning signs',
    watch: 'Pause and check this request', no_strong_signs: 'No strong scam signs found — this does not prove the call is safe'}[financialRisk];
  const authenticity = normalizeAcousticEvidence(acousticEvidence);
  const limitations = [
    'Speech recognition can miss or change words. Inspect the transcript before acting.',
    'Speakers have not been identified automatically. Findings describe the recording, not a verified caller.',
    'A natural or synthetic voice does not establish whether a financial request is legitimate.'
  ];
  if (transcript.quality === 'degraded') limitations.push('This recording is quiet or clipped; important words may be missing.');
  if (unsupported) limitations.push('Some speech is in a language not yet covered by the financial-risk engine. No translation was assumed.');
  if (uncertain) limitations.push('Some uncertain speech was excluded. Correct it locally if needed.');
  if (excluded) limitations.push('Speech you marked as yours was excluded from financial-request analysis.');
  session.payment_status = paymentStatus;
  const plan = audioResponsePlan(paymentStatus);
  return {type: 'recordedRisk', reviewId: session.id, snapshot: session.snapshot(), verdict: {
    schema_version: 1, headline, financial_risk: financialRisk, severity: financialRisk === 'inconclusive' ? 'insufficient' : severity,
    caller_identity: 'unverified', voice_authenticity: authenticity.authenticity_assessment,
    authenticity, words, analyzed_segments: analyzed, excluded_segments: excluded, unsupported_segments: unsupported,
    quality: transcript.quality, asr_model: transcript.asr_model, language: transcript.language,
    signals: [...signals], factors: [...signals].map(s => REVIEW_LABELS[s]).filter(Boolean),
    findings: findings.slice(-64), limitations, action_plan: plan
  }};
}
