// AI-authored synthetic workflows, added for v0.4. No real customer content.
// This suite is reported separately from the unchanged original smoke/challenge
// cases. It exercises privacy/action/ordering regressions, not population accuracy.
const text=(channel,text,offset_ms)=>({channel,text,...(offset_ms===undefined?{}:{offset_ms})});
const pay=(amount=2500,newPayee=true,offset_ms)=>({channel:'payment',payment:{amount,newPayee},...(offset_ms===undefined?{}:{offset_ms})});
const make=(id,name,scam,events,extra={})=>({id,name,scam,events,suite:'adversarial',description:'AI-authored synthetic v0.4 regression; not independent real-world validation.',...extra});
export const adversarial=[
 make('soft-reserve-paraphrase','Indirect reserve transfer pressure',true,[text('call','To finish clearance, place the funds in a holding reserve. The compliance window closes shortly.'),pay(41000)]),
 make('soft-coercion-isolation','Indirect compliance pressure with isolation',true,[text('message','The clearance procedure requires funds in the holding reserve. Keep this between us until the compliance window closes.'),pay(43000)]),
 make('implicit-units-paraphrase','An implied multiplication of invested units',true,[text('message','Our private allocation desk grows every unit into four. Selected members can join this route.'),pay(36000)]),
 make('implicit-yield-escalation','Implied yield followed by increasing payments',true,[text('message','Our allocation desk turns each unit into four. This private route is available to selected members.'),pay(500),text('message','Your allocation is ready; deposit more to release the full payout.'),pay(60000)]),
 make('hindi-refund-unicode','Hindi refund leads to outgoing QR',true,[text('message','आपके पैसे वापस मिलेंगे। यह रिफंड है।'),text('qr','upi://pay?pa=synthetic@demo&am=1800&cu=INR')],{language:'hi'}),
 make('hindi-credential-unicode','Hindi secret credential request',true,[text('message','अपना ओटीपी बताओ। जल्दी करो।')],{language:'hi'}),
 make('hindi-pressure-unicode','Hindi threat and secrecy before a transfer',true,[text('call','मैं पुलिस अधिकारी हूँ। गिरफ्तार हो जाओगे। किसी को मत बताना।'),pay(27000)],{language:'hi'}),
 make('hinglish-coercion','Hinglish pressure precedes a transfer',true,[text('message','Account band ho jayega. Jaldi karo abhi. Kisi ko mat batana.'),text('call','Paise bhejo UPI se.'),pay(23000)],{language:'hinglish'}),
 make('hinglish-implicit-yield','Hinglish implied investment multiplication',true,[text('message','Private investment group mein har unit chaar guna ho jayega. Selected members ke liye allocation hai.'),pay(32000)],{language:'hinglish'}),
 make('fullwidth-secret','Fullwidth secret request with an invisible character',true,[text('message','Ｓｈａｒｅ your O\u200bTP with this agent.')]),
 make('zero-width-yield','Invisible-character evasion in an implied yield',true,[text('message','Our allo\u200bcation desk turns each unit into four. This private route is available to selected members.'),pay(34000)]),
 make('negation-then-secret','Safety advice followed by a separate secret request',true,[text('message','Never share your PIN. For this check, provide your OTP to our agent.')]),
 make('delayed-authority','Authority pressure assembled over 27 minutes',true,[text('call','I am a customs officer.',0),text('message','A criminal warrant is pending. Keep this secret.',9*60000),text('call','Transfer to a safe account.',18*60000),pay(39000,true,27*60000)]),
 make('delayed-task-recovery','Task deposit followed by withdrawal payment',true,[text('message','Complete our small task to earn a reward.',0),text('message','Pay the task deposit.',8*60000),pay(500,true,16*60000),text('message','Pay the withdrawal fee to unlock earnings.',24*60000),pay(9000,true,32*60000)]),
 make('support-financial-action','Remote support ends with a financial action',true,[text('call','I am a bank official and your refund is pending.'),text('message','Enable remote access so support can help.'),pay(5200)]),
 make('delayed-kyc-apk','KYC pressure leads to an app installation',true,[text('message','Update KYC immediately; your account will be blocked.',0),text('link','https://bank-verify.invalid/mobile.apk',12*60000)]),
 make('benign-urgent-bank-reminder','Ordinary urgent banking reminder',false,[text('message','Reminder: your card bill is due today. Pay through your existing official banking app.'),pay(12000,false)]),
 make('benign-bank-outage','Urgent banking outage notice requests no action',false,[text('message','Urgent service notice: transfers are temporarily unavailable. Do not share your OTP. Try your official banking app later.')]),
 make('benign-high-new-payee','High value new beneficiary without suspicious context',false,[text('message','Please pay the apartment purchase invoice to the new beneficiary we independently checked.'),pay(900000)]),
 make('benign-high-only','High payment alone',false,[pay(1000000)]),
 make('benign-hindi-safety-unicode','Hindi advice keeps credentials private',false,[text('message','अपना ओटीपी मत बताओ। किसी को मत भेजो।'),pay(1200,false)],{language:'hi'}),
 make('benign-hinglish-safety','Hinglish advice rejects credential and remote access requests',false,[text('message','OTP mat bhejo. Remote access mat karo.'),pay(800,false)],{language:'hinglish'}),
 make('benign-negated-yield','Safety advice rejects an implied-yield offer',false,[text('message','Do not invest with an allocation desk that turns each unit into four. Never send money to this private route.'),pay(600,false)]),
 make('benign-negated-reserve','Safety advice rejects an indirect reserve transfer',false,[text('message','Do not place funds in a holding reserve for clearance. Ignore any compliance window pressure.'),pay(750,false)]),
 make('benign-safety-refund-qr','Negated Hindi refund QR advice',false,[text('message','Do not scan a QR to receive a refund. Keep your money safe.'),text('qr','upi://pay?pa=shop@demo&am=650&cu=INR')]),
 make('benign-invoice-urgency','Ordinary urgent invoice to a new payee',false,[text('message','Urgent: pay the plumber invoice today, please.'),pay(2500)]),
 make('benign-classroom-multiplication','Mathematical multiplication is not an investment promise',false,[text('message','In our classroom exercise, turn each unit into four squares on graph paper.'),pay(500,false)]),
 make('benign-risk-disclaimer','Investment warning without promised yield',false,[text('message','Private investment allocations can lose value. Returns are not guaranteed; there is no fixed multiplication of units.'),pay(18000,false)]),
 make('benign-order-reversed','A completed ordinary payment precedes later passive suspicious text',false,[pay(3000,false),text('message','Someone advertised guaranteed return. We have not paid them.')]),
 make('benign-expired-pretext','An expired suspicious pretext cannot affect a later payment',false,[text('message','Receive your refund.',0),pay(5000,true,21*60000)]),
 make('benign-delay-rent','Ordinary reminder and rent across several channels',false,[text('message','Rent is due this week.',0),text('call','Thanks; the landlord invoice is correct.',10*60000),pay(28000,false,20*60000)]),
 make('benign-official-domain-risk-advice','Matching institution domain with safety advice',false,[text('message','HDFC https://www.hdfc.bank.in/help: never share your OTP and avoid remote access.'),pay(1400,false)]),
];
