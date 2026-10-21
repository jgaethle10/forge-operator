import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  auditGraphicsCapabilities,
  discoverGraphicsModules,
  requireCompleteGraphicsInventory,
} from './production-capability-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'systemia/graphics-command/production-capability-baseline.json'),'utf8'));

test('full graphics inventory includes EVERY source module in scoped departments',()=>{
  const found=discoverGraphicsModules(root);
  assert.deepEqual(found,[...baseline.modules].sort());
  const audit=requireCompleteGraphicsInventory(auditGraphicsCapabilities());
  assert.equal(audit.status,'inventoried_runtime_unverified');
  assert.equal(audit.sourceModuleCount,found.length);
  assert.equal(audit.newUninventoried.length,0);
  assert.equal(audit.missingFromCheckout.length,0);
  assert.ok(audit.features.length>=45);
  assert.equal(audit.profileCount,8);
  assert.equal(audit.missingProfileRequirements.length,0);
  assert.ok(audit.profiles.every(p=>p.status==='contract_only_not_runtime_verified'));
  assert.ok(audit.featuresWithTestFiles>20);
  assert.match(audit.digest,/^[a-f0-9]{64}$/);
  assert.match(audit.sourceTreeDigest,/^[a-f0-9]{64}$/);
});

test('toons, families, character rigs, lip sync, performance and original audio are tracked explicitly',()=>{
  const audit=auditGraphicsCapabilities();
  const ids=new Set(audit.features.map(f=>f.id));
  for(const required of [
    'family_cartoon_frontend','family_cartoon_backend','series_character_canon',
    'identity_fingerprinting','character_performance','dialogue_lipsync_admission',
    'world_skeletal_animation','world_geometry_bridge','pulsegrid_composition',
    'pulsegrid_audio_engine','world_spatial_audio','voice_provider','audio_master',
    'world_webgpu','virtual_production','narrative_film_pipeline','space_dudz_art_factory',
    'creative_council','clip_media_intake','clip_social_distribution',
  ]) assert.ok(ids.has(required),'missing important capability: '+required);
  assert.ok(audit.toonAndCharacterCapabilities.length>=8);
  assert.ok(audit.features.every(f=>f.present));
  assert.ok(audit.features.every(f=>f.generatedMediaVerified===false));
  assert.equal(audit.boundaries.sourcePresentIsNotRuntimeExecuted,true);
});

test('unknown new modules fail closed rather than silently escaping inventory',()=>{
  const shorter={...baseline,modules:baseline.modules.slice(1)};
  const audit=auditGraphicsCapabilities({baseline:shorter});
  assert.equal(audit.status,'inventory_drift_blocked');
  assert.equal(audit.newUninventoried.length,1);
  assert.throws(()=>requireCompleteGraphicsInventory(audit),/graphics_capability_inventory_drift:new:/);
});

test('missing modules, duplicates and invalid baselines fail closed',()=>{
  const addition={...baseline,modules:[...baseline.modules,'systemia/media-studio/not-real-animated-engine.ts']};
  const result=auditGraphicsCapabilities({baseline:addition});
  assert.deepEqual(result.missingFromCheckout,['systemia/media-studio/not-real-animated-engine.ts']);
  assert.throws(()=>requireCompleteGraphicsInventory(result),/missing:/);
  assert.throws(()=>auditGraphicsCapabilities({baseline:{...baseline,modules:[...baseline.modules,baseline.modules[0]]}}),/graphics_capability_baseline_duplicate/);
  assert.throws(()=>auditGraphicsCapabilities({baseline:{schema:'wrong',modules:[]}}),/graphics_capability_baseline_invalid/);
});

test('the source audit is deterministic when the checkout has not changed',()=>{
  const a=auditGraphicsCapabilities(),b=auditGraphicsCapabilities();
  assert.equal(a.digest,b.digest);
  assert.equal(a.sourceTreeDigest,b.sourceTreeDigest);
});

test('every production profile has a mandatory evidence gate, never a synthetic ready claim',()=>{
  const audit=auditGraphicsCapabilities();
  const profiles=new Map(audit.profiles.map(p=>[p.id,p]));
  for(const required of ['family_cartoon','documentary','commercial','interactive_world',
    'music_and_performance','social_creative','data_education','distribution']){
      const profile=profiles.get(required);
      assert.ok(profile,required);
      assert.ok(profile.requirements.length>=6);
      assert.ok(profile.evidence.length>=4);
      assert.equal(profile.missingRequiredFeatures.length,0);
      assert.equal(profile.executionVerified,false);
  }
  const cartoon=profiles.get('family_cartoon');
  assert.ok(cartoon.evidence.includes('body_hand_face_eyeline_visual_review'));
  assert.ok(cartoon.evidence.includes('viseme_voice_sync_receipt'));
});
