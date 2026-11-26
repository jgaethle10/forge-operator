import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setTimeout as sleep } from 'node:timers/promises';
import { makeReigniteReadinessSnapshot, renderReigniteReadinessHtml } from '../systemia/opportunity-fabric/reignite-readiness-page.mjs';

const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const siteRoot=resolve(repoRoot,'public/reignite');
const pages=['index.html','organizer/index.html','organizer/app.js','readiness/index.html',
             'layout/index.html','layout/app.js','layout/seed.json'];
const getFile=path=>readFileSync(join(siteRoot,path),'utf8');

test('unified source bundle contains one complete safe REIGNITE entry path',()=>{
 for(const file of pages)assert(getFile(file).length>100,'missing page '+file);
 const concept=getFile('index.html'),organizer=getFile('organizer/index.html');
 assert.match(concept,/href="\.\/organizer\/"/);
 assert.match(organizer,/href="\.\.\/layout\/"/);
 assert.match(organizer,/href="\.\.\/readiness\/"/);
 assert.match(concept,/noindex,nofollow,noarchive/);
 assert.match(organizer,/NO APPROVED EVENT/);
 assert.match(getFile('readiness/index.html'),/SOURCE-ONLY PLANNING PREVIEW/);
 assert.match(getFile('layout/index.html'),/NOT AN APPROVED SITE MAP/);
 assert.doesNotMatch(organizer,/<form\b|<iframe\b/);
});
test('organizer safety view is byte-identical to canonical event engine',()=>{
 const snapshot=makeReigniteReadinessSnapshot();
 const expected=renderReigniteReadinessHtml(snapshot);
 assert.equal(getFile('readiness/index.html'),expected,'No stale or duplicated readiness checklist');
 assert.equal(snapshot.total_checks,25);
 assert.equal(snapshot.missing,25);
 assert.equal(snapshot.event_approved,false);
 assert.equal(snapshot.ticket_sales_authorized,false);
 assert.equal(snapshot.charitable_collection_authorized,false);
 assert.equal(snapshot.external_contact_authorized,false);
 assert.equal(snapshot.next_actions[0].requirement,'venue_authority');
 assert.equal(snapshot.next_actions[1].requirement,'jurisdiction_and_event_hours');
 assert.equal(snapshot.all_checks.flatMap(x=>x.checks).length,25);
});
test('real same-origin navigation enables readiness only after integrated artifact exists',async t=>{
 const root=siteRoot;
 const server=createServer((req,res)=>{
   if(req.method!=='GET'){res.writeHead(405);return res.end()}
   const url=new URL(req.url,'http://127.0.0.1');
   const name=decodeURIComponent(url.pathname);
   const abs=resolve(root,'.'+name,(name.endsWith('/')?'index.html':''));
   if(!abs.startsWith(root+'/')){res.writeHead(403);return res.end()}
   let content;
   try{content=readFileSync(abs)}catch{res.writeHead(404);return res.end('not found')}
   const type=extname(abs)==='.html'?'text/html; charset=utf-8':
     extname(abs)==='.js'?'text/javascript; charset=utf-8':'application/octet-stream';
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(content);
 });
 await new Promise((resolve,reject)=>{
   server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const address=server.address();
 const base='http://127.0.0.1:'+address.port+'/organizer/';
 for(const p of ['../','../readiness/index.html','../layout/index.html']){
   const res=await fetch(new URL(p,base));
   assert.equal(res.status,200,p+' must be accessible from organizer directory');
   assert.match(res.headers.get('content-type'),/text\/html/);
 }
 const script=getFile('organizer/app.js');
 const attributes=new Map([['aria-disabled','true'],['tabindex','-1']]);
 const link={
   textContent:'',
   removeAttribute(key){attributes.delete(key)},
   setAttribute(key,value){attributes.set(key,value)},
   getAttribute(key){return attributes.get(key)}
 };
 const status={textContent:''};
 const doc={getElementById(id){return id==='readinessLink'?link:status}};
 const visited=[];
 runInNewContext(script,{
   document:doc,
   fetch:(url,opts)=>{
     const absolute=new URL(url,base);visited.push(absolute.href);
     return fetch(absolute,opts);
   }
 });
 for(let i=0;i<100&&link.getAttribute('aria-disabled')==='true';i++)await sleep(20);
 assert.equal(link.getAttribute('aria-disabled'),undefined,
   'canonical integrated readiness page must enable the organizer action');
 assert.equal(link.getAttribute('tabindex'),undefined);
 assert.equal(visited.length,1,'only one local readiness probe; no duplicate requests');
 assert.equal(visited[0],new URL('../readiness/index.html',base).href);
 assert.match(link.textContent,/next five planning priorities/);
 assert.match(status.textContent,/not a live approval/);
});
