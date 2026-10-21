import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SCOPES=[
  'systemia/graphics-command','systemia/media-studio','systemia/world-engine',
  'systemia/visual-desk','systemia/clip','systemia/worldstate','systemia/capability-mesh'
];
const EXTRA_MODULES=[
  'src/FallenFamilyCartoon.tsx','src/FallenSessions.tsx','public/the-window/world.mjs',
  'systemia/saban/capability-fabric-composer.mjs',
  'systemia/saban/capability-promotion.mjs',
  'systemia/saban/performance-learning.mjs',
  'systemia/saban/production-capacity-plan.mjs',
  'systemia/saban/production-capacity-radar.mjs',
  'scripts/fabric-edge-visual-freshness.mjs'
];
const MODULE_EXT=/\.(?:mjs|js|ts|tsx|py)$/;
const NOT_MODULE=/\.test\.[cm]?[jt]sx?$|\.integration\.test\.[cm]?[jt]sx?$|\.proof\.[cm]?js$|\/assets\//;

const FEATURES=[
  ['family_cartoon_frontend','src/FallenFamilyCartoon.tsx','toon'],
  ['family_cartoon_backend','systemia/media-studio/family-http.ts','toon'],
  ['series_character_canon','systemia/media-studio/series.ts','toon'],
  ['identity_fingerprinting','systemia/media-studio/identity-fingerprint.ts','toon'],
  ['character_performance','systemia/media-studio/performance-director.ts','toon'],
  ['dialogue_lipsync_admission','systemia/media-studio/dialogue-sync-gate.ts','toon'],
  ['scene_continuity','systemia/media-studio/continuity-boundary.ts','toon'],
  ['world_skeletal_animation','systemia/world-engine/animation.ts','toon'],
  ['world_geometry_bridge','systemia/world-engine/fallen-geometry.ts','toon'],
  ['cinematic_sequence','systemia/media-studio/cinematic-sequence.ts','cinema'],
  ['virtual_production','systemia/media-studio/virtual-production.ts','cinema'],
  ['visual_observation','systemia/media-studio/visual-observer.ts','cinema'],
  ['shot_exploration','systemia/media-studio/shot-exploration.ts','cinema'],
  ['shot_tournament','systemia/media-studio/shot-tournament.ts','cinema'],
  ['sequence_aesthetic_jury','systemia/media-studio/sequence-aesthetic.ts','cinema'],
  ['narrative_film_pipeline','systemia/media-studio/narrative-film-pipeline.ts','cinema'],
  ['film_regression_lab','systemia/media-studio/film-regression-lab.ts','cinema'],
  ['creative_council','systemia/media-studio/creative-council-saban-adapter.mjs','orchestration'],
  ['department_router','systemia/media-studio/departments.ts','orchestration'],
  ['provider_model_fabric','systemia/media-studio/model-fabric.ts','orchestration'],
  ['visual_provider_runway','systemia/media-studio/visual-provider-runway.ts','orchestration'],
  ['visual_provider_sync','systemia/media-studio/visual-provider-sync.ts','orchestration'],
  ['visual_provider_elevenlabs','systemia/media-studio/visual-provider-elevenlabs.ts','orchestration'],
  ['saban_capability_composer','systemia/saban/capability-fabric-composer.mjs','orchestration'],
  ['saban_resource_placement','systemia/saban/production-capacity-plan.mjs','orchestration'],
  ['graphics_command','systemia/graphics-command/director.mjs','design'],
  ['graphics_production_mesh','systemia/graphics-command/production-mesh.mjs','design'],
  ['commercial_renderer','systemia/graphics-command/commercial-renderer.mjs','design'],
  ['design_tournament','systemia/graphics-command/shot-tournament.mjs','design'],
  ['space_dudz_art_factory','systemia/graphics-command/space-dudz-design-factory.mjs','toon'],
  ['visual_story_factory','systemia/visual-desk/factory.mjs','design'],
  ['world_materials','systemia/world-engine/texture.ts','world'],
  ['world_physics','systemia/world-engine/engine.ts','world'],
  ['world_webgpu','systemia/world-engine/webgpu.ts','world'],
  ['world_spatial_audio','systemia/world-engine/audio.ts','audio'],
  ['world_spatial_visuals','systemia/world-engine/visual.ts','world'],
  ['worldstate_data_projection','systemia/worldstate/phenomenon-bridge.mjs','world'],
  ['voice_provider','systemia/media-studio/audio-provider-elevenlabs.ts','audio'],
  ['audio_master','systemia/media-studio/audio-master.ts','audio'],
  ['pulsegrid_composition','systemia/media-studio/pulsegrid-session.ts','audio'],
  ['pulsegrid_audio_engine','systemia/media-studio/pulsegrid-audio.ts','audio'],
  ['render_worker','systemia/media-studio/render-worker/runtime.mjs','delivery'],
  ['timeline_export','systemia/media-studio/timeline-export.ts','delivery'],
  ['studio_master_qc','systemia/media-studio/master-qc.ts','delivery'],
  ['studio_delivery','systemia/media-studio/studio-delivery.ts','delivery'],
  ['clip_media_intake','systemia/clip/media-intake.mjs','delivery'],
  ['clip_social_distribution','systemia/clip/social-publisher-runtime.mjs','delivery'],
  ['owned_visual_desk_transporter','systemia/visual-desk/transporter.mjs','delivery'],
  ['family_social_safety','systemia/clip/family-social-safety.mjs','delivery'],
  ['interactive_world_experience','public/the-window/world.mjs','world']
];
const DIRECT_HANDOFF=new Set(['graphics_command','graphics_production_mesh','commercial_renderer','creative_council','owned_visual_desk_transporter','clip_media_intake']);

const hashBytes=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const clean=(s)=>String(s).split(path.sep).join('/');
function walk(root,rel,items){
  const dir=path.join(root,rel);
  if(!fs.statSync(dir,{throwIfNoEntry:false})?.isDirectory()) return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=clean(path.posix.join(rel,entry.name));
    if(entry.isDirectory()){
      if(!['node_modules','dist','.git','__pycache__','assets'].includes(entry.name)) walk(root,file,items);
    }else if(entry.isFile()&&MODULE_EXT.test(file)&&!NOT_MODULE.test(file)){
      items.push(file);
    }
  }
}
export function discoverGraphicsModules(root=REPO_ROOT){
  const items=[];
  for(const prefix of SCOPES) walk(root,prefix,items);
  for(const extra of EXTRA_MODULES) if(fs.statSync(path.join(root,extra),{throwIfNoEntry:false})?.isFile()) items.push(extra);
  return [...new Set(items)].sort();
}
function matchingTests(root,source){
  const dir=path.posix.dirname(source);
  const basename=path.posix.basename(source).replace(/\.(mjs|js|ts|tsx|py)$/,'');
  const tests=[
    dir+'/'+basename+'.test.mjs',dir+'/'+basename+'.test.ts',
    dir+'/'+basename+'.test.tsx',dir+'/'+basename+'.test.js'
  ];
  return tests.filter(file=>fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile());
}
function selectedCapabilityTest(root,source){
  if(source==='src/FallenFamilyCartoon.tsx') return ['systemia/media-studio/fallen-sessions-ui.test.ts','systemia/media-studio/family-http.test.ts'].filter(f=>fs.existsSync(path.join(root,f)));
  if(source==='systemia/media-studio/creative-council-saban-adapter.mjs') return ['systemia/media-studio/creative-council.test.ts'].filter(f=>fs.existsSync(path.join(root,f)));
  return matchingTests(root,source);
}
export function auditGraphicsCapabilities({root=REPO_ROOT, baseline}={}){
  const inventory=baseline??JSON.parse(fs.readFileSync(path.join(root,'systemia/graphics-command/production-capability-baseline.json'),'utf8'));
  if(inventory?.schema!=='evercraft.graphics-command.capability-baseline.v1' || !Array.isArray(inventory.modules)) throw new Error('graphics_capability_baseline_invalid');
  const observed=discoverGraphicsModules(root), expected=[...inventory.modules].sort();
  if(new Set(expected).size!==expected.length) throw new Error('graphics_capability_baseline_duplicate');
  const current=new Set(observed), known=new Set(expected);
  const newUninventoried=observed.filter(f=>!known.has(f));
  const missingFromCheckout=expected.filter(f=>!current.has(f));
  const features=FEATURES.map(([id,source,lane])=>{
    const present=current.has(source);
    const tests=present?selectedCapabilityTest(root,source):[];
    return {id,lane,source,present,tests,
      sourceAndTestsPresent:present&&tests.length>0,
      commercialMeshState:DIRECT_HANDOFF.has(id)?'preproduction_contract_only':'not_admitted_to_commercial_mesh',
      generatedMediaVerified:false};
  });
  const missingFeatures=features.filter(f=>!f.present).map(f=>f.id);
  const moduleHashes=observed.map(file=>[file,hashBytes(fs.readFileSync(path.join(root,file)))]);
  const sourceTreeDigest=hashBytes(JSON.stringify(moduleHashes));
  const core={
    schema:'evercraft.graphics-command.capability-audit.v1',
    status:newUninventoried.length||missingFromCheckout.length||missingFeatures.length?'inventory_drift_blocked':'inventoried_runtime_unverified',
    sourceModuleCount:observed.length, sourceTreeDigest,
    scopeDirectories:SCOPES, extraSources:EXTRA_MODULES,
    newUninventoried, missingFromCheckout, missingFeatures,
    features, featureCount:features.length,
    featuresWithTestFiles:features.filter(f=>f.sourceAndTestsPresent).length,
    featureWithoutDirectTest:features.filter(f=>!f.sourceAndTestsPresent).map(f=>f.id),
    toonAndCharacterCapabilities:features.filter(f=>f.lane==='toon').map(f=>f.id),
    boundaries:{
      testsPresentIsNotTestsPassed:true,
      sourcePresentIsNotRuntimeExecuted:true,
      localGitCheckoutOnly:true,
      externalProvidersAndAssetsNotInventoried:true,
      noCustomerReadyOrPublicationClaim:true,
    }
  };
  return {...core,digest:hashBytes(JSON.stringify(core))};
}
export function requireCompleteGraphicsInventory(audit){
  if(audit.status!=='inventoried_runtime_unverified'){
    throw new Error('graphics_capability_inventory_drift:'+[
      ...audit.newUninventoried.map(f=>'new:'+f),
      ...audit.missingFromCheckout.map(f=>'missing:'+f),
      ...audit.missingFeatures.map(f=>'feature:'+f),
    ].join('|'));
  }
  return audit;
}
