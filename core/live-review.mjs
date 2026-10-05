import {ReviewSession} from './review.mjs';

// The native host owns consent and transport. This adapter owns one bounded review,
// reusing the existing detector and returning derived data only.
export class LiveCallReview {
  constructor({id, direction, userTriggered, snapshot = null, model = null}) {
    if (userTriggered !== true) throw Error('Explicit live review consent required.');
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw Error('Invalid review ID.');
    this.session = snapshot ? ReviewSession.restore(snapshot, model) : new ReviewSession(model);
    if (snapshot && snapshot.session_id !== id) throw Error('Wrong review snapshot.');
    this.session.startCall({id, direction});
    this.lastSequence = 0;
    this.stopped = false;
  }
  add(payload) {
    if (this.stopped || payload.kind !== 'liveCallChunk' || payload.reviewId !== this.session.id ||
        !Number.isSafeInteger(payload.sequence) || payload.sequence !== this.lastSequence + 1 ||
        typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2000 ||
        !Number.isFinite(payload.timestamp) || Math.abs(Date.now() - payload.timestamp) > 60000 ||
        payload.timestamp < (this.session.events.at(-1)?.timestamp || 0)) throw Error('Invalid live call fragment.');
    const result = this.session.add({channel: 'call', text: payload.text, timestamp: payload.timestamp,
      evidence_type: 'live_call_audio', userTriggered: true});
    this.lastSequence = payload.sequence;
    return {type: 'liveRisk', reviewId: this.session.id, sequence: this.lastSequence,
      severity: result.severity, stage: result.stage,
      signals: [...new Set(this.session.timeline.flatMap(entry => entry.evidence))],
      snapshot: this.session.snapshot()};
  }
  stop() { this.stopped = true; }
}
