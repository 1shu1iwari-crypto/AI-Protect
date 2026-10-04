// Human-maintained demonstration data. Extend records without changing the detector.
// A listed domain is a lexical match only; it does not authenticate its sender.
export const INSTITUTION_REGISTRY_DATA = Object.freeze({
 schema_version: 1,
 version: '2026-10-04',
 scope: 'curated_demo',
 institutions: Object.freeze([
  Object.freeze({id:'hdfc',name:'HDFC Bank',aliases:Object.freeze(['hdfc']),domains:Object.freeze(['hdfc.bank.in','hdfcbank.com']),url:'https://www.hdfc.bank.in/',source:'https://www.hdfc.bank.in/',checked_at:'2026-10-04'}),
  Object.freeze({id:'icici',name:'ICICI Bank',aliases:Object.freeze(['icici']),domains:Object.freeze(['icici.bank.in','icicibank.com']),url:'https://www.icici.bank.in/',source:'https://www.icici.bank.in/',checked_at:'2026-10-04'})
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
