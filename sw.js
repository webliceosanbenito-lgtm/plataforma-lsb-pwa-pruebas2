// LSB PWA - static assets only. No auth, student information, academic responses or documents cached.
const STATIC_CACHE='lsb-public-assets-v3-navigation';
const ASSETS=['./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./manifest.webmanifest','./offline.html'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lsb-public-assets-')&&k!==STATIC_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(()=>caches.match('./offline.html')));
  return;
 }
 const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
 if(!ASSETS.some(asset=>asset.slice(2)===relative))return;
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
