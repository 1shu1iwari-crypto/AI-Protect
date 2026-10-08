import {LiveCallReview} from '/core/live-review.mjs';
import {reviewRecordedTranscript, audioResponsePlan} from '/core/audio-review.mjs';

const transport = window.LiveReviewMessages;
let review = null;
let model = null;
try { model = await (await fetch('/core/model.json')).json(); } catch { /* Existing rules still work. */ }
if (transport) {
  transport.onmessage = event => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.kind === 'start' && !review) {
        review = new LiveCallReview({...payload, model});
        transport.postMessage(JSON.stringify({type: 'started', reviewId: review.session.id}));
      } else if (payload.kind === 'liveCallChunk' && review) {
        transport.postMessage(JSON.stringify(review.add(payload)));
      } else if (payload.kind === 'recordedCallReview' && review && payload.reviewId === review.session.id) {
        transport.postMessage(JSON.stringify({...reviewRecordedTranscript({id: payload.reviewId, transcript: payload.transcript,
          acousticEvidence: payload.acousticEvidence, paymentStatus: payload.paymentStatus, userTriggered: true, model}), sequence: payload.sequence}));
      } else if (payload.kind === 'recordedActionPlan' && review && payload.reviewId === review.session.id) {
        transport.postMessage(JSON.stringify({type:'audioPlan',reviewId:payload.reviewId,sequence:payload.sequence,action_plan:audioResponsePlan(payload.paymentStatus)}));
      } else throw Error('Unsupported live event.');
    } catch {
      // Never echo source text, parser errors, or recognizer payloads to native/logs.
      transport.postMessage(JSON.stringify({type: 'error'}));
    }
  };
  transport.postMessage(JSON.stringify({type: 'ready'}));
}
