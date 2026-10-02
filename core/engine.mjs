export const VERSION = '0.1.0';
export const TACTICS = ['authority','urgency','threat','isolation','credentials','remote_access','investment','refund','fee','payment','apk'];
export const CHANNELS = ['message','call','link','qr','payment'];
export const RULES = {
 authority: /\b(police|cbi|rbi|bank officer|bank official|customs|cyber cell|sbi officer|aadhaar department)\b|पुलिस|अधिकारी/iu,
 urgency: /\b(urgent|immediately|right now|today only|last chance|jaldi|abhi|within \d+ minutes)\b|तुरंत|जल्दी/iu,
 threat: /\b(arrest|blocked|freeze|criminal|warrant|suspend|illegal parcel|money laundering|account band|giraftar)\b|गिरफ्तार|बंद हो/iu,
 isolation: /\b(do not disconnect|don't hang up|do not tell|keep this secret|stay on the call|kisi ko mat|call mat)\b|किसी को मत/iu,
 credentials: /\b(share|tell|send|enter|batao|bhejo)\b.{0,35}\b(otp|pin|password|cvv)\b|ओटीपी.{0,20}(बताओ|भेजो)/iu,
 remote_access: /\b(anydesk|teamviewer|screen shar(?:e|ing)|remote access|remote control)\b/iu,
 investment: /\b(guaranteed (?:return|profit)|double your money|30% return|sure profit|guaranteed daily|institutional ipo|pakka profit|paisa double)\b|गारंटीड|पैसा दोगुना/iu,
 refund: /\b(refund|cashback|receive money|receive your|paisa milega|paise wapas)\b|रिफंड|पैसे वापस/iu,
 fee: /\b(registration fee|unlock (?:withdrawal|earnings)|withdrawal fee|task deposit|release fee|processing fee)\b/iu,
 payment: /\b(transfer|deposit|pay|payment|send money|safe account|upi|bhejo|jama)\b|भुगतान|ट्रांसफर/iu,
 apk: /\.apk\b|\b(install our app|install this app|download the app)\b/iu
};
const LABELS = {authority:'Claim of official authority',urgency:'Pressure to act quickly',threat:'Threat or account restriction',isolation:'Asked to stay isolated',credentials:'Request for secret credentials',remote_access:'Remote access request',investment:'Guaranteed investment return',refund:'Claim of receiving a refund',fee:'Fee to unlock earnings',payment:'Payment requested',apk:'App installation requested'};
export function normalize(text) {return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();}
export function tokens(text) {const t=normalize(text); const words=t.match(/[\p{L}\p{N}_]+/gu)||[];return [...new Set([...words,...words.slice(1).map((w,i)=>words[i]+' '+w)])];}
export function classify(text, model) {
 if (!model) return null;
 const ts=tokens(text), scores={};
 for (const [label, weights] of Object.entries(model.weights)) {let z=model.intercepts[label];for(const t of ts)z+=weights[t]||0;scores[label]=1/(1+Math.exp(-z));}
 return scores;
}
export function extract(text,model) {
 const t=normalize(text);const ml=classify(t,model);const found=[];
 // A negated request must not be treated as a request. Segment sentences first.
 const sentences=t.split(/[.!?;\n]+/); 
 for(const [k,re] of Object.entries(RULES)) {
  const match=sentences.some(s=>re.test(s)&&!(k==='credentials'&&/\b(never|don't|do not|not to|mat|nahi)\b|कभी.*नहीं/iu.test(s))&&!(k==='remote_access'&&/\b(never|don't|do not|avoid)\b/iu.test(s)));
  if(match)found.push(k);
 }
 // ML is an experimental supporting signal; it cannot trigger a warning alone.
 return {tactics:found, modelScores:ml, labels:found.map(k=>LABELS[k])};
}
export function parseUPI(input) {
 if(typeof input!=='string'||input.length>4096)throw Error('UPI payload is too long.');
 let u;try{u=new URL(input.trim());}catch{throw Error('Paste a complete upi://pay QR payload.');}
 if(u.protocol!=='upi:'||u.hostname!=='pay'||(u.pathname&&u.pathname!=='/'))throw Error('Only upi://pay payment intents are supported.');
 const p=u.searchParams;
 for(const k of ['pa','am','cu','pn','tn'])if(p.getAll(k).length>1)throw Error('Ambiguous duplicate UPI fields.');
 const payee=p.get('pa');if(!payee||!/^[-a-zA-Z0-9._]{2,128}@[a-zA-Z0-9]{2,64}$/.test(payee))throw Error('A valid payee VPA is required.');
 const raw=p.get('am');if(raw!==null&&!/^\d{1,9}(\.\d{1,2})?$/.test(raw))throw Error('Amount must be a positive decimal with up to two decimal places.');
 const amount=raw===null?null:Number(raw);if(amount!==null&&(!Number.isFinite(amount)||amount<=0||amount>10000000))throw Error('Amount is outside the supported demo range.');
 if(p.has('cu')&&p.get('cu')!=='INR')throw Error('This prototype supports INR only.');
 return {payee,name:p.get('pn')||'Unknown payee',amount,note:p.get('tn')||'',direction:'outgoing'};
}
export function amountBucket(n) {return n==null?'unknown':n<1000?'under_1k':n<10000?'1k_10k':n<50000?'10k_50k':'50k_plus';}
export class Session {
 constructor(model=null){this.model=model;this.reset();}
 reset(){this.id=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);this.events=[];this.lastAlert=null;this.lastWarningAt=-Infinity;this.started=Date.now();}
 add(input) {
  if(!CHANNELS.includes(input.channel))throw Error('Unsupported channel.');
  const text=String(input.text||'');if(text.length>10000)throw Error('Keep one event under 10,000 characters.');
  const now=input.timestamp??Date.now();if(!Number.isFinite(now)||now<(this.events.at(-1)?.timestamp??0))throw Error('Events must arrive in timestamp order.');
  if(this.events.length&&now-this.events.at(-1).timestamp>20*60*1000)this.reset();
  const payment=input.channel==='qr'?parseUPI(text):input.payment;
  if(payment&&(!Number.isFinite(payment.amount)&&payment.amount!==null || payment.amount!==null&&(payment.amount<=0||payment.amount>10000000)))throw Error('Invalid payment amount.');
  const features=extract(text,this.model);
  if(input.channel==='link'&&/\.apk(?:\?|$)/i.test(text)&&!features.tactics.includes('apk'))features.tactics.push('apk');
  if(payment&&!features.tactics.includes('payment'))features.tactics.push('payment');
  const event={channel:input.channel,timestamp:now,tactics:features.tactics,modelScores:features.modelScores,payment:payment?{...payment}:null};
  // No raw text, VPA, URL or transcript is retained in the session.
  if(event.payment)event.payment={amountBucket:amountBucket(payment.amount),newPayee:Boolean(payment.newPayee??true),direction:'outgoing'};
  this.events.push(event);if(this.events.length>64)this.events.shift();
  return this.assess(event);
 }
 assess(current) {
  const all=new Set(this.events.flatMap(e=>e.tactics));const has=k=>all.has(k);
  const channels=new Set(this.events.map(e=>e.channel));const actions=['credentials','remote_access','apk'];
  const payment=Boolean(current.payment);const currentAction=payment||actions.some(t=>current.tactics.includes(t));
  let family='Unclassified workflow';let workflow=0;let reason='';
  // Require pretext before the action; unordered keyword accumulation is not enough.
  const before=(a,b)=>this.events.findIndex(e=>e.tactics.includes(a))>=0&&this.events.findIndex(e=>e.tactics.includes(a))<=this.events.map(e=>e.tactics.includes(b)).lastIndexOf(true);
  if(has('refund')&&payment&&before('refund','payment')){family='Refund / QR reversal';workflow=92;reason='A refund claim led to an outgoing UPI payment. This QR sends money; it does not receive money.';}
  else if(has('authority')&&(has('threat')||has('isolation'))&&has('payment')&&before('authority','payment')){family='Authority / digital arrest';workflow=89;reason='An authority claim and pressure were followed by a money transfer request.';}
  else if(has('investment')&&has('payment')&&before('investment','payment')){family='Investment escalation';workflow=has('apk')?88:75;reason='A guaranteed-return offer was followed by a payment request.';}
  else if(has('fee')&&has('payment')){family='Task / advance fee';workflow=80;reason='A fee or deposit was requested to release promised earnings.';}
  else if(has('remote_access')&&(has('authority')||has('refund')||has('payment'))){family='Remote access support';workflow=86;reason='Remote control was requested alongside financial or authority claims.';}
  else if(has('credentials')){family='Credential theft';workflow=86;reason='Someone requested a secret OTP, PIN, password or CVV.';}
  else if(has('urgency')&&has('payment')&&(has('threat')||has('isolation'))){family='Pressure to transfer';workflow=78;reason='Pressure and a threat or secrecy request were followed by a payment request.';}
  const buckets=['under_1k','1k_10k','10k_50k','50k_plus'];
  const payments=this.events.filter(e=>e.payment&&e.payment.amountBucket!=='unknown');const escalating=payments.length>1&&buckets.indexOf(payments.at(-1).payment.amountBucket)-buckets.indexOf(payments[0].payment.amountBucket)>=2;
  const independent=['authority','threat','isolation','investment','refund','fee','credentials','remote_access','apk'].filter(has).length+(payment?1:0);
  const corroboration=current.tactics.some(t=>(current.modelScores?.[t]??0)>=0.75);
  let score=workflow;if(workflow&&corroboration)score+=3;if(payment&&workflow){score+=current.payment.newPayee?5:0;score+=escalating?6:0;}score=Math.min(99,score);
  const ml=Object.values(current.modelScores||{});const modelSupport=ml.length?Math.max(...ml):null;
  const evidenceScore=Math.min(99,workflow||all.size*9);const actionRisk=currentAction?score:Math.min(25,score);
  let severity='quiet';if(currentAction&&score>=75&&(independent>=2||has('credentials')))severity=score>=88?'high':'warning';else if(evidenceScore>=40)severity='watch';
  const signature=family+':'+severity;const previous=this.lastAlert;
  const upgrade=severity==='high'&&previous?.severity==='warning';
  const novelAction=actions.some(t=>current.tactics.includes(t)&&!previous?.tactics.includes(t));
  const cooldown=current.timestamp-this.lastWarningAt<60000;
  const increasedStake=payment&&escalating&&!previous?.escalating;
  const suppressed=['high','warning'].includes(severity)&&cooldown&&!upgrade&&!novelAction&&!increasedStake;
  const showWarning=['high','warning'].includes(severity)&&!suppressed;
  if(showWarning){this.lastWarningAt=current.timestamp;this.lastAlert={signature,severity,tactics:[...all],escalating};}
  const stage=current.channel==='payment'?'Transfer prepared':payment?'Payment intent':currentAction?'Sensitive action':has('urgency')||has('threat')?'Pressure':all.size?'Pretext':'Normal';
  return {family,severity,showWarning,suppressed,evidenceScore,actionRisk,stage,reason:reason||'Not enough evidence to establish a scam workflow. A low score is not a safety guarantee.',tactics:[...all],labels:[...all].map(k=>LABELS[k]),channels:[...channels],modelSupport,escalating,event:current};
 }
 fingerprint(){const sequence=this.events.flatMap(e=>e.tactics).slice(-64);return {version:VERSION,session_id:this.id,tactics:[...new Set(sequence)].sort(),channels:[...new Set(this.events.map(e=>e.channel))].sort(),sequence,amount_bucket:this.events.filter(e=>e.payment).at(-1)?.payment.amountBucket??'unknown',event_count:this.events.length};}
}
