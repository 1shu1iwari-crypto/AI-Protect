// Additional AI-authored challenge fixtures, written after the model was
// frozen. No real messages or financial data. Not an independent benchmark.
const text=(channel,text)=>({channel,text});
const pay=(amount=2500,newPayee=true)=>({channel:'payment',payment:{amount,newPayee}});
const qr='upi://pay?pa=fixture@demo&am=2700&cu=INR';
const make=(id,name,scam,events,extra={})=>({id,name,scam,events,suite:'challenge',description:'AI-authored regression or paraphrase fixture; not real traffic.',...extra});
export const challenges=[
 make('mixed-negation','Secrecy beside a credential request',true,[text('call','Do not tell anyone, send your OTP to me right now.')]),
 make('newline-request','Safety advice followed by a new request',true,[text('message','Never share your PIN\nProvide your OTP to the agent.')]),
 make('hindi-otp','Hindi request for a secret',true,[text('message','अपना ओटीपी बताओ। जल्दी करो।')],{language:'hi'}),
 make('hinglish-otp','Hinglish credential request',true,[text('call','Apna OTP bhejo abhi.')],{language:'hinglish'}),
 make('kyc-link','Verification pressure then an unusual link',true,[text('message','SBI account blocked. Update KYC immediately.'),text('link','https://secure-bank-kyc.xyz/verify')]),
 make('kyc-inline','An unusual link inside the message',true,[text('message','Update KYC immediately or your account is blocked: https://bank-verification.xyz/kyc')]),
 make('refund-paraphrase','Cashback followed by an outgoing QR',true,[text('message','Your cashback is waiting.'),text('qr',qr)]),
 make('refund-no-amount','Refund QR without a fixed amount',true,[text('message','Receive your refund using this QR.'),text('qr','upi://pay?pa=fixture@demo&cu=INR')]),
 make('authority-remote','An official claim with remote control',true,[text('call','I am a bank official. Enable remote access for verification.')]),
 make('fee-escalation','A withdrawal fee before release',true,[text('message','Unlock withdrawal with a deposit.'),pay(19000)]),
 make('investment-large','Guarantee followed by a larger request',true,[text('message','Pakka profit. Paisa double.'),text('link','https://fixture.invalid/trading.apk'),pay(500),pay(60000)]),
 make('pressure-secret','Urgent transfer with secrecy',true,[text('message','Urgent. Keep this secret. Send money.'),pay(30000)]),
 make('zero-width-otp','Invisible character credential evasion',true,[text('message','Provide your O\u200bTP to me.')]),
 make('upper-case-refund','Case and whitespace variation',true,[text('message','  RECEIVE   YOUR   REFUND  '),text('qr',qr)]),
 make('soft-coercion','Soft coercion without supported tactic wording',true,[text('message','The clearance procedure needs funds in the holding reserve. The compliance window ends shortly.'),pay(42000)],{description:'Original known miss, retained verbatim as a semantic workflow regression.'}),
 make('implicit-yield','Implicit yield without an explicit guarantee',true,[text('message','Our allocation desk turns each unit into four. This private route is available to selected members.'),pay(35000)],{description:'Original known miss, retained verbatim as an implicit investment workflow regression.'}),
 make('negated-install','Advice against an app installation',false,[text('message','Never install this app from an unknown link.'),pay(700,false)]),
 make('negated-refund','Advice against refund QR scams',false,[text('message','Do not scan a QR to receive money.'),text('qr',qr),pay(2700,false)]),
 make('refund-credited-merchant','A credited refund then a restaurant bill',false,[text('message','Refund credited to your original payment method.'),pay(480,false)]),
 make('normal-registration','A normal registration invoice',false,[text('message','Pay the registration fee for the college sports event.'),pay(800,false)]),
 make('bank-pin-in-app','An official app PIN instruction',false,[text('message','Enter your PIN only in your official UPI app.'),pay(1500,false)]),
 make('hindi-safety','Hindi advice to keep an OTP private',false,[text('message','अपना ओटीपी मत बताओ।')],{language:'hi'}),
 make('hinglish-safety','Hinglish advice to keep an OTP private',false,[text('message','OTP mat bhejo. Kisi ko mat batao.')],{language:'hinglish'}),
 make('work-remote','Ordinary remote collaboration',false,[text('message','Use screen sharing for our coding workshop.')]),
 make('kyc-official','Unpressured verification reminder',false,[text('message','Update KYC in your existing official banking app when convenient.')]),
 make('normal-high-value','A high value known beneficiary',false,[text('message','Please pay the tuition invoice.'),pay(180000,false)]),
 make('normal-new-payee','A small new beneficiary',false,[text('message','Please send money for the team lunch.'),pay(450)]),
 make('normal-urgent','An urgent ordinary bill',false,[text('message','Urgent: pay our electricity bill today.'),pay(3100,false)]),
 make('honest-investing','Explicit risk and no promise',false,[text('message','Market returns are not guaranteed. Investments can lose value.'),pay(8000,false)]),
 make('return-processed','A refund already processed',false,[text('message','Your refund was processed yesterday.'),pay(600,false)]),
 make('normal-salary','Salary followed by rent',false,[text('message','Your salary is credited. Rent is due this week.'),pay(16000,false)]),
 make('normal-official','Official support preserves credentials',false,[text('call','Do not share your OTP, do not use remote access.'),pay(500,false)]),
];
