import {VERSION} from './version.mjs';
import {TACTICS,CHANNELS} from './constants.mjs';
export function fingerprint(session){
 const sequence=session.events.flatMap(e=>e.tactics.filter(t=>TACTICS.includes(t))).slice(-64);
 return {version:VERSION,session_id:session.id,tactics:[...new Set(sequence)].sort(),channels:[...new Set(session.events.map(e=>e.channel).filter(c=>CHANNELS.includes(c)))].sort(),sequence,amount_bucket:session.events.filter(e=>e.payment).at(-1)?.payment.amountBucket??'unknown',event_count:session.events.length};
}
