const CACHE='scamguard-v5';
const ASSETS=['/app','/web/index.html','/web/styles.css','/web/fonts.css','/web/app.mjs','/web/native-review.mjs','/web/qr.mjs','/web/vendor/jsQR.js','/web/analytics.mjs','/web/icon.svg','/web/icon-192.png','/web/icon-512.png','/web/manifest.json',
 '/core/engine.mjs','/core/constants.mjs','/core/input.mjs','/core/rules.mjs','/core/legacy-model.mjs','/core/evidence.mjs','/core/semantic.mjs','/core/semantic-features.mjs','/core/semantic-model.mjs','/core/workflow.mjs','/core/policy.mjs','/core/fingerprint.mjs','/core/explanations.mjs','/core/version.mjs','/core/review.mjs','/core/verification.mjs','/core/institution-registry.mjs','/core/model.json'];
// Share Target POST never reaches the server or a persistent cache. The
// single-use fragment token carries no content; worker memory expires in 60s.
const shares=new Map();let reviewContext=null;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('scamguard-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
 if(u.pathname==='/share'&&e.request.method==='POST'){
  e.respondWith((async()=>{
   try{
    const body=await e.request.formData(),fields=['title','text','url'].map(k=>body.get(k)||'');
    if(fields.some(v=>typeof v!=='string')||fields.join('\n').length>10000)return new Response('Share text or a URL under 10,000 characters.',{status:413});
    for(const [k,v] of shares)if(Date.now()-v.created>60000)shares.delete(k);
    if(shares.size>=5)shares.delete(shares.keys().next().value);
    const token=crypto.randomUUID();shares.set(token,{text:fields.filter(Boolean).join('\n'),created:Date.now()});setTimeout(()=>shares.delete(token),60000);
    return Response.redirect(self.location.origin+'/app#shared='+token,303);
   }catch{return new Response('Share unavailable. Open ScamGuard and paste the content.',{status:400});}
  })());return;
 }
 if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.search||!ASSETS.includes(u.pathname))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));
});
self.addEventListener('message',e=>{
 if(e.data?.type==='REVIEW_CONTEXT'&&e.source?.url?.startsWith(self.location.origin+'/')){reviewContext=e.data.review?{review:e.data.review,created:Date.now()}:null;return;}
 if(e.data?.type!=='TAKE_SHARE'||!e.ports[0]||!e.source?.url?.startsWith(self.location.origin+'/'))return;
 const share=shares.get(e.data.token);shares.delete(e.data.token);
 e.ports[0].postMessage(share&&Date.now()-share.created<=60000?{text:share.text,review:reviewContext&&Date.now()-reviewContext.created<1200000?reviewContext.review:null}:{error:'Shared content expired. Paste it again.'});
});
