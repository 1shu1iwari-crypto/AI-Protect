// Dependency-free reproducible multi-label logistic training on derived concepts.
// These tiny synthetic seeds are separate from evaluation workflows. This model
// has finite lexical coverage; it is not a multilingual language model.
import {readFile,writeFile} from 'node:fs/promises';
import {FEATURE_NAMES,semanticFeatures} from '../core/semantic-features.mjs';
const seeds={
 authority:['A regulator needs a clearance check','The customs investigation officer is speaking','Police adhikari compliance check','बैंक अधिकारी जांच कर रहा है','The compliance team has an account inquiry'],
 urgency:['The deadline is close','The approval window closes in minutes','Jaldi action lo abhi','जल्दी करो अभी','This must be done right now'],
 threat:['There is a criminal warrant','Your account will be frozen','Account band ho jayega','गिरफ्तार करने का आदेश है','The clearance process requires a holding account before the compliance window closes'],
 isolation:['Keep it between us','Remain on this call and keep this secret','Kisi ko mat batana','किसी को मत बताना','Do not disconnect from this call'],
 credentials:['Read out the one time passcode','Forward your OTP for this check','PIN batao','अपना पासवर्ड भेजो','Share the password with this helper'],
 remote_access:['Enable remote control for support','Let the helpdesk control your device','Screen sharing chalu karo support ke liye','रिमोट चालू करो','Turn on AnyDesk to fix this'],
 investment:['A private trading allocation becomes four times larger','Every investment unit grows into three units','Private group ka paisa chaar guna','निवेश का पैसा चार गुना होगा','Selected members receive assured returns','Guaranteed profit from trading'],
 refund:['Your refund is ready to receive','The pending cashback will arrive through our QR','Paise wapas aayenge','आपके पैसे वापस मिलेंगे','रिफंड पाने के लिए आगे बढ़ो'],
 fee:['Release the task earnings with a fee','Deposit more to unlock the payout','Recovery payment unlocks lost funds','निकासी के लिए शुल्क जमा करो','Task deposit required for the reward'],
 payment:['Place funds in the custody account','Transfer to the reserve account','UPI payment jama karo','पैसे भेजो अभी','Send money to the safe account'],
 apk:['Enable our app package','Install this app to proceed','Download support.apk','यह ऐप डाउनलोड करो','Our app must be installed'],
 verification:['Renew the bank verification','Update account KYC','Bank account verify karo','केवाईसी अपडेट करो','Confirm your bank details']
};
const benign=[
 'Never provide your OTP','Do not reveal a passcode','अपना ओटीपी मत भेजो','OTP mat batao','Avoid remote control','Remote access mat karo',
 'Do not place funds in a holding account','Ignore the clearance process asking for money','Never invest in schemes promising four units from one',
 'Returns are not guaranteed and can lose value','निवेश में जोखिम है','Investment allocation has market risk','Classroom units become four squares on graph paper',
 'Refund already credited to your original payment','आपके पैसे मिल चुके हैं','No need to transfer money','Pay the college sports event registration fee',
 'Enter your PIN in your official UPI app','Update KYC in your existing official banking app','Send the meeting notes','Groceries will arrive this evening',
 'The account inquiry is informational','Urgent electricity invoice is due today','Bank service notice: transfers unavailable','Your salary is credited',
 'Workshop screen sharing for code review','Never install our app from strangers','Do not scan to receive money','The task is a school assignment'
];
const samples=Object.entries(seeds).flatMap(([label,items])=>items.map(text=>({text,labels:[label],origin:'AI-authored multilingual semantic seed'})));
// Explicit compositional examples teach the weak model what contexts combine.
samples.push(...[
 ['Our compliance officer requires funds in the holding account before the deadline',['authority','urgency','threat','payment']],
 ['The task reward requires a deposit to release withdrawal',['fee','payment']],
 ['Bank officer asks you to enable remote control',['authority','remote_access']],
 ['Private investment members get guaranteed profit',['investment']],
 ['Verify your bank KYC right now',['verification','urgency']],
 ['Never share a PIN. Forward your OTP to our agent',['credentials']],
 ['आपका खाता बंद होगा जल्दी पैसे भेजो',['threat','urgency','payment']]
].map(([text,labels])=>({text,labels,origin:'AI-authored compositional seed'})));
samples.push(...benign.map(text=>({text,labels:[],origin:'AI-authored safety/ordinary seed'})));
const xs=samples.map(s=>[1,...Object.values(semanticFeatures(s.text))]);
const weights={},intercepts={};
for(const label of Object.keys(seeds)){
 const ys=samples.map(s=>Number(s.labels.includes(label))), positives=ys.reduce((a,b)=>a+b,0);
 const w=Array(FEATURE_NAMES.length+1).fill(0);
 for(let epoch=0;epoch<1800;epoch++){
  const gradient=w.map((v,i)=>i?0.035*v:0);
  for(let n=0;n<xs.length;n++){
   const x=xs[n],z=x.reduce((s,v,i)=>s+v*w[i],0),p=1/(1+Math.exp(-z));
   const balance=ys[n]?xs.length/(2*positives):xs.length/(2*(xs.length-positives));
   for(let i=0;i<w.length;i++)gradient[i]+=(p-ys[n])*x[i]*balance/xs.length;
  }
  for(let i=0;i<w.length;i++)w[i]-=0.35*gradient[i];
 }
 intercepts[label]=Number(w[0].toFixed(7));weights[label]=w.slice(1).map(v=>Number(v.toFixed(7)));
}
const model={schema:1,kind:'multilingual-concept-logistic',version:1,provenance:'AI-authored synthetic training only; scores are uncalibrated; finite concept vocabulary',training_samples:samples.length,features:FEATURE_NAMES,threshold:0.70,intercepts,weights};
await writeFile(new URL('./semantic-training.json',import.meta.url),JSON.stringify(samples,null,2)+'\n');
await writeFile(new URL('../core/semantic-model.mjs',import.meta.url),'// Generated by node ml/train-semantic.mjs. No runtime downloads.\nexport default '+JSON.stringify(model)+';\n');
console.log(`Trained ${Object.keys(seeds).length} small semantic heads on ${samples.length} disclosed synthetic texts.`);
