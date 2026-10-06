import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiveCallReview} from '../core/live-review.mjs';
import {ReviewSession} from '../core/review.mjs';

const id = 'live-call-12345678';
const start = () => new LiveCallReview({id, direction: 'incoming', userTriggered: true});
const fragment = (text, sequence = 1) => ({kind: 'liveCallChunk', reviewId: id, sequence, text, timestamp: Date.now()});

test('live review requires explicit consent and a valid session ID', () => {
  for (const userTriggered of [undefined, false, 'true']) {
    assert.throws(() => new LiveCallReview({id, userTriggered}));
  }
  assert.throws(() => new LiveCallReview({userTriggered: true}));
  assert.throws(() => new LiveCallReview({id: '../outside', userTriggered: true}));
  const review = start();
  assert.equal(review.session.events.length, 0);
});

test('stable call phrases use the existing engine and preserve only derived evidence', () => {
  const review = start();
  review.add(fragment('I am calling from HDFC bank.'));
  review.add(fragment('Urgent: your account will be blocked today.', 2));
  const result = review.add(fragment('Tell me your OTP 987654 and account number 123456789012.', 3));
  assert.ok(['warning', 'high'].includes(result.severity));
  assert.ok(result.signals.includes('credentials'));
  assert.equal(result.snapshot.events.length, 3);
  assert.ok(result.snapshot.timeline.every(entry => entry.evidence_type === 'live_call_audio'));
  for (const secret of ['987654', '123456789012', 'Tell me your', 'I am calling']) assert.ok(!JSON.stringify(result).includes(secret));
  const restored = ReviewSession.restore(result.snapshot);
  assert.equal(restored.timeline[2].evidence_type, 'live_call_audio');
  // Later consented messages continue the saved call, not an unrelated detector.
  restored.add({channel: 'message', text: 'Transfer to our safe account immediately.', userTriggered: true});
  assert.equal(restored.id, id);
  assert.equal(restored.events.length, 4);
});

test('live review rejects cross-session, duplicated, stale, oversized and post-stop fragments', () => {
  const review = start();
  for (const change of [{reviewId: 'other-12345678'}, {sequence: 0}, {sequence: 2},
    {text: ''}, {text: 'x'.repeat(2001)}, {timestamp: NaN}, {timestamp: Date.now() - 61000},
    {timestamp: Date.now() + 61000}, {kind: 'share'}]) {
    assert.throws(() => review.add({...fragment('hello'), ...change}));
  }
  review.add(fragment('Your order is ready.'));
  assert.throws(() => review.add(fragment('Share your OTP.')));
  review.stop();
  assert.throws(() => review.add(fragment('Share your OTP.', 2)));
  assert.equal(review.session.events.length, 1);
});

test('ordinary live conversation remains quiet and the event bound is preserved', () => {
  const review = start();
  let result;
  for (let i = 1; i <= 80; i++) result = review.add(fragment('Your grocery order is ready for pickup.', i));
  assert.equal(result.severity, 'quiet');
  assert.equal(result.snapshot.events.length, 64);
  assert.equal(result.snapshot.timeline.length, 64);
});

test('live adapter rejects a snapshot belonging to another review', () => {
  const review = start();
  const snapshot = review.add(fragment('Hello.')).snapshot;
  assert.throws(() => new LiveCallReview({id: 'other-review-123', snapshot, userTriggered: true}));
});

test('microphone and accessibility declarations are isolated from the Play manifest', () => {
  const main = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const hackathon = readFileSync('android/app/src/hackathon/AndroidManifest.xml', 'utf8');
  for (const permission of ['RECORD_AUDIO', 'FOREGROUND_SERVICE_MICROPHONE', 'BIND_ACCESSIBILITY_SERVICE']) {
    assert.ok(!main.includes(permission));
    assert.ok(hackathon.includes(permission));
  }
  for (const forbidden of ['READ_CALL_LOG', 'READ_SMS', 'READ_CONTACTS', 'CAPTURE_AUDIO_OUTPUT', 'INTERNET']) {
    assert.ok(!main.includes(`android.permission.${forbidden}`));
    assert.ok(!hackathon.includes(`android.permission.${forbidden}`));
  }
});

test('deferred and imported audio keep provenance without persisting sensitive speech', () => {
  for (const evidenceType of ['recorded_call_audio', 'uploaded_call_audio']) {
    const review = new LiveCallReview({id, direction: 'unknown', userTriggered: true, evidenceType});
    const result = review.add({kind: 'liveCallChunk', reviewId: id, sequence: 1,
      text: 'I am police. Transfer money now and tell me your OTP 765432.', timestamp: Date.now()});
    assert.equal(result.snapshot.timeline[0].evidence_type, evidenceType);
    assert.equal(ReviewSession.restore(result.snapshot).snapshot().timeline[0].evidence_type, evidenceType);
    assert(!JSON.stringify(result.snapshot).includes('765432'));
  }
  assert.throws(() => new LiveCallReview({id, userTriggered: true, evidenceType: 'untrusted_audio'}));
});
