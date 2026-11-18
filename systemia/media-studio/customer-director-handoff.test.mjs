import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {prepareCustomerDirectorHandoff,SCOPE_SCHEMA,writePrivateDirectorPacket}
  from './customer-director-handoff.mjs';

function inquiry(){
  return {schema:'evercraft.studio.inquiry.v1',
    id:'EC-STUDIO-0123456789ABCDEF0123',received_at:'2026-11-18T20:01:00Z',
    name:'Casey Example',email:'casey@example.test',company:'Example Bakery',
    project:'$50 launch-week 30-second social commercial pilot',
    goal:'Make a 30-second social commercial showing our real bakery and inviting people to ask about catering.',
    source:'commercial_studio_public_form',consent:true,
    state:'UNREVIEWED_NO_COMMITMENT',agent_execution_authorized:false,automated_payment:false};
}
async function scope(record){
  const first=await prepareCustomerDirectorHandoff({inquiry:record});
  return {schema:SCOPE_SCHEMA,inquiryReference:record.id,inquiryDigest:first.inquiryDigest,
    decision:'APPROVED_FOR_PLANNING_ONLY',reviewedBy:'authorized-operator',
    reviewReference:'private:review-fixture-001',brand:record.company,
    audience:'Customers looking for local catering',offer:'Ask for a catering quote',
    cta:'Request a quote',rightsEvidenceRefs:['private:rights-fixture-001'],
    formats:['9:16'],durationSec:30};
}
function sourceBrief(record,review,root){
  const assets=['bakery-open.mp4','baking.mp4','catering-table.mp4'].map((filename,i)=>{
    const file=path.join(root,filename);
    const bytes=Buffer.from('synthetic-test-fixture-only-'+i);
    fs.writeFileSync(file,bytes);
    return {id:'asset-'+i,path:file,mediaKind:'video',
      sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      rights:'owned',evidenceState:'observed',
      sourceRefs:['synthetic-private-fixture:'+i],subjects:[['oven','bakery'],['baking'],['catering']][i]};
  });
  return {schema:'evercraft.fallen.commercial-brief.v1',id:record.id,
    brand:review.brand,offer:review.offer,audience:review.audience,
    durationSec:30,formats:review.formats,sourceAssets:assets,
    scenes:[
      {id:'hook',beat:'hook',durationSec:4,assetId:'asset-0',
        intent:'Show the bakery storefront and real oven first',mustShowSubjects:['bakery'],
        voiceLine:'Meet your neighborhood bakery.',voiceMood:'warm welcome',
        scoreEnergy:.2,scoreMood:'curious'},
      {id:'proof',beat:'proof',durationSec:12,assetId:'asset-1',
        intent:'Show the people preparing the real food',mustShowSubjects:['baking'],
        voiceLine:'Fresh food made for your celebration.',voiceMood:'confident and kind',
        scoreEnergy:.6,scoreMood:'building'},
      {id:'cta',beat:'cta',durationSec:14,assetId:'asset-2',
        intent:'Show the finished catering display and next step',
        mustShowSubjects:['catering'],voiceLine:'Ask about catering for your next event.',
        voiceMood:'friendly invitation',scoreEnergy:.4,scoreMood:'resolved'}
    ]};
}
test('public inquiry remains data only; no Saban inventory or customer message before owner review',async()=>{
  const record=inquiry();
  const packet=await prepareCustomerDirectorHandoff({inquiry:record});
  assert.equal(packet.status,'AWAITING_OWNER_SCOPE');
  assert.equal(packet.inquiryReference,record.id);
  assert.equal(packet.sourceFirstPlan,null);
  assert.equal(packet.creativeCouncil,null);
  assert.equal(packet.boundaries.providerCallsPerformed,0);
  assert.equal(packet.boundaries.workOrderOpened,false);
  assert.equal(packet.boundaries.paymentAuthority,false);
  assert.equal(packet.boundaries.publishingAuthority,false);
  assert.ok(!('email' in packet));
});
test('operator-approved scope alone cannot pretend to have source footage',async()=>{
  const record=inquiry(),review=await scope(record);
  const packet=await prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review});
  assert.equal(packet.status,'AWAITING_VERIFIED_SOURCE_PLAN');
  assert.equal(packet.sourceFirstPlan,null);
  assert.equal(packet.creativeCouncil,null);
});
test('authorized, file-verified source-first plan reaches actual deterministic creative council without execution',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-director-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const record=inquiry(),review=await scope(record),brief=sourceBrief(record,review,root);
  const packet=await prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review,sourceBrief:brief});
  assert.equal(packet.status,'READY_FOR_OWNER_CREATIVE_REVIEW');
  assert.equal(packet.sourceFirstPlan.releaseGates.sourceDigestsVerified,true);
  assert.equal(packet.sourceFirstPlan.timeline.length,3);
  assert.equal(packet.sourceFirstPlan.sabanInventory.jobs.length,3);
  assert.equal(packet.creativeCouncil.status,'reconciled');
  assert.equal(packet.creativeCouncil.shot_count,3);
  assert.equal(Object.keys(packet.creativeCouncil.blueprints[0].creative_genome).length,14);
  assert.equal(packet.creativeCouncil.execution_boundary.provider_calls_performed,0);
  assert.equal(packet.boundaries.generatedAssets,0);
  assert.equal(packet.sourceFirstPlan.releaseGates.finalVideoMasterCreated,false);
  assert.equal(packet.sourceFirstPlan.releaseGates.publicationAuthority,false);
  assert.doesNotMatch(JSON.stringify(packet.creativeCouncil),/casey@example\.test/);
  assert.equal(fs.readdirSync(root).length,3,'planning cannot manufacture new media or receipts');
});
test('tampered, missing and misleading source assets fail closed before any Saban creative handoff',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-director-rejected-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const record=inquiry(),review=await scope(record),brief=sourceBrief(record,review,root);
  fs.appendFileSync(brief.sourceAssets[0].path,'unauthorized-edit');
  let packet=await prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review,sourceBrief:brief});
  assert.equal(packet.status,'BLOCKED_SOURCE_PLAN');
  assert.match(packet.blockingReason,/digest_mismatch/);
  assert.equal(packet.sourceFirstPlan,null);
  assert.equal(packet.creativeCouncil,null);
  brief.sourceAssets[0].sha256=crypto.createHash('sha256').update(fs.readFileSync(brief.sourceAssets[0].path)).digest('hex');
  brief.sourceAssets[0].mediaKind='image';
  packet=await prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review,sourceBrief:brief});
  assert.equal(packet.status,'BLOCKED_SOURCE_PLAN');
  assert.match(packet.blockingReason,/opening_real_action_required/);
  brief.sourceAssets[0].mediaKind='video';
  brief.sourceAssets[0].path='/definitely/not/a/valid/asset.mp4';
  packet=await prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review,sourceBrief:brief});
  assert.match(packet.blockingReason,/asset_unavailable/);
});
test('rejects unreviewed source injection, forged scope, stale digest, altered offer and fake consent',async t=>{
  const record=inquiry(),review=await scope(record);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-director-mismatch-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const brief=sourceBrief(record,review,root);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:record,sourceBrief:brief}),/unreviewed_source_brief/);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:record,ownerScope:{...review,decision:'APPROVED_FOR_PUBLISHING'}}),/owner_scope/);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:record,ownerScope:{...review,inquiryDigest:'0'.repeat(64)}}),/owner_scope/);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:record,ownerScope:review,sourceBrief:{...brief,offer:'Fake offer'}}),/source_brief_scope_mismatch/);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:{...record,consent:false}}),/record_not_admissible/);
  await assert.rejects(()=>prepareCustomerDirectorHandoff({inquiry:{...record,agent_execution_authorized:true}}),/record_not_admissible/);
});
test('private packet writes new owner-local file with restrictive mode, never overwrites or follows target symlink',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-director-packet-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const record=inquiry(),packet=await prepareCustomerDirectorHandoff({inquiry:record});
  const location=path.join(root,'private','review.json');
  assert.equal(writePrivateDirectorPacket(location,packet),location);
  assert.equal(fs.statSync(location).mode&0o777,0o600);
  assert.throws(()=>writePrivateDirectorPacket(location,packet),/EEXIST/);
  const link=path.join(root,'outlink');
  fs.symlinkSync(path.join(root,'private'),link,'dir');
  assert.throws(()=>writePrivateDirectorPacket(path.join(link,'next.json'),packet),/output_parent_symlink/);
});
