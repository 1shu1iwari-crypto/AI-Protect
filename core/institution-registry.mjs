// Human-maintained demonstration data. Extend records without changing the detector.
// A listed domain is a lexical match only; it does not authenticate its sender.
export const INSTITUTION_REGISTRY_DATA = Object.freeze({
 schema_version: 1,
 version: '2026-10-04',
 scope: 'curated_demo',
 institutions: Object.freeze([
  Object.freeze({id:'hdfc',name:'HDFC Bank',aliases:Object.freeze(['hdfc']),domains:Object.freeze(['hdfc.bank.in','hdfcbank.com']),url:'https://www.hdfc.bank.in/',source:'https://www.hdfc.bank.in/',checked_at:'2026-10-04'}),
  Object.freeze({id:'icici',name:'ICICI Bank',aliases:Object.freeze(['icici']),domains:Object.freeze(['icici.bank.in','icicibank.com']),url:'https://www.icici.bank.in/',source:'https://www.icici.bank.in/',checked_at:'2026-10-04'}),
  Object.freeze({id:'sbi',name:'State Bank of India',aliases:Object.freeze(['sbi','state bank of india','onlinesbi']),domains:Object.freeze(['sbi.co.in','sbi.bank.in','onlinesbi.sbi']),url:'https://sbi.co.in/',source:'https://sbi.co.in/',checked_at:'2026-10-08'}),
  Object.freeze({id:'pnb',name:'Punjab National Bank',aliases:Object.freeze(['pnb','punjab national bank']),domains:Object.freeze(['pnbindia.in','pnb.bank.in']),url:'https://www.pnbindia.in/',source:'https://www.pnbindia.in/',checked_at:'2026-10-08'}),
  Object.freeze({id:'axis',name:'Axis Bank',aliases:Object.freeze(['axis','axis bank']),domains:Object.freeze(['axisbank.com','axis.bank.in']),url:'https://www.axisbank.com/',source:'https://www.axisbank.com/',checked_at:'2026-10-08'}),
  Object.freeze({id:'rbi',name:'Reserve Bank of India',aliases:Object.freeze(['rbi','reserve bank of india']),domains:Object.freeze(['rbi.org.in']),url:'https://www.rbi.org.in/',source:'https://www.rbi.org.in/',checked_at:'2026-10-08'}),
  Object.freeze({id:'cybercrime',name:'National Cyber Crime Reporting Portal',aliases:Object.freeze(['cybercrime','national cyber crime','1930']),domains:Object.freeze(['cybercrime.gov.in']),url:'https://cybercrime.gov.in/',source:'https://cybercrime.gov.in/',checked_at:'2026-10-08'}),
  Object.freeze({id:'sancharsaathi',name:'Sanchar Saathi (DoT / Chakshu)',aliases:Object.freeze(['sanchar saathi','sancharsaathi','chakshu','trai']),domains:Object.freeze(['sancharsaathi.gov.in','trai.gov.in']),url:'https://www.sancharsaathi.gov.in/',source:'https://www.sancharsaathi.gov.in/',checked_at:'2026-10-08'})
 ])
});

function escaped(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function createInstitutionRegistry(data=INSTITUTION_REGISTRY_DATA){
 if(data?.schema_version!==1||typeof data.version!=='string'||!Array.isArray(data.institutions))throw Error('Unsupported institution registry.');
 const ids=new Set();
 const institutions=data.institutions.map(record=>{
  if(!record||!/^[a-z0-9_-]+$/.test(record.id)||ids.has(record.id)||typeof record.name!=='string'||!record.name.trim()||!Array.isArray(record.aliases)||!record.aliases.length||record.aliases.some(a=>typeof a!=='string'||!a.trim())||!Array.isArray(record.domains)||!record.domains.length||record.domains.some(d=>typeof d!=='string'||!d.includes('.')||!/^[a-z0-9.-]+$/.test(d)||d.startsWith('.')||d.endsWith('.')))throw Error('Invalid institution registry record.');
  const url=new URL(record.url);if(url.protocol!=='https:'||url.username||url.password||!record.domains.some(d=>url.hostname===d||url.hostname.endsWith('.'+d)))throw Error('Registry URL must use a listed HTTPS domain.');
  ids.add(record.id);
  return Object.freeze({...record,domains:Object.freeze([...record.domains]),aliases:new RegExp('\\b(?:'+record.aliases.map(escaped).join('|')+')\\b','i')});
 });
 return Object.freeze({
  version:data.version,scope:data.scope||'curated',institutions:Object.freeze(institutions),
  get(id){return institutions.find(o=>o.id===id)||null;},
  findClaim(text='',fallbackId=null){return institutions.find(o=>o.aliases.test(String(text)))||this.get(fallbackId);},
  matchesDomain(institution,hostname){return Boolean(institution?.domains.some(d=>hostname===d||hostname.endsWith('.'+d)));}
 });
}

export const institutionRegistry=createInstitutionRegistry();
