import {normalize,inspectLink} from './input.mjs';
import {classify} from './legacy-model.mjs';
import {LABELS} from './constants.mjs';
export const RULES = {
 authority: /\b(police|cbi|rbi|bank officer|bank official|customs|cyber cell|sbi|hdfc|icici|aadhaar department|bank verification team)\b|पुलिस|अधिकारी/iu,
 urgency: /\b(urgent|immediately|right now|today only|last chance|asap|jaldi|abhi|within \d+ minutes)\b|तुरंत|जल्दी/iu,
 threat: /\b(arrest|blocked|freeze|criminal|warrant|suspend|illegal parcel|money laundering|account band|giraftar)\b|गिरफ्तार|बंद हो/iu,
 isolation: /\b(do not disconnect|don't hang up|do not tell|keep this secret|stay on the call|kisi ko mat|call mat)\b|किसी को मत/iu,
 credentials: /\b(share|tell|send|enter|batao|bhejo|provide|reveal)\b.{0,45}\b(otp|pin|password|cvv)\b|\b(otp|pin|password|cvv)\b.{0,30}\b(batao|bhejo|send|share|बताओ|भेजो)\b|(?:ओटीपी|पासवर्ड).{0,20}(बताओ|भेजो)/iu,
 remote_access: /\b(anydesk|teamviewer|screen shar(?:e|ing)|remote access|remote control)\b/iu,
 investment: /\b(guaranteed (?:return|profit)|double your money|30% return|sure profit|guaranteed daily|institutional ipo|pakka profit|paisa double)\b|गारंटीड|पैसा दोगुना/iu,
 refund: /\b(refund|cashback|receive money|receive your|paisa milega|paise wapas)\b|रिफंड|पैसे वापस/iu,
 fee: /\b(unlock (?:withdrawal|earnings)|withdrawal fee|task deposit|release fee|processing fee before earnings|registration fee.{0,60}(?:earn|job|withdraw|task))\b/iu,
 payment: /\b(transfer|deposit|pay|payment|send money|safe account|upi|bhejo|jama)\b|भुगतान|ट्रांसफर/iu,
 apk: /\.apk\b|\b(install our app|install this app|download the app)\b/iu,
 verification: /\b(?:update|verify|complete|confirm|renew)\b.{0,40}\b(?:kyc|account details|bank details|verification)\b|\bkyc\b.{0,30}\b(?:update|verify|expire|expired|renew)\b|केवाईसी.{0,25}(अपडेट|करो|पूरी)/iu
};
export function extractRules(text,model) {
 const t=normalize(text);const ml=classify(t,model);const found=[];
 // Preserve sentence boundaries before normalization. A negation only applies
 // to its own clause: "Don't tell anyone, send your OTP to me" is still risky.
 const clauses=String(text).normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').split(/[.!?;\n,।。\u2028\u2029]+|\bbut\b|\bhowever\b/iu).map(normalize);
 const negated=/\b(?:never|do not|don't|must not|should not|avoid|not to)\s+(?:\w+\s+){0,3}(?:share|tell|send|enter|provide|reveal|use|install|download|scan|pay|transfer)\b|\b(?:mat|nahi)\b.{0,18}(?:bhejo|batao|karo)|(?:बताओ|भेजो|करो).{0,10}(?:मत|नहीं)|(?:मत|नहीं).{0,10}(?:बताओ|भेजो|करो)/iu;
 for(const [k,re] of Object.entries(RULES)) {
  const match=clauses.some(s=>re.test(s)&&!(['credentials','remote_access','apk','refund','payment','verification','fee','investment'].includes(k)&&negated.test(s))&&!(['fee','investment'].includes(k)&&/\b(?:never|avoid|do not|don't|must not|should not|not guaranteed|can lose|market risk)\b|मत|नहीं/iu.test(s))&&!(k==='remote_access'&&/\b(?:avoid|never|do not|don't)\b.{0,25}\b(?:remote access|screen sharing|anydesk|teamviewer)\b/iu.test(s))&&!(k==='refund'&&/\b(?:already|credited|received|processed|original payment)\b/iu.test(s))&&!(k==='credentials'&&/\b(?:enter|use)\b.{0,20}\bpin\b.{0,50}\b(?:official|your)\b.{0,20}\b(?:upi|banking) app\b/iu.test(s)));
  if(match)found.push(k);
 }
 if(inspectLink(text).unusualVerification)found.push('link_risk');
 // ML is an experimental supporting signal; it cannot trigger a warning alone.
 return {tactics:found, modelScores:ml, labels:found.map(k=>LABELS[k])};
}
