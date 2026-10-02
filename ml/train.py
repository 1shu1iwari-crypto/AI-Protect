"""Train an experimental binary word/bigram tactic model on disclosed synthetic text."""
import json, re, unicodedata
from pathlib import Path
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression

ROOT=Path(__file__).resolve().parents[1]
SEEDS={
'authority':['I am a police officer','This is the RBI department','CBI investigation unit speaking','Your bank official is calling','Customs officer calling about your parcel','SBI officer speaking'],
'urgency':['Act immediately','Do this right now','This is urgent','Your last chance is today only','Jaldi karo abhi','Complete this within 10 minutes'],
'threat':['You will be arrested','Your account will be blocked','A criminal warrant has been issued','We will freeze your funds','You face money laundering charges','Account band ho jayega'],
'isolation':['Do not disconnect','Keep this secret','Do not tell your family','Stay on the call','Kisi ko mat batana','Do not speak with anyone'],
'credentials':['Tell me your OTP','Share your PIN','Send your password','Enter your CVV here','OTP batao','PIN bhejo'],
'remote_access':['Install AnyDesk','Enable remote access','Turn on screen sharing','Open TeamViewer','Give me remote control','Share the screen with support'],
'investment':['Guaranteed return on investment','Double your money','Sure profit in this group','Institutional IPO with 30% return','Pakka profit milega','Paisa double investment plan'],
'refund':['Receive your refund','Scan to receive money','Cashback is waiting','Paise wapas milenge','Receive your pending refund today','Paisa milega QR scan karo'],
'fee':['Pay the registration fee','Task deposit required','Unlock withdrawal with a deposit','Send a withdrawal fee','Pay the release fee','Processing fee before earnings'],
'payment':['Transfer money to this account','Deposit to the safe account','Pay via UPI','Send money now','Payment is required','Paise bhejo'],
'apk':['Install our app','Download the app','Install this app','Open support.apk','Download trading.apk','Please install our app package']}
BENIGN=['Never share your OTP','Do not tell anyone your PIN','Your bank will never ask for your password','Avoid remote access software','The police do not ask for bank transfers','Dinner at seven tonight','Please send the class notes','Your salary has been credited','Your order has shipped','Meeting moved to tomorrow','Pay the school invoice through the official portal','Mum please send 2000 for groceries','Lunch payment to our usual restaurant','Market returns are not guaranteed','Contact your bank using its official number','Do not scan a QR to receive money','Keep your UPI PIN private','The training covers police and customs procedures','Refund credited to your original payment method','This investment involves market risk','No need to make a payment','The account was blocked by your own request','Reminder to pay rent','Your electricity bill is available','Never install apps from unknown links']
def normal(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s).lower()).strip()
def tokenize(s):
    w=re.findall(r'[^\W]+',normal(s),re.UNICODE)
    return list(set(w+[w[i]+' '+w[i+1] for i in range(len(w)-1)]))
samples=[]
for label,texts in SEEDS.items():
    for text in texts:
        samples.append({'text':text,'labels':[label],'origin':'AI-authored synthetic seed'})
        samples.append({'text':'Hello. '+text+'. Please respond.','labels':[label],'origin':'synthetic seed wrapper'})
samples.extend({'text':s,'labels':[],'origin':'AI-authored benign seed'} for s in BENIGN)
vector=CountVectorizer(analyzer=tokenize,binary=True)
x=vector.fit_transform([s['text'] for s in samples])
model={'version':'0.1.0','kind':'binary-word-bigram-logistic','provenance':'AI-authored synthetic only; not calibrated for real traffic','training_samples':len(samples),'weights':{},'intercepts':{}}
for label in SEEDS:
    y=[int(label in s['labels']) for s in samples]
    clf=LogisticRegression(C=2,class_weight='balanced',random_state=42,max_iter=1000).fit(x,y)
    model['weights'][label]={t:round(float(v),7) for t,v in zip(vector.get_feature_names_out(),clf.coef_[0]) if abs(v)>0.00001}
    model['intercepts'][label]=float(clf.intercept_[0])
(ROOT/'ml/training.json').write_text(json.dumps(samples,indent=2,ensure_ascii=False)+'\n')
(ROOT/'core/model.json').write_text(json.dumps(model,separators=(',',':'),ensure_ascii=False)+'\n')
print(f'Trained {len(SEEDS)} tactic heads on {len(samples)} synthetic texts. Model: {(ROOT/"core/model.json").stat().st_size} bytes. No real-world accuracy claim.')
