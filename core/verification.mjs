// Curated demonstration registry, checked 2026-10-03. Not a complete directory.
// A domain match verifies only the typed domain against this registry, never a caller.
export const REGISTRY = [
 {id:'hdfc',name:'HDFC Bank',aliases:/\bhdfc\b/i,domains:['hdfc.bank.in','hdfcbank.com'],url:'https://www.hdfc.bank.in/'},
 {id:'icici',name:'ICICI Bank',aliases:/\bicici\b/i,domains:['icici.bank.in','icicibank.com'],url:'https://www.icici.bank.in/'}
];
export const NEVER_ASK = ['Do not disclose an OTP, PIN, password or CVV to a person.', 'Do not grant remote access because an unsolicited caller asks.', 'Find support in the bank app you already use or on your bank card.'];
export function verifyCommunication(text='',claimedOrg=null,context='unknown') {
 const org=REGISTRY.find(o=>o.aliases.test(text))||REGISTRY.find(o=>o.id===claimedOrg);
 const urls=String(text).match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[];
 const domains=urls.slice(0,12).map(raw=>{try{const u=new URL(raw.startsWith('www.')?'https://'+raw:raw);const match=org?.domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));return {domain:u.hostname.slice(0,253),status:org?(match&&u.protocol==='https:'&&!u.username&&!u.password?'verified':'mismatch'):'unknown'};}catch{return {domain:'unparseable',status:'unknown'};}});
 const status=!org?'unknown':domains.some(d=>d.status==='mismatch')?'mismatch':domains.length&&domains.every(d=>d.status==='verified')?'verified':'unverified';
 return {claimed_org:org?.id||null,claimed_name:org?.name||(/\bbank|institution|rbi|sbi\b/i.test(text)?'Institution claimed; outside demo registry':'Not established'),status,domains,sender_context:['unknown','user_known','unsolicited','independently_contacted'].includes(context)?context:'unknown',caller_status:'unverified',support_contact:/\b(?:call|contact|helpline|support|whatsapp)\b.{0,35}(?:\+?\d[\d ()-]{6,}|@)/i.test(text)?'supplied_unverified':'not_provided',destination_type:/upi:\/\/pay/i.test(text)?'outgoing_upi_intent':/\b(?:account|transfer|pay|payment)\b/i.test(text)?'payment_claim':'none',explanation:status==='verified'?'Domain matches the local registry only. This does not authenticate the sender, caller, page or payment.':status==='mismatch'?'A supplied domain does not match the claimed institution in the demo registry. Verify independently; this alone is not a fraud verdict.':'Identity is not authenticated. Use an independent channel.',independent_url:org?.url||null};
}
