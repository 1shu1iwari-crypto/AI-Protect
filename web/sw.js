const CACHE='scamguard-v1';
const ASSETS=['/','/web/index.html','/web/styles.css','/web/fonts.css','/web/app.mjs','/web/analytics.mjs','/web/icon.svg','/web/manifest.json','/core/engine.mjs','/core/model.json','/simulator/scenarios.mjs','/evaluation/results.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.search||!ASSETS.includes(u.pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
