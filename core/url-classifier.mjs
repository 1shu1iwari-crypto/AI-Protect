// Pure offline, privacy-safe URL risk evaluator trained on PhiUSIIL (235,795 URLs).
// Evaluates static lexical properties on-device with ZERO network lookups.
import model from './url-model.json' with { type: 'json' };

const SUSPICIOUS_TLDS = new Set(model.suspicious_tlds || ['xyz','top','click','zip','ru','gq','tk','ml','cf','ga','fit','rest','live','monster','cc','to']);
const FINANCIAL_KEYWORDS = model.financial_keywords || ['sbi','hdfc','icici','axis','pnb','rbi','npci','upi','paytm','phonepe','gpay','kyc','verify','verification','secure','login','banking','refund'];

export function extractStaticUrlFeatures(rawUrl) {
 let s = String(rawUrl || '').trim();
 if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
 let hostname = '', pathname = '', query = '';
 try {
  const u = new URL(s);
  hostname = u.hostname.toLowerCase();
  pathname = u.pathname || '';
  query = u.search || '';
 } catch {
  const match = s.match(/^(?:https?:\/\/)?([^/?#]+)(?:([^?#]*))?(?:\?(.*))?/i);
  if (match) {
   hostname = (match[1] || '').toLowerCase();
   pathname = match[2] || '';
   query = match[3] || '';
  }
 }

 const urlLength = s.length;
 const domainLength = hostname.length;
 const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ? 1.0 : 0.0;
 const parts = hostname.split('.');
 const subdomains = Math.max(0, parts.length - 2);
 const tld = parts.length > 1 ? parts[parts.length - 1] : '';
 const suspiciousTld = SUSPICIOUS_TLDS.has(tld) ? 1.0 : 0.0;
 
 const digits = (s.match(/\d/g) || []).length;
 const digitRatio = digits / Math.max(1, urlLength);
 const specials = (s.match(/[-_=?&%@]/g) || []).length;
 const specialRatio = specials / Math.max(1, urlLength);
 const isHttps = /^https:\/\//i.test(s) ? 1.0 : 0.0;
 const hasObfuscation = (s.includes('@') || s.includes('%') || pathname.includes('//')) ? 1.0 : 0.0;

 const sLower = s.toLowerCase();
 const finMatches = FINANCIAL_KEYWORDS.filter(kw => sLower.includes(kw)).length;
 const brandSpoofing = (finMatches > 0 && (subdomains > 1 || suspiciousTld === 1.0 || isIp === 1.0 || hostname.includes('-'))) ? 1.0 : 0.0;

 return {
  url_length_norm: Math.min(urlLength / 100.0, 3.0),
  domain_length_norm: Math.min(domainLength / 40.0, 3.0),
  is_ip: isIp,
  subdomain_count_norm: Math.min(subdomains / 4.0, 2.0),
  suspicious_tld: suspiciousTld,
  digit_ratio_scaled: Math.min(digitRatio * 4.0, 2.0),
  special_char_scaled: Math.min(specialRatio * 4.0, 2.0),
  is_https: isHttps,
  has_obfuscation: hasObfuscation,
  brand_spoofing: brandSpoofing,
  hostname,
  isIp: isIp === 1.0,
  suspiciousTld: suspiciousTld === 1.0
 };
}

import { parseAndAnalyzeUrl, extractRegisteredDomain } from './domain-parser.mjs';

export function evaluateUrlRisk(urlStr) {
 const feats = extractStaticUrlFeatures(urlStr);
 const domainAnalysis = parseAndAnalyzeUrl(urlStr);
 let z = model.intercept || 0;
 for (const [fName, weight] of Object.entries(model.weights || {})) {
  z += (feats[fName] || 0) * weight;
 }
 if (domainAnalysis.isBrandMismatch) {
  z += 2.5; // Strong boost for deceptive brand mismatch on registrable domain
 }
 const probability = 1 / (1 + Math.exp(-z));
 const threshold = model.decision_threshold || 0.65;
 return {
  probability: Math.round(probability * 1000) / 1000,
  isHighRisk: probability >= threshold || domainAnalysis.isBrandMismatch,
  features: feats,
  domainAnalysis
 };
}

export function classifyTextLinks(text) {
 const clean = String(text ?? '').normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
 const links = clean.match(/https?:\/\/[^\s<>"']+/gi) || [];
 let maxScore = 0;
 let unusualVerification = false;
 const linkAnalyses = [];
 for (const link of links) {
  try {
   const res = evaluateUrlRisk(link);
   linkAnalyses.push(res);
   if (res.probability > maxScore) maxScore = res.probability;
   if (res.isHighRisk || res.domainAnalysis?.isBrandMismatch) unusualVerification = true;
   // Lexical verification check for compatibility with legacy test assertions
   const u = new URL(link);
   const host = u.hostname.toLowerCase();
   const verification = /kyc|verify|verification|bank|secure|login/i.test(host + u.pathname);
   const unusual = /\.(xyz|top|click|zip|invalid)$/.test(host) || Boolean(u.username || u.password) || host.split('.').length > 4 || /^\d+\.\d+\.\d+\.\d+$/.test(host);
   if (verification && unusual) unusualVerification = true;
  } catch {}
 }
 return { unusualVerification, maxRiskScore: maxScore, linkCount: links.length, linkAnalyses };
}
