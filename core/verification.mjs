import {institutionRegistry} from './institution-registry.mjs';

// Compatibility export for existing review snapshots; data and lookup live in the registry.
export const REGISTRY = institutionRegistry.institutions;
export const NEVER_ASK = [
  'Do not disclose an OTP, PIN, password or CVV to a person.',
  'Do not grant remote access because an unsolicited caller asks.',
  'Find support in the bank app you already use or on your bank card.'
];

const DECEPTIVE_KEYWORDS = /\b(?:kyc|pan|verify|verification|update|secure|unblock|apk|yono|support|netbanking)\b/i;

/**
 * Multi-dimensional financial communication verification.
 * Decouples claimed institution, domain consistency, media authenticity,
 * and independent caller authentication.
 */
export function verifyCommunication(text = '', claimedOrg = null, context = 'unknown', registry = institutionRegistry, options = {}) {
  const org = registry.findClaim(text, claimedOrg);
  const urls = String(text).match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];

  const domains = urls.slice(0, 12).map(raw => {
    try {
      const u = new URL(raw.startsWith('www.') ? 'https://' + raw : raw);
      const isHttps = u.protocol === 'https:' && !u.username && !u.password;
      const isRegisteredMatch = Boolean(org && registry.matchesDomain(org, u.hostname) && isHttps);

      // Lookalike domain & brand impersonation detection
      const host = u.hostname.toLowerCase();
      const brandToken = org ? org.id : (/\b(?:hdfc|icici|sbi|pnb|axis|rbi)\b/i.exec(String(text))?.[0]?.toLowerCase());
      const hasBrandSubstring = brandToken ? host.includes(brandToken) : false;
      const isLookalike = Boolean(!isRegisteredMatch && (hasBrandSubstring || DECEPTIVE_KEYWORDS.test(host)));

      let status = 'unknown';
      if (org) {
        status = isRegisteredMatch ? 'verified' : 'mismatch';
      }

      return {
        domain: u.hostname.slice(0, 253),
        status,
        is_lookalike: isLookalike,
        protocol: u.protocol.replace(':', '')
      };
    } catch {
      return {domain: 'unparseable', status: 'unknown', is_lookalike: false, protocol: 'unknown'};
    }
  });

  // Backward-compatible status (verified, mismatch, unverified, unknown)
  const status = !org
    ? 'unknown'
    : domains.some(d => d.status === 'mismatch')
      ? 'mismatch'
      : domains.length && domains.every(d => d.status === 'verified')
        ? 'verified'
        : 'unverified';

  // Upgraded distinct dimensions
  const hasLookalike = domains.some(d => d.is_lookalike);
  const domain_consistency = !domains.length
    ? 'not_checked'
    : hasLookalike
      ? 'lookalike_impersonation'
      : domains.some(d => d.status === 'mismatch')
        ? 'mismatch'
        : domains.every(d => d.status === 'verified')
          ? 'matches_registry'
          : 'unverified';

  const senderContext = ['unknown', 'user_known', 'unsolicited', 'independently_contacted'].includes(context)
    ? context
    : 'unknown';

  const caller_status = senderContext === 'independently_contacted'
    ? 'independent_channel_verified'
    : options.userConfirmedIdentity === true
      ? 'user_confirmed'
      : 'unverified';

  const media_authenticity = options.mediaAuthenticity?.authenticity_assessment || 'not_evaluated';

  const explanation = domain_consistency === 'lookalike_impersonation'
    ? 'High-risk lookalike domain detected mimicking institutional keywords. This domain does NOT belong to the authentic institution.'
    : status === 'verified'
      ? 'Domain matches the local registry only. This does not authenticate the sender, caller, page or payment.'
      : status === 'mismatch'
        ? 'A supplied domain does not match the claimed institution in the demo registry. Verify independently; this alone is not a fraud verdict.'
        : 'Identity is not authenticated. Use an independent channel.';

  return {
    claimed_org: org?.id || null,
    claimed_name: org?.name || (/\bbank|institution|rbi|sbi\b/i.test(text) ? 'Institution claimed; outside demo registry' : 'Not established'),
    status,
    domain_consistency,
    caller_status,
    media_authenticity,
    impersonation_risk: hasLookalike ? 'high' : domain_consistency === 'mismatch' ? 'elevated' : 'none',
    domains,
    sender_context: senderContext,
    support_contact: /\b(?:call|contact|helpline|support|whatsapp)\b.{0,35}(?:\+?\d[\d ()-]{6,}|@)/i.test(text)
      ? 'supplied_unverified'
      : 'not_provided',
    destination_type: /upi:\/\/pay/i.test(text)
      ? 'outgoing_upi_intent'
      : /\b(?:account|transfer|pay|payment)\b/i.test(text)
        ? 'payment_claim'
        : 'none',
    explanation,
    independent_url: org?.url || null
  };
}
