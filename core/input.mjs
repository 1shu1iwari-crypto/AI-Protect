export function normalize(text) {return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();}
export function tokens(text) {const t=normalize(text); const words=t.match(/[\p{L}\p{N}_]+/gu)||[];return [...new Set([...words,...words.slice(1).map((w,i)=>words[i]+' '+w)])];}
export function inspectLink(text) {
 // Lexical evidence only. Never fetch a URL or claim domain reputation.
 const links=normalize(text).match(/https?:\/\/[^\s<>"']+/gi)||[];
 let unusualVerification=false;
 for(const raw of links){try{
  const u=new URL(raw),host=u.hostname.toLowerCase();
  const verification=/kyc|verify|verification|bank|secure|login/i.test(host+u.pathname);
  const unusual=/\.(xyz|top|click|zip|invalid)$/.test(host)||Boolean(u.username||u.password)||host.split('.').length>4||/^\d+\.\d+\.\d+\.\d+$/.test(host);
  unusualVerification ||= verification&&unusual;
 }catch{}}
 return {unusualVerification};
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
export function randomId(){const random=globalThis.crypto;if(!random?.getRandomValues)throw Error('Secure random IDs are unavailable in this browser.');return random.randomUUID?.()||Array.from(random.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
