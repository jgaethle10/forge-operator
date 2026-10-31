// Passage caches only public demo assets; local files are not encrypted.
const CACHE="passage-shell-v3";
const SHELL=["./","./index.html","./style.css","./app.mjs","./catalog.mjs","./article-text.mjs","./package-verifier.mjs","./package-ui.mjs","./catalog.json","./mark.svg","./manifest.webmanifest"];
const allowed=new Set(SHELL.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("passage-shell-")&&k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
 ]));
});
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!allowed.has(url.pathname)||url.search)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   // Updates and corrections win when a connection returns.
   const response=await fetch(new Request(request,{cache:"no-store"}));
   if(response.ok)await cache.put(request,response.clone());
   // Do not hide deliberate removal of an article or asset behind a stale cached copy.
   return response;
  }catch{
   return await cache.match(request)||new Response("Offline copy unavailable.",{status:503,headers:{"Content-Type":"text/plain;charset=utf-8"}});
  }
 })());
});
