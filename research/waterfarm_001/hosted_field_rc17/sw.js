/** Aqua RC17: atomic, scope-bound, static-only offline shell.
 * CACHE VERSION MUST INCREMENT whenever the static source changes.
 * Browser cache is NEVER a measurement backup. No auto-takeover of open tabs.
 * Retain old version caches for older offline-controlled tabs; deliberate cleanup
 * only after independent device verification. No automatic deletion on activate.
 */
const CACHE='evercraft-aqua-field-rc17-static-v1';
const FILES=['','index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','app/app.js','app/core.mjs','app/journal.mjs','app/storage.mjs','app/readiness.mjs'];
const SCOPE=self.registration.scope;
const ASSETS=FILES.map(path=>new URL(path,SCOPE).href);
const APPROVED=new Set(ASSETS);
const offlineResponse=()=>new Response('Aqua static application unavailable offline. Your meter readings have not been changed.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'}});
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Precache is all-or-nothing as far as worker installation is concerned.
    // Failed addAll rejects installation. Existing controlling worker remains.
    await cache.addAll(ASSETS);
    for(const url of ASSETS){if(!(await cache.match(url)))throw new Error('Incomplete Aqua static application cache: '+url);}
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of ASSETS){if(!(await cache.match(url)))throw new Error('Refuse activation of partial Aqua cache');}
    // IMPORTANT: preserve prior caches. A still-open older tab may need its
    // original shell while offline. Do not delete a release on worker activation.
    // No clients.claim(): new worker shouldn't take over an active recording tab.
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  let url;
  try{url=new URL(request.url);}catch{return;}
  // Exact URL allowlist. Do not ignore query params or intercept unrelated
  // pages even if the same domain hosts other Evercraft applications.
  if(url.origin!==self.location.origin||url.search||!APPROVED.has(url.href))return;
  event.respondWith((async()=>{
    try{
      const cache=await caches.open(CACHE);
      const hit=await cache.match(request);
      if(hit)return hit;
      // Never load an unpinned network asset into a previously cached shell.
      // A missing release component must be an explicit HOLD, not mixed versions.
      return offlineResponse();
    }catch{return offlineResponse();}
  })());
});
