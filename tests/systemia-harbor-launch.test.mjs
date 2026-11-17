import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {HARBOR_SYSTEMIA_LAUNCH, validateHarborSystemiaLaunch} from '../systemia/distribution/harbor/systemia-launch.mjs';

const page=fs.readFileSync('public/systemia/index.html','utf8');

test('mobile navigation contains valid targets and a contact path',()=>{
  assert.doesNotMatch(page,/href="#what"/);
  assert.match(page,/class="nav-try" href="#try"/);
  assert.match(page,/class="nav-hire" href="#hire"/);
  assert.match(page,/@media\(max-width:360px\)/);
  assert.match(page,/min-height:44px/);
  assert.match(page,/class="task featured"/);
});

test('inquiry chooser personalizes a mailto without auto-submitting',()=>{
  for(const val of ['monthly_report','research','commercial','other'])
    assert.match(page,new RegExp('name="need" value="'+val+'"'));
  assert.match(page,/needsMap\[selectedNeed\(\)\]/);
  assert.match(page,/encodeURIComponent\(message\(\)\)/);
  assert.match(page,/nothing uploads or sends automatically/i);
  assert.doesNotMatch(page,/fetch\('https:\/\/.*\/api\/systemia\/inquiry/);
});

test('Harbor identity and release are explicit without claims of an active send',()=>{
  const state=validateHarborSystemiaLaunch();
  assert.equal(state.pass,true);
  assert.equal(state.postable,false);
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.distribution_agent,'Harbor');
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.former_agent_name,'Muse');
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.outcome.posted,false);
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.outcome.inquiries_count,null);
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.outcome.paid_sales_count,null);
  assert.equal(HARBOR_SYSTEMIA_LAUNCH.release_state.authenticated_harbor_transport_verified,false);
});

test('platforms stay in authorized brand scope and record media prerequisites',()=>{
  const kit=HARBOR_SYSTEMIA_LAUNCH;
  assert.deepEqual(Object.keys(kit.platforms),['facebook','instagram','linkedin','tiktok']);
  assert.match(kit.platforms.facebook.caption,/browser-based sales-report tool/);
  assert.match(kit.platforms.instagram.media,/9:16/);
  assert.match(kit.platforms.tiktok.media,/9:16/);
  assert.ok(kit.prohibited_brands.includes('ChristmasLightsUSA'));
  assert.equal(validateHarborSystemiaLaunch({
    ...kit,release_state:{...kit.release_state,publish_authorized:true},
  }).pass,false);
  assert.equal(validateHarborSystemiaLaunch({
    ...kit,outcome:{...kit.outcome,posted:true},
  }).pass,false);
});
