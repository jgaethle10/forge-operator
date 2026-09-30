import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSocialStore } from './store.mjs';
import { runEpsFacebookContinuity } from './eps-continuity.mjs';

function temp(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-social-'));
  return createSocialStore({stateDir:dir});
}

test('empty owned queue is a clean no-op',async()=>{
  const store=temp();
  const result=await runEpsFacebookContinuity({store,pageId:'123',publishEnabled:false,now:new Date('2026-09-30T20:00:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.no_op,true);
  assert.equal(result.reason,'no_eligible_scheduled_eps_content');
});

test('approved queued content holds before provider write unless explicitly enabled',async()=>{
  const store=temp();
  const pkg=await store.upsertPackage({id:'pkg1',body:'Hello Yakima',status:'approved',target_page_id:'123',target_page_name:'EPS'});
  await store.enqueue({id:'q1',package_id:pkg.id,platform:'facebook',status:'approved'});
  const result=await runEpsFacebookContinuity({store,pageId:'123',publishEnabled:false,now:new Date('2026-09-30T20:00:00Z')});
  assert.equal(result.held,true);
  assert.equal(result.external_action_taken,false);
  assert.equal(store.getPackage('pkg1').status,'approved');
});

test('Base44 links fail owned preflight',async()=>{
  const store=temp();
  const pkg=await store.upsertPackage({id:'pkg2',body:'See https://legacy.base44.app/story',status:'approved',target_page_id:'123'});
  await store.enqueue({id:'q2',package_id:pkg.id,platform:'facebook',status:'approved'});
  const result=await runEpsFacebookContinuity({store,pageId:'123',publishEnabled:false,now:new Date('2026-09-30T20:00:00Z')});
  assert.equal(result.ok,false);
  assert.ok(result.violations.includes('legacy_base44_url_not_publishable'));
  assert.equal(store.getPackage('pkg2').status,'failed');
});

test('three-hour cooldown is enforced from owned state',async()=>{
  const store=temp();
  await store.upsertPackage({id:'old',body:'Already published',status:'published',target_page_id:'123',published_at:'2026-09-30T19:00:00Z'});
  const pkg=await store.upsertPackage({id:'next',body:'Next post',status:'approved',target_page_id:'123'});
  await store.enqueue({id:'qnext',package_id:pkg.id,platform:'facebook',status:'approved'});
  const result=await runEpsFacebookContinuity({store,pageId:'123',publishEnabled:false,now:new Date('2026-09-30T20:00:00Z')});
  assert.equal(result.no_op,true);
  assert.equal(result.reason,'eps_180_minute_cooldown');
  assert.equal(store.getPackage('next').status,'approved');
});
