"""Data loader and benchmark curator for AI-Protect (ScamGuard).

Ingests real-world external corpora and RBI BE(A)WARE taxonomy:
1. SMSSpamCollection (5,574 messages: 4,827 real ham negatives, 747 spam)
2. PhiUSIIL Phishing URL Dataset (235,795 URLs with static lexical features)
3. Multilingual Indian ScamShield & RBI BE(A)WARE fraud families (EN, Hindi, Hinglish)
4. Leave-One-Family-Out holdout splits for zero-day generalization benchmarking
"""
import csv
import hashlib
import json
import os
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
EVAL_DATA_DIR = ROOT / 'evaluation/datasets'

# RBI BE(A)WARE Compendium Fraud Taxonomy
RBI_TAXONOMY = {
    'SG01': {'code': 'SG01', 'name': 'digital_arrest', 'label': 'Digital Arrest / Impersonation', 'tactics': ['authority', 'threat', 'isolation', 'payment']},
    'SG02': {'code': 'SG02', 'name': 'refund_reversal', 'label': 'Refund / QR Reverse Intent', 'tactics': ['refund', 'payment']},
    'SG03': {'code': 'SG03', 'name': 'remote_access', 'label': 'Remote Access / Device Control', 'tactics': ['authority', 'remote_access']},
    'SG04': {'code': 'SG04', 'name': 'fake_kyc_deadline', 'label': 'Fake Banking KYC Urgency', 'tactics': ['verification', 'threat', 'urgency', 'link_risk']},
    'SG05': {'code': 'SG05', 'name': 'credential_harvesting', 'label': 'Secret Credential Theft', 'tactics': ['credentials', 'urgency']},
    'SG06': {'code': 'SG06', 'name': 'investment_ponzi', 'label': 'Guaranteed Investment Return', 'tactics': ['investment', 'payment']},
    'SG07': {'code': 'SG07', 'name': 'task_advance_fee', 'label': 'Work-From-Home Advance Fee', 'tactics': ['fee', 'payment']},
    'SG08': {'code': 'SG08', 'name': 'social_impersonation', 'label': 'Emergency Distress / Friend Impersonation', 'tactics': ['urgency', 'payment']},
    'SG09': {'code': 'SG09', 'name': 'loan_harassment', 'label': 'Instant Loan / Contact Harvesting', 'tactics': ['threat', 'apk', 'payment']},
    'SG10': {'code': 'SG10', 'name': 'qr_intent_mismatch', 'label': 'Intent Contradiction (Claim Credit, Execute Debit)', 'tactics': ['refund', 'payment']},
    'SG11': {'code': 'SG11', 'name': 'apk_sideload', 'label': 'Trojanized Banking APK Sideload', 'tactics': ['verification', 'apk']},
    'SG12': {'code': 'SG12', 'name': 'safe_account_transfer', 'label': 'Safe / Reserve Account Coercion', 'tactics': ['authority', 'threat', 'payment']}
}


def load_sms_spam_collection(limit=None):
    """Load real SMS messages from data/SMSSpamCollection for false-alert benchmarking."""
    path = DATA_DIR / 'SMSSpamCollection'
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Extract sms+spam+collection.zip into data/")
    records = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f):
            parts = line.strip().split('\t', 1)
            if len(parts) == 2:
                label, text = parts
                records.append({
                    'id': f'uci_sms_{idx}',
                    'text': text,
                    'is_scam': 1 if label == 'spam' else 0,
                    'category': 'spam' if label == 'spam' else 'legitimate_ham',
                    'source': 'UCI SMS Spam Collection'
                })
                if limit and len(records) >= limit:
                    break
    return records


def get_phiusiil_domain_split(domain_str):
    """Deterministically partition URLs by registrable domain to prevent data leakage."""
    d = str(domain_str or '').lower().strip().removeprefix('www.')
    parts = d.split('.')
    reg = '.'.join(parts[-2:]) if len(parts) >= 2 else d
    h = int(hashlib.sha256(reg.encode('utf-8')).hexdigest()[:8], 16) % 100
    if h < 80:
        return 'train'
    elif h < 90:
        return 'val'
    return 'test'


def load_phiusiil_urls(limit=None, split='all'):
    """Load static URL features and labels from PhiUSIIL dataset with strict domain-level split."""
    path = DATA_DIR / 'PhiUSIIL_Phishing_URL_Dataset.csv'
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Extract phiusiil+phishing+url+dataset.zip into data/")
    records = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            domain = row.get('Domain', '')
            domain_split = get_phiusiil_domain_split(domain)
            if split != 'all' and domain_split != split:
                continue
            # label 1 = legitimate, 0 = phishing
            is_phishing = 1 if row.get('label') == '0' else 0
            records.append({
                'url': row.get('URL', ''),
                'domain': domain,
                'domain_split': domain_split,
                'tld': row.get('TLD', ''),
                'url_length': int(row.get('URLLength', 0) or 0),
                'domain_length': int(row.get('DomainLength', 0) or 0),
                'is_domain_ip': int(row.get('IsDomainIP', 0) or 0),
                'subdomain_count': int(row.get('NoOfSubDomain', 0) or 0),
                'has_obfuscation': int(row.get('HasObfuscation', 0) or 0),
                'digit_ratio': float(row.get('DegitRatioInURL', 0) or 0),
                'special_char_ratio': float(row.get('SpacialCharRatioInURL', 0) or 0),
                'is_https': int(row.get('IsHTTPS', 0) or 0),
                'bank_keyword': int(row.get('Bank', 0) or 0),
                'pay_keyword': int(row.get('Pay', 0) or 0),
                'crypto_keyword': int(row.get('Crypto', 0) or 0),
                'is_phishing': is_phishing
            })
            if limit and len(records) >= limit:
                break
    return records


def load_curated_multilingual_corpus():
    """Returns curated multilingual dataset covering English, Hindi, Hinglish mapped to RBI BE(A)WARE taxonomy."""
    corpus = [
        # SG01: Digital Arrest / Official Impersonation
        {"id": "rbi_01_01", "family": "SG01", "lang": "en", "text": "This is Inspector Sharma from Delhi Police Cyber Crime Unit. Your Aadhaar is implicated in an illegal money laundering probe.", "tactics": ["authority", "threat"], "is_scam": 1},
        {"id": "rbi_01_02", "family": "SG01", "lang": "hi", "text": "मैं सीबीआई हेडक्वार्टर से डीएसपी वर्मा बोल रहा हूँ। आपके बैंक खाते पर गैरकानूनी मनी लॉन्ड्रिंग की एफआईआर दर्ज हुई है।", "tactics": ["authority", "threat"], "is_scam": 1},
        {"id": "rbi_01_03", "family": "SG01", "lang": "hinglish", "text": "ACP Sharma bol raha hoon CBI branch se. Aapke documents ka misuse karke financial fraud hua hai. Immediate video call join karo.", "tactics": ["authority", "threat", "isolation"], "is_scam": 1},
        {"id": "rbi_01_04", "family": "SG01", "lang": "hinglish", "text": "Stay on video call for interrogation. Do not inform family or disconnected line or arrest warrant will be executed.", "tactics": ["threat", "isolation"], "is_scam": 1},
        {"id": "rbi_01_05", "family": "SG01", "lang": "en", "text": "Supreme Court digital arrest warrant issued against you. Deposit all liquid funds into RBI clearance escrow immediately.", "tactics": ["authority", "threat", "payment"], "is_scam": 1},

        # SG02: Refund Reversal / QR Scam
        {"id": "rbi_02_01", "family": "SG02", "lang": "en", "text": "Your ₹4,500 electricity overpayment refund is approved. Scan this QR code to receive the money directly into your account.", "tactics": ["refund"], "is_scam": 1},
        {"id": "rbi_02_02", "family": "SG02", "lang": "hi", "text": "आपका ₹3,200 का रिफंड पेंडिंग है। बैंक खाते में पैसे प्राप्त करने के लिए तुरंत क्यूआर कोड स्कैन करें।", "tactics": ["refund"], "is_scam": 1},
        {"id": "rbi_02_03", "family": "SG02", "lang": "hinglish", "text": "Aapka pending cashback release ho gaya hai. Paise lene ke liye QR scan karke PIN dalo, turant account me aayega.", "tactics": ["refund", "credentials"], "is_scam": 1},
        {"id": "rbi_02_04", "family": "SG02", "lang": "hinglish", "text": "Scan QR to credit ₹1,500 into your Google Pay wallet now. Offer valid for 15 minutes.", "tactics": ["refund", "urgency"], "is_scam": 1},

        # SG03: Remote Access Support
        {"id": "rbi_03_01", "family": "SG03", "lang": "en", "text": "This is HDFC technical support. Your net banking session is suspended. Install AnyDesk QuickSupport to resolve.", "tactics": ["authority", "remote_access"], "is_scam": 1},
        {"id": "rbi_03_02", "family": "SG03", "lang": "hinglish", "text": "Bank helpdesk se bol rahe hain. Server error fix karne ke liye TeamViewer install karke 9-digit code share kijiye.", "tactics": ["authority", "remote_access"], "is_scam": 1},
        {"id": "rbi_03_03", "family": "SG03", "lang": "hi", "text": "तकनीकी खराबी दूर करने के लिए स्क्रीन शेयरिंग ऐप डाउनलोड करें और सहायता अधिकारी को अनुमति दें।", "tactics": ["remote_access"], "is_scam": 1},

        # SG04: Fake KYC Deadline
        {"id": "rbi_04_01", "family": "SG04", "lang": "en", "text": "Dear customer, your SBI account will be permanently blocked within 24 hours due to pending KYC. Update at http://sbi-kyc-portal.xyz", "tactics": ["verification", "threat", "urgency", "link_risk"], "is_scam": 1},
        {"id": "rbi_04_02", "family": "SG04", "lang": "hinglish", "text": "Aapka bank account aaj raat 12 baje freeze ho jayega. Turant PAN card aur Aadhaar update karein: http://kyc-verify-bank.top", "tactics": ["verification", "threat", "urgency", "link_risk"], "is_scam": 1},
        {"id": "rbi_04_03", "family": "SG04", "lang": "hi", "text": "प्रिय ग्राहक, आपका बैंक खाता 12 घंटे में निलंबित हो जाएगा। पुनः सक्रिय करने के लिए सत्यापन लिंक पर क्लिक करें।", "tactics": ["verification", "threat", "urgency"], "is_scam": 1},

        # SG05: Credential Harvesting
        {"id": "rbi_05_01", "family": "SG05", "lang": "en", "text": "Urgent: High-value debit attempt detected. To cancel this unauthorized transaction, please state your 6-digit OTP immediately.", "tactics": ["urgency", "credentials"], "is_scam": 1},
        {"id": "rbi_05_02", "family": "SG05", "lang": "hinglish", "text": "Fraud transaction rokne ke liye turant phone par aaya hua OTP aur UPI PIN verify karwao.", "tactics": ["urgency", "credentials"], "is_scam": 1},
        {"id": "rbi_05_03", "family": "SG05", "lang": "hi", "text": "सुरक्षा जांच के लिए कृपया अपने मोबाइल पर आया वन-टाइम पासवर्ड (ओटीपी) हमारे प्रतिनिधि को बताएं।", "tactics": ["credentials"], "is_scam": 1},

        # SG06: Investment Ponzi / Guaranteed Return
        {"id": "rbi_06_01", "family": "SG06", "lang": "en", "text": "Exclusive SEBI-approved VIP trading group. 300% guaranteed weekly returns on institutional crypto allocations.", "tactics": ["investment"], "is_scam": 1},
        {"id": "rbi_06_02", "family": "SG06", "lang": "hinglish", "text": "Ghar baithe trading se rozana ₹5,000 kamayein. 100% pakka profit guarantee. Pehle ₹500 invest karke dekhein.", "tactics": ["investment", "payment"], "is_scam": 1},
        {"id": "rbi_06_03", "family": "SG06", "lang": "hi", "text": "सुनिश्चित रिटर्न योजना। आज ही ₹1,000 निवेश करें और 7 दिनों में ₹10,000 का निश्चित लाभ पाएं।", "tactics": ["investment", "payment"], "is_scam": 1},

        # SG07: Task / Advance Fee
        {"id": "rbi_07_01", "family": "SG07", "lang": "en", "text": "Congratulations! Your task balance is ₹48,500. Pay ₹2,500 refundable liquidity clearance fee to unlock withdrawal.", "tactics": ["fee", "payment"], "is_scam": 1},
        {"id": "rbi_07_02", "family": "SG07", "lang": "hinglish", "text": "Aapki salary withdrawal freeze hai. Payout unlock karne ke liye merchant activation fee deposit karni hogi.", "tactics": ["fee", "payment"], "is_scam": 1},
        {"id": "rbi_07_03", "family": "SG07", "lang": "hi", "text": "कमाई निकालने के लिए प्रोसेसिंग शुल्क जमा करना अनिवार्य है। शुल्क जमा होते ही कुल राशि क्रेडिट होगी।", "tactics": ["fee", "payment"], "is_scam": 1},

        # SG08: Social Impersonation / Emergency Distress
        {"id": "rbi_08_01", "family": "SG08", "lang": "en", "text": "Hi Uncle, I met with an emergency hospital accident. My phone broke, please UPI ₹25,000 to this doctor's number right now.", "tactics": ["urgency", "payment"], "is_scam": 1},
        {"id": "rbi_08_02", "family": "SG08", "lang": "hinglish", "text": "Bhai emergency hai, hospital me hoon. Immediate ₹10,000 is UPI id par transfer kar de, shaam ko wapas kar dunga.", "tactics": ["urgency", "payment"], "is_scam": 1},

        # SG09: Loan Harassment / Malicious APK
        {"id": "rbi_09_01", "family": "SG09", "lang": "en", "text": "Instant ₹50,000 loan approved with zero CIBIL check. Install FastCredit.apk from link to disburse within 5 minutes.", "tactics": ["apk", "payment"], "is_scam": 1},
        {"id": "rbi_09_02", "family": "SG09", "lang": "hinglish", "text": "Bina kisi document ke instant loan lein. Hamari safe loan app download karein: http://fast-rupee.apk", "tactics": ["apk", "link_risk"], "is_scam": 1},

        # SG10: QR Intent Mismatch (Claim Credit, Execute Debit)
        {"id": "rbi_10_01", "family": "SG10", "lang": "en", "text": "OLX buyer here. I am paying you advance ₹8,000 for sofa. Scan this UPI QR code and enter PIN to accept my payment.", "tactics": ["refund", "payment"], "is_scam": 1},
        {"id": "rbi_10_02", "family": "SG10", "lang": "hinglish", "text": "Bhaiya maine payment bhej di hai, aapke account me lene ke liye QR scan karke PIN daalna padega.", "tactics": ["refund", "credentials"], "is_scam": 1},

        # SG11: APK Sideload
        {"id": "rbi_11_01", "family": "SG11", "lang": "en", "text": "Income Tax Department refund notice: Install e-filing mobile app from link to claim tax refund directly.", "tactics": ["authority", "apk", "refund"], "is_scam": 1},
        {"id": "rbi_11_02", "family": "SG11", "lang": "hinglish", "text": "Bank reward points expire hone wale hain. Rewards redeem karne ke liye update.apk install karein.", "tactics": ["verification", "apk"], "is_scam": 1},

        # SG12: Safe Account Transfer
        {"id": "rbi_12_01", "family": "SG12", "lang": "en", "text": "Your bank account has been flagged for surveillance. Transfer all savings to RBI Designated Safe Holding Account #98234.", "tactics": ["authority", "threat", "payment"], "is_scam": 1},
        {"id": "rbi_12_02", "family": "SG12", "lang": "hinglish", "text": "Aapka account compromise ho gaya hai. Paise bachane ke liye turant safe verification account me transfer karein.", "tactics": ["authority", "threat", "payment"], "is_scam": 1},

        # Legitimate Negatives (Benign everyday communications, alerts, reminders, safety notices)
        {"id": "benign_01", "family": "BENIGN", "lang": "en", "text": "Reminder: Never share your OTP, PIN or CVV with anyone. Bank officials will never ask for secret credentials.", "tactics": [], "is_scam": 0},
        {"id": "benign_02", "family": "BENIGN", "lang": "hinglish", "text": "Savdhaan rahein: Apna OTP ya password kisi se share na karein. Bank kabhi aapse PIN nahi mangta.", "tactics": [], "is_scam": 0},
        {"id": "benign_03", "family": "BENIGN", "lang": "hi", "text": "सुरक्षा चेतावनी: कभी भी किसी अज्ञात व्यक्ति के साथ अपना ओटीपी या बैंक पासवर्ड साझा न करें।", "tactics": [], "is_scam": 0},
        {"id": "benign_04", "family": "BENIGN", "lang": "en", "text": "Your monthly salary of ₹65,000 has been credited to your HDFC savings account ending in 4102.", "tactics": [], "is_scam": 0},
        {"id": "benign_05", "family": "BENIGN", "lang": "hinglish", "text": "Mummy grocery ka payment maine grocery shop par kar diya hai ₹450.", "tactics": [], "is_scam": 0},
        {"id": "benign_06", "family": "BENIGN", "lang": "en", "text": "Hey, let's meet for dinner at 8pm at the usual restaurant. Call me when you leave office.", "tactics": [], "is_scam": 0},
        {"id": "benign_07", "family": "BENIGN", "lang": "en", "text": "Your electricity bill of ₹1,420 is due on 15th Oct. Pay securely via our official municipal portal.", "tactics": [], "is_scam": 0},
        {"id": "benign_08", "family": "BENIGN", "lang": "hinglish", "text": "Kal subah college project presentation hai, slide deck review kar lena ek baar.", "tactics": [], "is_scam": 0},
        {"id": "benign_09", "family": "BENIGN", "lang": "en", "text": "Your Amazon delivery package is out for delivery with courier partner. Track via the official app.", "tactics": [], "is_scam": 0},
        {"id": "benign_10", "family": "BENIGN", "lang": "en", "text": "Do not scan QR codes to receive money. Scanning a QR code only debits funds from your account.", "tactics": [], "is_scam": 0}
    ]
    return corpus


def create_leave_one_family_out_split(holdout_family='SG01'):
    """Partitions corpus into train/val and an unseen holdout family for zero-day generalization."""
    corpus = load_curated_multilingual_corpus()
    train_val = [x for x in corpus if x['family'] != holdout_family]
    holdout = [x for x in corpus if x['family'] == holdout_family]
    random.seed(42)
    random.shuffle(train_val)
    split_idx = int(len(train_val) * 0.8)
    return {
        'holdout_family': holdout_family,
        'holdout_meta': RBI_TAXONOMY.get(holdout_family, {}),
        'train': train_val[:split_idx],
        'val': train_val[split_idx:],
        'test_unseen_family': holdout
    }


if __name__ == '__main__':
    sms = load_sms_spam_collection(limit=10)
    print(f"Loaded {len(sms)} sample SMS records.")
    urls = load_phiusiil_urls(limit=10)
    print(f"Loaded {len(urls)} sample PhiUSIIL URL records.")
    curated = load_curated_multilingual_corpus()
    print(f"Loaded {len(curated)} curated multilingual samples across {len(RBI_TAXONOMY)} RBI families.")
    split = create_leave_one_family_out_split('SG01')
    print(f"Leave-one-family-out split for {split['holdout_family']}: Train={len(split['train'])}, Val={len(split['val'])}, Held-out Unseen={len(split['test_unseen_family'])}")
