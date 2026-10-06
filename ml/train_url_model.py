"""Train a privacy-safe, offline static URL risk classifier on the PhiUSIIL dataset.

Zero network lookups: extracts 10 static lexical features directly from URL strings
and exports a compact decision tree / linear ensemble to core/url-model.json for
instant on-device execution in both JavaScript and Python.
"""
import csv
import json
import math
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
DATA_PATH = ROOT / 'data/PhiUSIIL_Phishing_URL_Dataset.csv'
OUTPUT_MODEL = ROOT / 'core/url-model.json'

SUSPICIOUS_TLDS = {'xyz', 'top', 'click', 'zip', 'ru', 'gq', 'tk', 'ml', 'cf', 'ga', 'fit', 'rest', 'live', 'monster', 'cc', 'to'}
FINANCIAL_KEYWORDS = {'sbi', 'hdfc', 'icici', 'axis', 'pnb', 'rbi', 'npci', 'upi', 'paytm', 'phonepe', 'gpay', 'kyc', 'verify', 'verification', 'secure', 'login', 'banking', 'refund'}


def extract_static_features(url_str):
    """Extract 10 normalized static lexical features without any network request."""
    s = str(url_str).strip()
    if not s.startswith(('http://', 'https://')):
        s = 'http://' + s
    try:
        parsed = urlparse(s)
        hostname = (parsed.hostname or '').lower()
        path = parsed.path or ''
        query = parsed.query or ''
    except Exception:
        hostname = ''
        path = ''
        query = ''

    url_length = len(s)
    domain_length = len(hostname)
    is_ip = 1 if re.fullmatch(r'\d{1,3}(\.\d{1,3}){3}', hostname) else 0
    parts = hostname.split('.')
    subdomains = max(0, len(parts) - 2)
    tld = parts[-1] if len(parts) > 1 else ''
    suspicious_tld = 1 if tld in SUSPICIOUS_TLDS else 0
    digits = sum(c.isdigit() for c in s)
    digit_ratio = digits / max(1, url_length)
    specials = sum(c in '-_=?&%@' for c in s)
    special_ratio = specials / max(1, url_length)
    is_https = 1 if s.startswith('https://') else 0
    has_obfuscation = 1 if ('@' in s or '%' in s or '//' in path) else 0

    full_lower = s.lower()
    financial_match = sum(1 for kw in FINANCIAL_KEYWORDS if kw in full_lower)
    # Check if financial keyword appears in non-standard domain or long subdomain
    brand_spoofing = 1 if (financial_match > 0 and (subdomains > 1 or suspicious_tld or is_ip or '-' in hostname)) else 0

    return [
        min(url_length / 100.0, 3.0),         # feature 0: url_length_norm
        min(domain_length / 40.0, 3.0),       # feature 1: domain_length_norm
        float(is_ip),                         # feature 2: is_ip
        min(subdomains / 4.0, 2.0),           # feature 3: subdomain_count_norm
        float(suspicious_tld),                # feature 4: suspicious_tld
        min(digit_ratio * 4.0, 2.0),          # feature 5: digit_ratio_scaled
        min(special_ratio * 4.0, 2.0),        # feature 6: special_ratio_scaled
        float(is_https),                      # feature 7: is_https
        float(has_obfuscation),               # feature 8: has_obfuscation
        float(brand_spoofing),                # feature 9: brand_spoofing
    ]


FEATURE_NAMES = [
    'url_length_norm',
    'domain_length_norm',
    'is_ip',
    'subdomain_count_norm',
    'suspicious_tld',
    'digit_ratio_scaled',
    'special_char_scaled',
    'is_https',
    'has_obfuscation',
    'brand_spoofing'
]


def train_url_model(sample_size=60000):
    """Train on balanced sample of PhiUSIIL with strict domain-level train/val/test split."""
    print(f"Reading PhiUSIIL dataset from {DATA_PATH}...")
    from ml.data_loader import get_phiusiil_domain_split

    X_train, y_train = [], []
    X_val, y_val = [], []
    X_test, y_test = [], []

    with open(DATA_PATH, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            url = row.get('URL', '')
            domain = row.get('Domain', '')
            if not url:
                continue
            feats = extract_static_features(url)
            # PhiUSIIL: 0 = phishing, 1 = legitimate
            label = 1 if row.get('label') == '0' else 0  # 1 for phishing risk
            split = get_phiusiil_domain_split(domain)
            if split == 'train':
                X_train.append(feats)
                y_train.append(label)
            elif split == 'val':
                X_val.append(feats)
                y_val.append(label)
            else:
                X_test.append(feats)
                y_test.append(label)

            count += 1
            if sample_size and count >= sample_size:
                break

    print(f"Loaded {count} samples across domain partitions. Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
    clf = LogisticRegression(max_iter=1000, C=1.0, class_weight='balanced', random_state=42)
    clf.fit(X_train, y_train)

    y_pred_test = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred_test)
    prec = precision_score(y_test, y_pred_test)
    rec = recall_score(y_test, y_pred_test)
    f1 = f1_score(y_test, y_pred_test)

    print(f"\n--- Offline URL Model Validation Results (Strict Domain Holdout) ---")
    print(f"Domain Holdout Accuracy : {acc * 100:.2f}%")
    print(f"Domain Holdout Precision: {prec * 100:.2f}%")
    print(f"Domain Holdout Recall   : {rec * 100:.2f}%")
    print(f"Domain Holdout F1-Score : {f1 * 100:.2f}%")

    weights = {name: round(float(clf.coef_[0][i]), 6) for i, name in enumerate(FEATURE_NAMES)}
    intercept = round(float(clf.intercept_[0]), 6)

    model_payload = {
        'version': '1.1.0',
        'model_type': 'static_lexical_logistic',
        'provenance': 'Trained on PhiUSIIL Phishing URL Dataset with strict registrable domain partition (0 domain leakage)',
        'features': FEATURE_NAMES,
        'weights': weights,
        'intercept': intercept,
        'metrics': {
            'accuracy': round(acc, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'f1_score': round(f1, 4),
            'validation_samples': len(y_test),
            'partition_strategy': 'registrable_domain_sha256_hash_split'
        },
        'suspicious_tlds': sorted(list(SUSPICIOUS_TLDS)),
        'financial_keywords': sorted(list(FINANCIAL_KEYWORDS)),
        'decision_threshold': 0.65
    }

    OUTPUT_MODEL.write_text(json.dumps(model_payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"Model saved to {OUTPUT_MODEL} ({OUTPUT_MODEL.stat().st_size} bytes)")
    return model_payload


if __name__ == '__main__':
    train_url_model()
