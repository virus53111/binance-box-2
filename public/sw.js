self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.toLowerCase().includes("nexus")).map(key=>caches.delete(key)));
 await self.registration.unregister();
 const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 await Promise.all(clients.map(client=>client.navigate(client.url)));
})()));
