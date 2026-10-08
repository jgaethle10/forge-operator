import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWebsiteAuditV2 } from './build-website-audit-v2.mjs';

test('Website Audit v2 builds three hook families through the existing visual system',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'website-audit-v2-'));
  const result=await buildWebsiteAuditV2({outputRoot:root});
  assert.equal(result.manifest.scrollStopStatus,'pass');
  assert.equal(result.manifest.scrollStopScore,1);
  assert.equal(result.council.status,'reconciled');
  assert.equal(Object.keys(result.variantAssets).length,3);

  for(const name of [
    'poster-hook-traffic-customers-feed.svg',
    'poster-hook-traffic-customers-square.svg',
    'poster-hook-traffic-customers-story.svg',
    'poster-hook-before-rebuild-feed.svg',
    'poster-hook-before-rebuild-square.svg',
    'poster-hook-before-rebuild-story.svg',
    'poster-hook-more-traffic-feed.svg',
    'poster-hook-more-traffic-square.svg',
    'poster-hook-more-traffic-story.svg',
    'audio-brief-v2.json',
    'production-needs-v2.json',
    'visual-requests-v2.json',
    'clip-handoff-v2.json',
    'attention-pack-v2.json',
    'creative-council-v2-reconciliation.json',
  ]){
    assert.equal(fs.existsSync(path.join(result.dir,name)),true,name);
  }

  const beforeRebuild=fs.readFileSync(
    path.join(result.dir,'poster-hook-before-rebuild-feed.svg'),
    'utf8'
  );
  assert.match(beforeRebuild,/BEFORE YOU/);
  assert.match(beforeRebuild,/>\$49</);
  assert.doesNotMatch(beforeRebuild,/health score.*[0-9]/i);
});

test('Website Audit v2 stops before paid provider execution but produces routable production needs',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'website-audit-v2-audio-'));
  const result=await buildWebsiteAuditV2({outputRoot:root});
  assert.equal(result.audioBrief.providerExecutionState,'provider_ready_unrequested');
  assert.equal(result.audioBrief.paidGenerationAuthorized,false);
  assert.equal(result.productionInventory.providerExecutionState,'provider_ready_unrequested');
  assert.equal(result.productionInventory.paidGenerationAuthorized,false);
  assert.equal(result.productionInventory.jobs.length,3);

  const kinds=result.productionInventory.jobs.map(job=>job.need.kind).sort();
  assert.deepEqual(kinds,['music','sfx','speech']);
  for(const job of result.productionInventory.jobs){
    assert.equal(job.need.status,'planned');
    assert.deepEqual(
      job.need.requires,
      ['commercial_rights','provenance_receipt','timing_control']
    );
  }

  assert.equal(result.visualRequests.requests.length,2);
  assert.equal(result.visualRequests.requests.every(request=>request.task==='video'),true);
  assert.equal(result.visualRequests.requests.every(request=>request.durationSec===6),true);
  assert.equal(result.visualRequests.requests.every(request=>request.aspectRatio==='9:16'),true);
  assert.equal(result.visualRequests.requests.every(request=>request.candidateCount===4),true);
  assert.equal(result.visualRequests.requests.every(request=>request.modelDiversity===2),true);
  assert.equal(result.visualRequests.paidGenerationAuthorized,false);
  assert.equal(result.visualRequests.tournamentRequired,true);
  assert.equal(result.clipHandoff.publicationAuthority,false);
  assert.equal(result.manifest.publicationAuthority,false);
  assert.equal(result.manifest.offerUrl,'https://fabric.systemiacommandcenters.com/offers/website-audit');
  assert.equal(result.manifest.priceUsd,49);
});
