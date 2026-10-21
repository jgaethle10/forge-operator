import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildCommercialCampaign} from './commercial-renderer.mjs';
import {runAssignment,reconcile} from '../media-studio/creative-council-saban-adapter.mjs';
import {assembleGraphicsProductionMesh} from './production-mesh.mjs';

const source = JSON.parse(fs.readFileSync(
  new URL('./campaigns/website-audit-attention.json',import.meta.url),'utf8'
));

async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-graphics-mesh-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const built=buildCommercialCampaign(source,{outputRoot:root});
  const results=[];
  for(const job of built.plan.council.shots){
    for(const role of built.plan.council.roles){
      results.push(await runAssignment({
        assignment:{agent_id:'graphics-command:'+role,role,item:{shot:job.shot}}
      }));
    }
  }
  const reconciliation=await reconcile({results,plan:{roles:built.plan.council.roles}});
  fs.writeFileSync(path.join(built.dir,'creative-council-reconciliation.json'),
    JSON.stringify(reconciliation,null,2)+'\n');
  return {dir:built.dir,campaign:built.campaign,plan:built.plan,
    report:built.report,manifest:built.manifest,reconciliation};
}

test('Megazord verifies physical graphics assets, council, timeline and honest downstream boundaries',async(t)=>{
  const input=await fixture(t);
  const {receipt,jobpack}=assembleGraphicsProductionMesh(input);
  assert.equal(receipt.status,'preproduction_verified_downstream_blocked');
  assert.equal(receipt.customerReady,false);
  assert.equal(receipt.publicationAuthority,false);
  assert.equal(jobpack.departments.graphicsCommand.state,'verified_local_assets');
  assert.equal(jobpack.departments.worldEngine.state,'not_executed');
  assert.equal(jobpack.departments.fallenVisualStage.state,'html_stage_only');
  assert.equal(jobpack.departments.voiceFoundryAndScore.state,'not_executed');
  assert.equal(jobpack.departments.evercraftClip.state,'handoff_only');
  assert.equal(jobpack.frameCount,360);
  assert.equal(jobpack.shots.length,4);
  assert.equal(jobpack.shots[0].startFrame,0);
  assert.equal(jobpack.shots[3].startFrame+jobpack.shots[3].frameCount,360);
  assert.equal(receipt.artifacts.some((a)=>a.path==='motion.html'&&/^[a-f0-9]{64}$/.test(a.sha256)),true);
  assert.equal(fs.existsSync(path.join(input.dir,'production-mesh-receipt.json')),true);
  const first=receipt.digest;
  const again=assembleGraphicsProductionMesh(input);
  assert.equal(again.receipt.digest,first,'same inputs must yield identical receipt digests');
});

test('Megazord blocks missing posters and altered render API',async(t)=>{
  const input=await fixture(t);
  const poster=path.join(input.dir,'poster-story.svg');
  const originalPoster=fs.readFileSync(poster);
  fs.unlinkSync(poster);
  assert.throws(()=>assembleGraphicsProductionMesh(input),/graphics_mesh_asset_missing:poster-story.svg/);
  fs.writeFileSync(poster,'<svg width="1080" height="1920"></svg>');
  assert.throws(()=>assembleGraphicsProductionMesh(input),/graphics_mesh_svg_content_mismatch:story/);
  fs.writeFileSync(poster,originalPoster);
  const html=path.join(input.dir,'motion.html');
  fs.writeFileSync(html,'<html>Fake video evidence</html>');
  assert.throws(()=>assembleGraphicsProductionMesh(input),/graphics_mesh_exact_frame_api_missing/);
});

test('Megazord blocks forged source, council, clip and project digests',async(t)=>{
  const input=await fixture(t);
  assert.throws(()=>assembleGraphicsProductionMesh({...input,
    manifest:{...input.manifest,sourceRefs:['fabricated-source']}}),/graphics_mesh_source_lineage_mismatch/);
  assert.throws(()=>assembleGraphicsProductionMesh({...input,
    reconciliation:{...input.reconciliation,shot_count:3}}),/graphics_mesh_council_shot_count_mismatch/);
  assert.throws(()=>assembleGraphicsProductionMesh({...input,
    plan:{...input.plan,campaignDigest:'0'.repeat(64)}}),/graphics_mesh_campaign_plan_digest_mismatch/);
  assert.throws(()=>assembleGraphicsProductionMesh({...input,
    manifest:{...input.manifest,publicationAuthority:true}}),/graphics_mesh_publication_authority_must_be_false/);
  fs.writeFileSync(path.join(input.dir,'clip-handoff.json'),'{"publicationAuthority":true}');
  assert.throws(()=>assembleGraphicsProductionMesh(input),/graphics_mesh_clip_handoff_mismatch/);
});

test('Megazord rejects incomplete creative reconciliation even when overall status claims success',async(t)=>{
  const input=await fixture(t);
  const blueprints=input.reconciliation.blueprints.slice(1);
  const forged={...input.reconciliation,blueprints};
  fs.writeFileSync(path.join(input.dir,'creative-council-reconciliation.json'),
    JSON.stringify(forged,null,2)+'\n');
  assert.throws(()=>assembleGraphicsProductionMesh({...input,reconciliation:forged}),
    /graphics_mesh_council_shot_count_mismatch/);
});

test('Megazord rejects a seemingly reconciled council with no sound-director genome',async(t)=>{
  const input=await fixture(t);
  const brokenBlueprint={...input.reconciliation.blueprints[0],
    creative_genome:{...input.reconciliation.blueprints[0].creative_genome}};
  delete brokenBlueprint.creative_genome.sound;
  const forged={...input.reconciliation,
    blueprints:[brokenBlueprint,...input.reconciliation.blueprints.slice(1)]};
  fs.writeFileSync(path.join(input.dir,'creative-council-reconciliation.json'),
    JSON.stringify(forged,null,2)+'\n');
  assert.throws(()=>assembleGraphicsProductionMesh({...input,reconciliation:forged}),
    /graphics_mesh_council_genome_missing:sound_director/);
});
