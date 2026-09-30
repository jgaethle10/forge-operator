import test from 'node:test';
import assert from 'node:assert/strict';
import { clipCapabilities, planClipJob, planDistributionCampaign } from './planner.mjs';

test('owned Clip capability edge contains no execution authority',()=>{
  const caps=clipCapabilities({origin:'https://clip.example'});
  assert.equal(caps.runtime,'yard_evercraft_compute');
  assert.equal(caps.commercial_boundary.public_checkout_authority,false);
  assert.equal(caps.commercial_boundary.payment_authority,false);
  assert.equal(caps.commercial_boundary.publishing_authority,false);
  assert.match(caps.gateway,/clip\.example\/api\/clip$/);
  assert.doesNotMatch(JSON.stringify(caps),/base44\.app/i);
});

test('oversized source routes to specialist handoff without media transfer',()=>{
  const plan=planClipJob({
    source_file_size_bytes:36*1024*1024,
    target_platforms:['facebook'],
    goal:'make social clips'
  });
  assert.equal(plan.status,'forensiscope_upstream_recommended');
  assert.equal(plan.overflow_route.product,'ForensiScope');
  assert.equal(plan.overflow_route.automatic_media_transfer,false);
  assert.equal(plan.execution_created,false);
  assert.equal(plan.payment_created,false);
  assert.equal(plan.publication_created,false);
});

test('unverified platforms remain holds',()=>{
  const plan=planClipJob({target_platforms:['tiktok','youtube']});
  assert.equal(plan.platform_execution.find((x)=>x.platform==='tiktok').state,'hold_not_verified');
  assert.match(plan.platform_execution.find((x)=>x.platform==='youtube').state,/authorization_canary_required/);
});

test('campaign planning cannot grant publication authority',()=>{
  const plan=planDistributionCampaign({
    objective:'revenue',
    target_platforms:['facebook','linkedin','instagram','youtube','tiktok']
  });
  assert.equal(plan.execution_created,false);
  assert.equal(plan.payment_created,false);
  assert.equal(plan.publication_created,false);
  for(const derivative of plan.campaign.derivatives){
    assert.equal(derivative.publication_authority,false);
  }
});
