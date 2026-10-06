// Robust Public Suffix List (PSL) domain parser and deceptive brand analyzer.
// Handles multi-part suffixes (.co.in, .co.uk, etc.), brand spoofing, subdomain padding,
// percent encoding, homoglyphs/punycode, username '@' tricks, and redirect parameters.

export const KNOWN_MULTI_SUFFIXES = new Set([
  // India
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'gov.in', 'ac.in', 'edu.in', 'res.in', 'mil.in', 'nic.in',
  // UK
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'ac.uk', 'gov.uk', 'sch.uk',
  // Australia & NZ
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  // Japan & Asia
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  'com.my', 'net.my', 'org.my', 'gov.my', 'com.hk', 'net.hk', 'org.hk', 'gov.hk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  // Americas & Africa
  'com.br', 'net.br', 'org.br', 'gov.br', 'co.za', 'gov.za', 'org.za', 'gc.ca', 'qc.ca',
  // Common multi-part Cloud / Hosting platforms
  'github.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'web.app', 'firebaseapp.com'
]);

// Known legitimate domains for prominent financial institutions and brands
export const LEGIT_BRAND_DOMAINS = {
  sbi: ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com', 'sbi.in'],
  hdfc: ['hdfcbank.com', 'hdfc.com', 'hdfcbank.co.in'],
  icici: ['icicibank.com', 'icici.com'],
  axis: ['axisbank.com', 'axis.com'],
  pnb: ['pnbindia.in', 'pnb.co.in'],
  rbi: ['rbi.org.in'],
  paytm: ['paytm.com'],
  phonepe: ['phonepe.com'],
  gpay: ['google.com', 'pay.google.com'],
  amazon: ['amazon.in', 'amazon.com'],
  flipkart: ['flipkart.com'],
  apple: ['apple.com'],
  netflix: ['netflix.com']
};

export const BRAND_LABELS = {
  sbi: 'SBI',
  hdfc: 'HDFC Bank',
  icici: 'ICICI Bank',
  axis: 'Axis Bank',
  pnb: 'Punjab National Bank',
  rbi: 'Reserve Bank of India',
  paytm: 'Paytm',
  phonepe: 'PhonePe',
  gpay: 'Google Pay',
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  apple: 'Apple',
  netflix: 'Netflix'
};

const HOMOGLYPH_MAP = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j'
};

export function normalizeHostname(host) {
  let h = String(host || '').trim().toLowerCase();
  // Decode percent encoding in hostname if present (e.g. %73%62%69 -> sbi)
  try {
    if (h.includes('%')) h = decodeURIComponent(h);
  } catch {}
  // Replace Cyrillic/common lookalikes with Latin equivalents
  h = h.split('').map(char => HOMOGLYPH_MAP[char] || char).join('');
  return h;
}

/**
 * Extracts public suffix, registrable domain, and subdomain using PSL.
 */
export function extractRegisteredDomain(rawHost) {
  const host = normalizeHostname(rawHost);
  if (!host) return { hostname: '', publicSuffix: '', registeredDomain: '', subdomain: '', isIp: false };

  // IP address check
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return { hostname: host, publicSuffix: '', registeredDomain: host, subdomain: '', isIp: true };
  }

  const parts = host.split('.');
  if (parts.length <= 1) {
    return { hostname: host, publicSuffix: '', registeredDomain: host, subdomain: '', isIp: false };
  }

  let publicSuffix = '';
  let registeredDomain = '';
  let subdomain = '';

  // Check 2-part suffix (e.g. co.in, co.uk, pages.dev)
  if (parts.length >= 3) {
    const twoPart = parts.slice(-2).join('.');
    if (KNOWN_MULTI_SUFFIXES.has(twoPart)) {
      publicSuffix = twoPart;
      registeredDomain = parts.slice(-3).join('.');
      subdomain = parts.slice(0, -3).join('.');
      return { hostname: host, publicSuffix, registeredDomain, subdomain, isIp: false };
    }
  }

  // 1-part suffix (e.g. .com, .in, .support, .org, .xyz)
  publicSuffix = parts[parts.length - 1];
  registeredDomain = parts.slice(-2).join('.');
  subdomain = parts.slice(0, -2).join('.');

  return { hostname: host, publicSuffix, registeredDomain, subdomain, isIp: false };
}

/**
 * Parses full URL and analyzes adversarial manipulation and brand deception.
 */
export function parseAndAnalyzeUrl(rawUrl) {
  let raw = String(rawUrl || '').trim();
  let hasUserInfoTrick = false;
  let username = '';

  // Check for username '@' trick prior to standard URL parsing
  const atMatch = raw.match(/^(?:https?:\/\/)?([^/?#]+)@([^/?#]+)/i);
  if (atMatch) {
    hasUserInfoTrick = true;
    username = atMatch[1];
  }

  let parsed;
  try {
    let toParse = raw;
    if (!/^https?:\/\//i.test(toParse)) toParse = 'http://' + toParse;
    parsed = new URL(toParse);
  } catch {
    parsed = { hostname: '', pathname: '', search: '', username: '' };
  }

  const hostname = parsed.hostname ? parsed.hostname.toLowerCase() : '';
  const pathname = parsed.pathname || '';
  const search = parsed.search || '';

  const domainInfo = extractRegisteredDomain(hostname);
  const registeredDomain = domainInfo.registeredDomain;
  const subdomain = domainInfo.subdomain;

  // Adversarial indicators
  const isPercentEncoded = /%[0-9a-fA-F]{2}/.test(raw);
  const isPunycode = hostname.startsWith('xn--') || hostname.includes('.xn--');
  const hasHomoglyph = /[\u0400-\u04FF]/.test(raw);
  const isIpHost = domainInfo.isIp;
  const subdomainParts = subdomain ? subdomain.split('.') : [];
  const subdomainPadding = subdomainParts.length >= 3 || subdomain.length > 28;
  const pathTokens = pathname.split('/').filter(Boolean);
  const excessivePathTokens = pathTokens.length >= 5;
  const hasRedirectParam = /[?&](?:url|redirect|dest|destination|next|target|link|go)=https?:\/\//i.test(raw);

  // Deceptive Brand Detection
  let claimedBrand = null;
  let deceptiveText = null;
  let isBrandMismatch = false;
  let brandExplanation = null;

  // Search for brand cues in subdomain, path, or deceptive user trick
  const inspectTargets = [
    { source: 'subdomain', text: subdomain },
    { source: 'user', text: username },
    { source: 'path', text: pathname }
  ];

  for (const [brandKey, legitDomains] of Object.entries(LEGIT_BRAND_DOMAINS)) {
    const brandPattern = new RegExp(`\\b${brandKey}\\b|${brandKey}[-._]|[-._]${brandKey}`, 'i');
    
    // Check if brand is found in deceptive position (subdomain or userInfo)
    for (const target of inspectTargets) {
      if (brandPattern.test(target.text)) {
        // Is actual registeredDomain legitimate for this brand?
        const isLegit = legitDomains.includes(registeredDomain);
        if (!isLegit) {
          claimedBrand = BRAND_LABELS[brandKey] || brandKey.toUpperCase();
          // Find deceptive text pattern (e.g. sbi.co.in in secure-login.sbi.co.in)
          const nestedDomainMatch = target.text.match(new RegExp(`${brandKey}\\.[a-z0-9.-]+`, 'i'));
          deceptiveText = nestedDomainMatch ? nestedDomainMatch[0] : brandKey;
          isBrandMismatch = true;
          brandExplanation = `Claimed brand: ${claimedBrand}. Deceptive text: ${deceptiveText}. Actual registered domain: ${registeredDomain}`;
          break;
        }
      }
    }
    if (isBrandMismatch) break;
  }

  return {
    rawUrl: raw,
    hostname,
    registeredDomain,
    publicSuffix: domainInfo.publicSuffix,
    subdomain,
    isIpHost,
    claimedBrand,
    deceptiveText,
    isBrandMismatch,
    brandExplanation,
    adversarialIndicators: {
      subdomainPadding,
      isPercentEncoded,
      isPunycode,
      hasHomoglyph,
      hasUserInfoTrick,
      isIpHost,
      excessivePathTokens,
      hasRedirectParam
    }
  };
}
