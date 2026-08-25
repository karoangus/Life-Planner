const CACHE_NAME='life-planner-cache-v39';
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();});
const SHELL=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./app-version.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE_NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url); const version=u.pathname.endsWith('/app-version.json'); const index=u.pathname.endsWith('/index.html')||u.pathname.endsWith('/');
 if(version||index){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(index&&r.ok){const c=r.clone();caches.open(CACHE_NAME).then(x=>x.put(e.request,c));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));return;}
 e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE_NAME).then(k=>k.put(e.request,x));return r;}).catch(()=>caches.match('./index.html'))));
});
