import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const home=readFileSync(new URL('../public/reignite/index.html',import.meta.url),'utf8');
const organizer=readFileSync(new URL('../public/reignite/organizer/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../public/reignite/organizer/app.js',import.meta.url),'utf8');

function fakeNode(){
 const attributes=new Map([['aria-disabled','true'],['tabindex','-1']]);
 return {
  textContent:'',
  setAttribute(name,value){attributes.set(name,value)},
  removeAttribute(name){attributes.delete(name)},
  getAttribute(name){return attributes.get(name)},
 };
}
async function probe(fetcher){
 const link=fakeNode(),status=fakeNode(),calls=[];
 const document={getElementById(id){
   return id==='readinessLink'?link:id==='readinessStatus'?status:null;
 }};
 runInNewContext(script,{document,fetch:async(path,options)=>{
   calls.push({path,options});return await fetcher(path,options);
 }});
 await setImmediate();await setImmediate();
 return {link,status,calls};
}

test('one-stop organizer route is visible from festival front page but is not an event launch',()=>{
 assert.match(home,/href="\.\/organizer\/"/);
 assert.match(organizer,/<title>REIGNITE \| Organizer home<\/title>/);
 assert.match(organizer,/noindex,nofollow,noarchive/);
 assert.match(organizer,/SOURCE PREVIEW ONLY/);
 assert.match(organizer,/No hidden launch button/);
 assert.match(organizer,/no login, private permit records or live event status/);
 assert.match(organizer,/href="\.\.\/layout\/"/);
 assert.match(organizer,/id="readinessLink" href="\.\.\/readiness\/" aria-disabled="true" tabindex="-1"/);
 assert.doesNotMatch(organizer,/<form\b|payment|<iframe\b/);
 assert.match(organizer,/prefers-reduced-motion:reduce/);
});

test('readiness link remains unavailable when source branch is not yet in release',async()=>{
 const out=await probe(async()=>({ok:false,status:404,headers:{get(){return 'text/html'}},
  text:async()=>'<html>not found</html>'}));
 assert.equal(out.calls.length,1);
 assert.equal(out.calls[0].path,'../readiness/index.html');
 assert.equal(out.calls[0].options.credentials,'same-origin');
 assert.equal(out.link.getAttribute('aria-disabled'),'true');
 assert.equal(out.link.getAttribute('tabindex'),'-1');
 assert.match(out.status.textContent,/separate review branch/);
});
test('generic 200 SPA fallback cannot masquerade as current readiness preview',async()=>{
 const out=await probe(async()=>({ok:true,status:200,headers:{get(){return 'text/html; charset=utf-8'}},
  text:async()=>'<html><body>Welcome to some other page</body></html>'}));
 assert.equal(out.link.getAttribute('aria-disabled'),'true');
 assert.match(out.link.textContent,/not yet on this release/);
});
test('verified canonical preview from same release unlocks one read-only route',async()=>{
 const valid='SOURCE-ONLY PLANNING PREVIEW NOT LIVE STATUS REIGNITE / EVERCRAFT EVENTS noindex,nofollow,noarchive';
 const out=await probe(async()=>({ok:true,status:200,headers:{get(){return 'text/html; charset=utf-8'}},
  text:async()=>valid}));
 assert.equal(out.link.getAttribute('aria-disabled'),undefined);
 assert.equal(out.link.getAttribute('tabindex'),undefined);
 assert.match(out.link.textContent,/next five planning priorities/);
 assert.match(out.status.textContent,/not a live approval/);
});
test('network errors are a graceful held state, not a guessed approval',async()=>{
 const out=await probe(async()=>{throw Error('network_down')});
 assert.equal(out.link.getAttribute('aria-disabled'),'true');
 assert.match(out.status.textContent,/not been released together/);
});
test('organizer script cannot post, track people, or construct a third-party host',()=>{
 assert.doesNotMatch(script,/POST|localStorage|sessionStorage|document\.cookie|navigator\.sendBeacon|XMLHttpRequest/);
 assert.doesNotMatch(script,/google-analytics|base44|tinyfish|stripe|paypal/i);
 assert.match(script,/no-store/);
 assert.match(script,/SOURCE-ONLY PLANNING PREVIEW/);
});
