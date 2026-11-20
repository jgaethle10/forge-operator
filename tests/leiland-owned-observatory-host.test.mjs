import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startLeilandObservatory,STATIC_PATHS,LEILAND_HOST_SCHEMA} from '../systemia/leiland/owned-observatory-host.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
async function runFixture(fn){
 const projectionRoot=await fs.mkdtemp(path.join(os.tmpdir(),'leiland-projections-'));
 let app;
 try{
  app=await startLeilandObservatory({publicRoot:root,publicationRoot:projectionRoot,port:0,
   releaseSha:'f5ed226945c55d29d518ba36c7ffec0b439b7f9b'});
  await fn({url:app.origin,projectionRoot});
 }finally{if(app)await app.close();await fs.rm(projectionRoot,{recursive:true,force:true})}
}
test('owned host serves the entire allowlisted Leiland architecture and KAIDANCE dependencies',async()=>{
 await runFixture(async({url})=>{
  const html=await fetch(url+'/leiland/');
  assert.equal(html.status,200);
  assert.match(await html.text(),/Watch intelligence/);
  assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal(html.headers.get('x-content-type-options'),'nosniff');
  for(const target of Object.keys(STATIC_PATHS)){
   const res=await fetch(url+target);
   assert.equal(res.status,200,'Missing '+target);
   assert.ok((await res.arrayBuffer()).byteLength>0);
  }
  const kaidance=await fetch(url+'/kaidance/');
  assert.equal(kaidance.status,200);
  assert.match(await kaidance.text(),/HEARTBEAT NOT CONNECTED/);
  const systemia=await fetch(url+'/systemia/');
  assert.equal(systemia.status,200);
  assert.match(await systemia.text(),/Meet Systemia/);
 });
});
test('runtime stays clearly unverified and has no public data when publisher is absent',async()=>{
 await runFixture(async({url})=>{
  const pulse=await fetch(url+'/kaidance/pulse.json');
  assert.equal(pulse.status,404);
  assert.equal(pulse.headers.get('cache-control'),'no-store');
  const feed=await (await fetch(url+'/leiland/feed.json?view=123')).json();
  assert.equal(feed.status,'not_connected');
  const health=await (await fetch(url+'/healthz')).json();
  assert.equal(health.schema,LEILAND_HOST_SCHEMA);
  assert.equal(health.external_https_verified,false);
  assert.equal(health.live_ai_inference_claim,false);
  assert.equal(health.public_runtime_authorized,false);
  assert.equal(health.transport,'loopback_only');
  assert.equal(health.source_commit,'f5ed226945c55d29d518ba36c7ffec0b439b7f9b');
 });
});
test('publishing a new vetted public JSON is visible immediately and not cached or fabricated',async()=>{
 await runFixture(async({url,projectionRoot})=>{
  await fs.mkdir(path.join(projectionRoot,'kaidance'));
  const pulse={schema:'evercraft.kaidance.public-pulse.v1',state:'healthy',cycle_number:1,
   last_completed_cycle:new Date().toISOString(),heartbeat_target_seconds:300,
   admitted_count:0,held_count:0,coverage_receipt_valid:true,field_attestation_verified:false,
   observed_at:new Date().toISOString(),published_at:new Date().toISOString()};
  await fs.writeFile(path.join(projectionRoot,'kaidance','pulse.json'),JSON.stringify(pulse));
  let res=await fetch(url+'/kaidance/pulse.json?view=first');
  assert.equal(res.status,200);
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.equal((await res.json()).cycle_number,1);
  pulse.cycle_number=2;
  await fs.writeFile(path.join(projectionRoot,'kaidance','pulse.json'),JSON.stringify(pulse));
  res=await fetch(url+'/kaidance/pulse.json?view=second');
  assert.equal((await res.json()).cycle_number,2);
  await fs.mkdir(path.join(projectionRoot,'leiland'));
  const report={schema:'evercraft.leiland.public-feed.v1',status:'not_connected',
   published_at:null,signals:{inference:{state:'unverified',observed_at:null,receipt_url:null},
    missions:{state:'unverified',observed_at:null,receipt_url:null}},events:[]};
  await fs.writeFile(path.join(projectionRoot,'leiland','feed.json'),JSON.stringify(report));
  const dynamic=await (await fetch(url+'/leiland/feed.json?view=fresh')).json();
  assert.equal(dynamic.status,'not_connected');
 });
});
test('host denies write APIs, unapproved files, traversal and symlinked publications',async()=>{
 await runFixture(async({url,projectionRoot})=>{
  const blocked=['/.git/config','/systemia/leiland/owned-pulse-publisher.mjs',
   '/kaidance/README.md','/leiland/README.md','/private/secret.json','/kaidance/.env',
   '/leiland/%2e%2e/kaidance/pulse.json','/leiland/%2fetc/passwd'];
  for(const p of blocked){
   const res=await fetch(url+p,{redirect:'manual'});
   assert.ok(res.status===404||res.status===400,'Unexpected route '+p+': '+res.status);
  }
  const post=await fetch(url+'/leiland/feed.json',{method:'POST',body:'spoofed observation'});
  assert.equal(post.status,405);
  assert.equal(post.headers.get('allow'),'GET, HEAD');
  const preflight=await fetch(url+'/kaidance/pulse.json',{method:'OPTIONS'});
  assert.equal(preflight.status,405);
  await fs.mkdir(path.join(projectionRoot,'kaidance'));
  const target=path.join(projectionRoot,'kaidance','pulse.json');
  const privateFile=path.join(projectionRoot,'secrets.json');
  await fs.writeFile(privateFile,JSON.stringify({api_key:'sensitive'}));
  await fs.symlink(privateFile,target);
  const res=await fetch(url+'/kaidance/pulse.json');
  assert.equal(res.status,404);
  assert.equal((await res.text()).includes('sensitive'),false);
 });
});
test('HEAD is supported and identical in metadata without a response body',async()=>{
 await runFixture(async({url})=>{
  const get=await fetch(url+'/leiland/brain.js');
  const head=await fetch(url+'/leiland/brain.js',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-length'),get.headers.get('content-length'));
  assert.equal(await head.text(),'');
  const rootRes=await fetch(url+'/',{redirect:'manual'});
  assert.equal(rootRes.status,302);
  assert.equal(rootRes.headers.get('location'),'/leiland/');
 });
});
test('no remote listener and no overlapping private publication roots',async()=>{
 const r=await fs.mkdtemp(path.join(os.tmpdir(),'leiland-private-invalid-'));
 try{
  await assert.rejects(()=>startLeilandObservatory({host:'0.0.0.0',port:0,publicRoot:root,publicationRoot:r}),/loopback/);
  await assert.rejects(()=>startLeilandObservatory({publicRoot:root,publicationRoot:root}),/separate_from_source_checkout/);
  await assert.rejects(()=>startLeilandObservatory({publicRoot:root,publicationRoot:r,releaseSha:'fake-commit'}),/release_commit_sha_invalid/);
 }finally{await fs.rm(r,{recursive:true,force:true})}
});

test('host refuses malformed and unexpectedly expanded public pulse files before public response',async()=>{
 await runFixture(async({url,projectionRoot})=>{
  await fs.mkdir(path.join(projectionRoot,'kaidance'));
  const target=path.join(projectionRoot,'kaidance','pulse.json');
  await fs.writeFile(target,'{"schema":"evercraft.kaidance.public-pulse.v1","private_secret":"DO-NOT-SERVE"}');
  let response=await fetch(url+'/kaidance/pulse.json');
  assert.equal(response.status,503);
  assert.equal((await response.text()).includes('DO-NOT-SERVE'),false);
  const pulse={schema:'evercraft.kaidance.public-pulse.v1',state:'healthy',cycle_number:20,
   last_completed_cycle:new Date().toISOString(),heartbeat_target_seconds:300,
   admitted_count:0,held_count:0,coverage_receipt_valid:true,field_attestation_verified:true,
   observed_at:new Date().toISOString(),published_at:new Date().toISOString(),
   private_customer_info:'NEVER-PUBLIC'};
  await fs.writeFile(target,JSON.stringify(pulse));
  response=await fetch(url+'/kaidance/pulse.json');
  assert.equal(response.status,503);
  assert.equal((await response.text()).includes('NEVER-PUBLIC'),false);
  delete pulse.private_customer_info;
  await fs.writeFile(target,JSON.stringify(pulse));
  response=await fetch(url+'/kaidance/pulse.json');
  assert.equal(response.status,200);
  assert.equal((await response.json()).cycle_number,20);
 });
});
test('host fails closed on unreviewed feed keys, sensitive event titles, and invalid JSON',async()=>{
 await runFixture(async({url,projectionRoot})=>{
  await fs.mkdir(path.join(projectionRoot,'leiland'));
  const target=path.join(projectionRoot,'leiland','feed.json');
  const now=new Date().toISOString();
  const receipt='https://github.com/jgaethle10/forge-operator/pull/2346';
  const feed={
   schema:'evercraft.leiland.public-feed.v1',published_at:now,status:'publisher_reported',
   signals:{inference:{state:'unverified',observed_at:null,receipt_url:null},
    missions:{state:'unverified',observed_at:null,receipt_url:null}},
   events:[{at:now,title:'Public milestone reviewed for Leiland',receipt_url:receipt}]
  };
  await fs.writeFile(target,'{unparseable-unsafe-raw');
  let response=await fetch(url+'/leiland/feed.json');
  assert.equal(response.status,503);
  await fs.writeFile(target,JSON.stringify({...feed,internal_node_address:'NEVER-PUBLISH'}));
  response=await fetch(url+'/leiland/feed.json');
  assert.equal(response.status,503);
  assert.equal((await response.text()).includes('NEVER-PUBLISH'),false);
  feed.events[0].title='Customer record token leaked publicly';
  await fs.writeFile(target,JSON.stringify(feed));
  response=await fetch(url+'/leiland/feed.json');
  assert.equal(response.status,503);
  feed.events[0].title='Public milestone reviewed for Leiland';
  await fs.writeFile(target,JSON.stringify(feed));
  response=await fetch(url+'/leiland/feed.json');
  assert.equal(response.status,200);
  const approved=await response.json();
  assert.equal(approved.events[0].title,'Public milestone reviewed for Leiland');
  assert.equal(approved.status,'publisher_reported');
 });
});
test('valid but stale public coordination state is served as stale evidence, not refreshed',async()=>{
 await runFixture(async({url,projectionRoot})=>{
  await fs.mkdir(path.join(projectionRoot,'kaidance'));
  const past=new Date(Date.now()-900000).toISOString();
  const pulse={schema:'evercraft.kaidance.public-pulse.v1',state:'healthy',cycle_number:17,
   last_completed_cycle:past,heartbeat_target_seconds:300,admitted_count:1,held_count:1,
   coverage_receipt_valid:true,field_attestation_verified:true,observed_at:past,published_at:past};
  await fs.writeFile(path.join(projectionRoot,'kaidance','pulse.json'),JSON.stringify(pulse));
  const response=await fetch(url+'/kaidance/pulse.json');
  assert.equal(response.status,200);
  assert.equal((await response.json()).published_at,past);
 });
});
