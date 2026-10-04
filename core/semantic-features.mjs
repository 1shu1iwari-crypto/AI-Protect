import {normalize} from './input.mjs';

// Small, inspectable multilingual concept vocabulary. These are features of the
// local linear model, not identities, embeddings, or evidence retained as text.
export const CONCEPTS = {
 official: /\b(?:police|officer|official|customs|cbi|rbi|compliance|clearance|regulator|investigation)\b|पुलिस|अधिकारी|जांच|जाँच|निकासी अनुमति/iu,
 bank: /\b(?:bank|banking|hdfc|icici|sbi|account|kyc)\b|बैंक|खाता|केवाईसी/iu,
 restriction: /\b(?:arrest|warrant|criminal|freeze|blocked|suspend|band ho|giraftar|penalty|detain)\b|गिरफ्तार|गिरफ़्तार|बंद हो|जुर्माना/iu,
 deadline: /\b(?:urgent|immediately|right now|today only|last chance|asap|jaldi|abhi|within \d+ minutes|window (?:ends|closes)|deadline|ends shortly)\b|तुरंत|तुरन्त|जल्दी|अभी|समय सीमा/iu,
 secrecy: /\b(?:keep (?:this|it) (?:secret|between us)|stay on (?:the|this) call|do not disconnect|don't hang up|do not tell|kisi ko mat|call mat|without telling)\b|किसी को मत|कॉल पर रहो/iu,
 secret: /\b(?:otp|pin|password|cvv|passcode|one.time (?:code|password))\b|ओटीपी|पासवर्ड|पिन/iu,
 disclose: /\b(?:share|tell|send|provide|reveal|give|batao|bhejo|forward|read out|enter)\b|बताओ|बताइए|बताएं|बताएँ|भेजो|भेजिए|साझा|दर्ज/iu,
 remote: /\b(?:anydesk|teamviewer|screen shar(?:e|ing)|remote (?:access|control)|control your (?:phone|device))\b|स्क्रीन शेयर|रिमोट/iu,
 install: /\b(?:install|download|enable|turn on|open)\b|इंस्टॉल|डाउनलोड|चालू/iu,
 package: /\.apk\b|\b(?:our app|this app|app package)\b|ऐप/iu,
 opportunity: /\b(?:investment|invest|allocation|trading|ipo|selected members|private (?:group|route)|earnings|profit|payout|returns?)\b|निवेश|कमाई|मुनाफा|मुनाफ़ा/iu,
 multiplier: /\b(?:double|triple|quadruple|(?:turns?|grows?|becomes?|into).{0,35}(?:four|three|twice|4)|chaar guna|char guna|do guna|paisa double)\b|दोगुना|दुगुना|चार गुना/iu,
 promise: /\b(?:guaranteed|sure profit|pakka profit|assured|fixed (?:return|profit)|no loss|30% return)\b|गारंटी|निश्चित लाभ|पक्का/iu,
 refund: /\b(?:refund|cashback|receive (?:money|your)|paise wapas|paisa milega)\b|रिफंड|रिफ़ंड|पैसे वापस/iu,
 routing: /\b(?:transfer|deposit|pay|payment|send money|funds|holding reserve|safe account|bhejo|jama)\b|भुगतान|ट्रांसफर|पैसे भेज|जमा|धन/iu,
 reserve: /\b(?:holding reserve|clearance (?:procedure|process)|compliance window|custody account|holding account|protective reserve)\b|सुरक्षित खाते|आरक्षित खाते/iu,
 release: /\b(?:unlock|release|withdrawal|withdraw|recover|recovery|task deposit|fee|one more payment)\b|निकासी|शुल्क|फीस|वसूली/iu,
 reward: /\b(?:task|reward|prize|bonus|lottery|earn|already earned|small task)\b|इनाम|कार्य|कमाई/iu,
 verify: /\b(?:verify|verification|kyc|renew|update|confirm)\b|केवाईसी|सत्यापन|अपडेट/iu,
 trust: /\b(?:trust me|here to help|support|helpdesk|test payment|already earned|selected members)\b|भरोसा|मदद/iu,
 caution: /\b(?:never|do not|don't|avoid|must not|should not|not to|ignore|mat|nahi)\b|मत|नहीं/iu,
 risk_notice: /\b(?:not guaranteed|can lose|market risk|no fixed|lose value|classroom|graph paper|sports event|college|workshop)\b|जोखिम|गारंटी नहीं/iu,
 settled: /\b(?:already credited|credited|received|processed|original payment)\b|जमा हो चुके|मिल चुके/iu,
 official_app: /\b(?:official|existing|your)\b.{0,25}\b(?:upi|banking|bank) app\b|आधिकारिक ऐप/iu
};
export const FEATURE_NAMES = Object.keys(CONCEPTS);
export function semanticFeatures(text) {
 const t = normalize(text);
 return Object.fromEntries(FEATURE_NAMES.map(key=>[key,Number(CONCEPTS[key].test(t))]));
}
export function clauses(text) {
 // Preserve line and Hindi sentence boundaries; normalize each clause after
 // splitting so an earlier safety instruction cannot hide a later request.
 return String(text??'').normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').split(/[.!?;\n,।。\u2028\u2029]+|\bbut\b|\bhowever\b/iu).map(part=>part.trim()).filter(Boolean);
}
export function safeSemanticTactic(tactic, f, text) {
 const actionNegated=/\b(?:never|do not|don't|avoid|must not|should not|not to|ignore)\b|\b(?:mat|nahi)\b|मत|नहीं/iu.test(text);
 if(['authority','urgency','threat','isolation'].includes(tactic))return !actionNegated || tactic==='isolation';
 if(actionNegated)return false;
 if(tactic==='credentials')return Boolean(f.secret&&f.disclose&&!f.official_app);
 if(tactic==='remote_access')return Boolean(f.remote&&!f.risk_notice);
 if(tactic==='investment')return Boolean(f.opportunity&&(f.multiplier||f.promise)&&!f.risk_notice);
 if(tactic==='refund')return Boolean(f.refund&&!f.settled);
 if(tactic==='fee')return Boolean(f.release&&(f.reward||f.opportunity||f.routing)&&!f.risk_notice);
 if(tactic==='payment')return Boolean(f.routing);
 if(tactic==='apk')return Boolean(f.install&&f.package);
 if(tactic==='verification')return Boolean(f.verify&&f.bank);
 return false;
}
