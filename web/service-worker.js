const CACHE='nexus-alpha-v6';
const STATIC=['./','./index.html','./styles-1.css','./styles-2.css','./styles-3.css','./app-1.js','./app-2.js','./app-3.js','./app-4.js','./app-5.js','./manifest.webmanifest','./icon.svg','./icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isCode=/\.(?:js|css|html|webmanifest)$/.test(url.pathname)||event.request.mode==='navigate';
  if(isCode){
    event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request.mode==='navigate'?'./index.html':event.request,copy)).catch(()=>{})}return response}).catch(()=>caches.match(event.request.mode==='navigate'?'./index.html':event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response})));
});
