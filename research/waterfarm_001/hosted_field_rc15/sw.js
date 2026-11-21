/** Aqua RC15: version-pinned, same-origin static cache. No data synchronization.
 * Offline cache is a convenience, NOT a field-data backup.
 */
const CACHE='evercraft-aqua-rc15-static-v1';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./app/app.js','./app/core.mjs','./app/journal.mjs','./app/storage.mjs'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('evercraft-aqua-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request,uri=new URL(req.url);
  if(req.method!=='GET'||uri.origin!==self.location.origin)return;
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req)).catch(()=>new Response('Offline content unavailable',{status:503,headers:{'Content-Type':'text/plain'}})));
});
