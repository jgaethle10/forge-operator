import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('HUDSON is served read-only by the owned Fabric runtime with a functioning same-origin JSON feed',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
 try{
  const redirect=await fetch(runtime.url+'/hudson',{redirect:'manual'});
  assert.equal(redirect.status,308);
  assert.equal(redirect.headers.get('location'),'/hudson/');

  const page=await fetch(runtime.url+'/hudson/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/^text\/html/);
  assert.match(page.headers.get('content-security-policy'),/script-src 'unsafe-inline'/);
  assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
  const html=await page.text();
  assert.match(html,/Nothing<br><em>gets lost/);
  assert.match(html,/activity\.json/);
  assert.match(html,/ANIMATED PATHS ARE NOT VERIFIED EVENTS/);

  const feed=await fetch(runtime.url+'/hudson/activity.json?t=probe');
  assert.equal(feed.status,200);
  assert.match(feed.headers.get('content-type'),/^application\/json/);
  assert.equal(feed.headers.get('cache-control'),'no-store');
  const data=await feed.json();
  assert.equal(data.schema,'evercraft.hudson.public-activity.v1');
  assert.ok(Array.isArray(data.events));
  for(const e of data.events){
   assert.equal(e.public,true);
   assert.equal(e.source_verified,true);
   assert.match(e.source_url,/^https:\/\/github\.com\/jgaethle10\/forge-operator\/commit\/[0-9a-f]{40}$/);
   assert.equal(e.kind,'public_git_source_change');
  }

  const head=await fetch(runtime.url+'/hudson/activity.json',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal((await head.text()).length,0);

  const denied=await fetch(runtime.url+'/hudson/private.json');
  assert.equal(denied.status,404);

  const health=await fetch(runtime.url+'/health').then(r=>r.json());
  assert.equal(health.hudson_public_path,'/hudson/');
  assert.equal(health.hudson_public_source_ready,true);
  assert.equal(health.hudson_public_feed_authority,'public_git_source_history_only');
 }finally{await runtime.close()}
});
