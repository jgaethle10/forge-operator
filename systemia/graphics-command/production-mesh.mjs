import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {renderCommercialPoster, renderCommercialMotion} from './commercial-renderer.mjs';
import {fileURLToPath} from 'node:url';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashJson = (value) => sha256(JSON.stringify(value));
const hex64 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const unique = (values) => [...new Set(values)];

function assert(condition, code) {
  if (!condition) throw new Error('graphics_mesh_' + code);
}
function readAsset(root, name) {
  assert(!name.includes('/') && !name.includes('\\') && !name.startsWith('.'), 'unsafe_asset_name');
  const file = path.join(root, name);
  assert(fs.statSync(file, {throwIfNoEntry: false})?.isFile(), 'asset_missing:' + name);
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 0, 'asset_empty:' + name);
  return {name, bytes, sha256: sha256(bytes), sizeBytes: bytes.length};
}
function textArtifact(root, name) {
  const asset = readAsset(root, name);
  return {...asset, text: asset.bytes.toString('utf8')};
}
function verifyPoster(root, name, width, height) {
  const artifact = textArtifact(root, name);
  assert(artifact.text.startsWith('<svg'), 'svg_root_invalid:' + name);
  assert(artifact.text.includes('width="' + width + '"') && artifact.text.includes('height="' + height + '"'), 'svg_dimensions_mismatch:' + name);
  assert(!/<script\b|<foreignObject\b|onload\s*=/i.test(artifact.text), 'svg_unsafe_markup:' + name);
  return {path:name, sha256:artifact.sha256, sizeBytes:artifact.sizeBytes, width, height, kind:'svg'};
}
function verifyCouncil(plan, reconciliation) {
  assert(reconciliation?.schema === 'evercraft.fallen.creative-council-reconciliation.v1', 'council_schema_invalid');
  assert(reconciliation.status === 'reconciled' && reconciliation.blocked_shot_count === 0, 'council_blocked');
  assert(reconciliation.execution_boundary?.provider_calls_performed === 0, 'council_execution_boundary_invalid');
  const expected = plan?.council?.shots?.map((job) => job.shot.id) || [];
  assert(expected.length > 0 && expected.length === unique(expected).length, 'plan_shots_invalid');
  const blueprints = reconciliation.blueprints || [];
  assert(reconciliation.shot_count === expected.length && blueprints.length === expected.length, 'council_shot_count_mismatch');
  assert(unique(blueprints.map((item) => item.shot_id)).length === blueprints.length, 'council_duplicate_shot');
  const expectedIds = new Set(expected);
  for (const blueprint of blueprints) {
    assert(expectedIds.has(blueprint.shot_id), 'council_unknown_shot');
    assert(blueprint.status === 'ready_for_asset_or_provider_routing', 'council_shot_not_ready');
    assert(Array.isArray(blueprint.rejection_contract) && blueprint.rejection_contract.length > 0, 'council_rejection_contract_missing');
    assert(!blueprint.missing_roles?.length && !blueprint.findings?.length, 'council_findings_present');
    const categories = {
      story_architect:'story', cinematography_director:'camera',
      visual_evidence_scout:'coverage', data_graphics_director:'graphics',
      world_builder:'world', edit_rhythm_director:'edit', sound_director:'sound',
      brand_art_director:'art_direction', documentary_truth_guard:'truth',
      beauty_judge:'beauty'
    };
    assert((plan.council.roles || []).length === 10, 'council_role_set_incomplete');
    for (const role of plan.council.roles) {
      const category = categories[role];
      const proposal = category && blueprint.creative_genome?.[category];
      assert(proposal?.category === category && Array.isArray(proposal.reject_if) && proposal.reject_if.length > 0,
        'council_genome_missing:' + role);
    }
  }
  return expected;
}

/**
 * Assemble and verify actual Graphics Command + Fallen Creative Council outputs.
 * All downstream departments receive deterministic work orders, not fictitious success receipts.
 * The returned pack is preproduction-only until the video/audio/QA/delivery gates execute.
 */
export function assembleGraphicsProductionMesh({dir, campaign, plan, report, manifest, reconciliation, fps=30}) {
  const root = path.resolve(dir);
  assert(fs.statSync(root, {throwIfNoEntry:false})?.isDirectory(), 'directory_missing');
  assert(Number.isInteger(fps) && fps >= 24 && fps <= 60, 'fps_invalid');
  assert(campaign?.schema === 'evercraft.commercial-attention-campaign.v1', 'campaign_schema_invalid');
  assert(plan?.schema === 'evercraft.graphics-command.commercial-plan.v1', 'plan_schema_invalid');
  assert(hex64(campaign.digest) && hex64(plan.digest) && plan.campaignDigest === campaign.digest, 'campaign_plan_digest_mismatch');
  assert(report?.status === 'pass' && report.planDigest === plan.digest, 'scroll_stop_not_verified');
  assert(manifest?.schema === 'evercraft.commercial-visual.manifest.v1' && manifest.campaignDigest === campaign.digest && manifest.planDigest === plan.digest, 'manifest_digest_mismatch');
  assert(manifest.publicationAuthority === false && manifest.clipHandoff?.publicationAuthority === false && plan.publicationAuthority === false, 'publication_authority_must_be_false');
  assert(Array.isArray(campaign.sourceRefs) && campaign.sourceRefs.length > 0, 'source_refs_missing');
  assert(JSON.stringify(unique(campaign.sourceRefs).sort()) === JSON.stringify(unique(manifest.sourceRefs || []).sort()), 'source_lineage_mismatch');
  assert(manifest.truthState === campaign.truthState, 'truth_state_mismatch');
  assert(manifest.offerUrl === campaign.offerUrl && manifest.priceUsd === campaign.priceUsd, 'offer_mismatch');
  const shotIds = verifyCouncil(plan, reconciliation);
  // Stable source identities only. This does NOT attest live execution or scan all modules.
  // The legacy branch's global module baseline is intentionally not ported: main moved
  // hundreds of commits, and treating new unrelated files as deployment failures is unsafe.
  const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const scopedPaths=[
    'systemia/graphics-command/commercial-director.mjs',
    'systemia/graphics-command/commercial-renderer.mjs',
    'systemia/graphics-command/production-mesh.mjs',
    'systemia/media-studio/creative-council-saban-adapter.mjs',
    'systemia/media-studio/visual-observer.ts',
    'systemia/media-studio/shot-tournament.ts',
    'systemia/media-studio/master-qc.ts',
    'systemia/media-studio/production-grade-gate.ts',
    'systemia/media-studio/audio-master.ts',
    'systemia/world-engine/webgpu.ts',
    'systemia/clip/media-intake.mjs',
  ];
  const scopedSourceModules=scopedPaths.map(relativePath=>{
    const absolutePath=path.resolve(repoRoot,relativePath);
    assert(absolutePath.startsWith(repoRoot+path.sep), 'source_scope_invalid');
    assert(fs.statSync(absolutePath,{throwIfNoEntry:false})?.isFile(), 'source_module_missing:'+relativePath);
    const bytes=fs.readFileSync(absolutePath);
    return {path:relativePath,sha256:sha256(bytes),sizeBytes:bytes.length,
      state:'source_present_runtime_unverified'};
  });
  const sourceModuleDigest=hashJson(scopedSourceModules);
  // Check immutable local media bytes instead of trusting public URLs or filenames.
  const formatMap = new Map([
    ['feed', [1080,1350]], ['square',[1080,1080]],
    ['story',[1080,1920]], ['hero-wide',[1600,900]]
  ]);
  const artifacts = [];
  for (const format of plan.formats || []) {
    const expected = formatMap.get(format.id);
    assert(expected && format.width === expected[0] && format.height === expected[1], 'format_unsupported:' + format.id);
    const fileName='poster-' + format.id + '.svg';
    const poster=verifyPoster(root, fileName, format.width, format.height);
    assert(textArtifact(root,fileName).text === renderCommercialPoster(campaign,plan,format.id),
      'svg_content_mismatch:' + format.id);
    artifacts.push(poster);
  }
  assert(artifacts.length === formatMap.size && new Set((plan.formats || []).map((x) => x.id)).size === formatMap.size, 'format_coverage_incomplete');
  const motion = textArtifact(root, 'motion.html');
  assert(motion.text.includes('window.__evercraftRenderAt=renderAt') &&
    motion.text.includes('window.__evercraftRenderFrame='), 'exact_frame_api_missing');
  assert(motion.text === renderCommercialMotion(campaign,plan), 'motion_content_mismatch');
  artifacts.push({path:'motion.html', sha256:motion.sha256, sizeBytes:motion.sizeBytes, kind:'exact_frame_html_stage'});
  const inputFiles = [
    ['campaign.json', campaign], ['graphics-plan.json', plan],
    ['scroll-stop-report.json', report], ['manifest.json', manifest],
    ['creative-council-reconciliation.json', reconciliation]
  ];
  for (const [name, expected] of inputFiles) {
    const actual = JSON.parse(textArtifact(root, name).text);
    assert(JSON.stringify(actual) === JSON.stringify(expected), 'input_file_mismatch:' + name);
    const file = readAsset(root, name);
    artifacts.push({path:name, sha256:file.sha256, sizeBytes:file.sizeBytes, kind:'receipt'});
  }
  const clipHandoff = JSON.parse(textArtifact(root, 'clip-handoff.json').text);
  assert(JSON.stringify(clipHandoff) === JSON.stringify(manifest.clipHandoff), 'clip_handoff_mismatch');
  assert(clipHandoff.publicationAuthority === false, 'clip_publication_authority_invalid');
  const clipFile = readAsset(root, 'clip-handoff.json');
  artifacts.push({path:'clip-handoff.json',sha256:clipFile.sha256,sizeBytes:clipFile.sizeBytes,kind:'handoff'});

  let framesAllocated = 0;
  const shots = plan.motion.beats.map((beat,index) => {
    assert(shotIds[index] === 'commercial-' + campaign.slug + '-' + beat.id, 'shot_order_mismatch');
    const elapsed = plan.motion.beats.slice(0,index+1).reduce((sum, item) => sum + item.durationSec,0);
    const endFrame = Math.round(elapsed * fps);
    const startFrame = framesAllocated;
    framesAllocated = endFrame;
    assert(endFrame > startFrame, 'shot_frame_allocation_invalid');
    return {
      id:shotIds[index], beat:beat.beat, intent:beat.intent,
      screenText:beat.screenText, startFrame, frameCount:endFrame-startFrame,
      durationSec:beat.durationSec, fps, size:{width:1080,height:1920},
      worldEngine:{state:'work_order_only', requirement:'If spatial render is chosen, preserve geometry, camera, source and scene replay receipts.'},
      fallen:{state:'work_order_only', requirement:'Admit identity/continuity/provenance-bound footage; render exact frames and record selected-shot digests.'}
    };
  });
  assert(Math.abs(framesAllocated / fps - plan.motion.targetDurationSec) <= 1/fps, 'duration_frame_mismatch');

  const jobpack = {
    schema:'evercraft.graphics-command.production-jobpack.v1',
    campaignId:campaign.id, campaignDigest:campaign.digest, planDigest:plan.digest,
    fps, frameCount:framesAllocated, resolution:{width:1080,height:1920},
    sourceRefs:campaign.sourceRefs, truthState:campaign.truthState,
    shots,
    capabilityRegistry:{
      status:'scoped_source_identity_only_runtime_unverified',
      sourceModuleDigest,scopedSourceModules,
      relatedBranchesNotImported:['graphics-megazord-production-mesh','visual-floor-shot-dailies','world-engine-data-constellation','voice-foundry'],
      externalSurfacesPendingVerification:[
        'private_render_workers','actual_gpu_performance','approved_voice_rights',
        'visual_model_provider_credentials_and_spend_authorization','original_production_footage',
        'clip_platform_publication_receipts'
      ]
    },
    departments:{
      familyToonStudio:{state:'source_presence_runtime_unverified',requiredEvidence:'series_bible_identity_animated_rig_performance_facial_mouth_hand_continuity_and_final_visual_review'},
      cinematicPerformance:{state:'source_presence_runtime_unverified',requiredEvidence:'performance_direction_identity_fingerprint_dialogue_sync_and_aesthetic_admission'},
      musicAndAudio:{state:'not_executed',requiredEvidence:'voice_profiles_original_score_foley_spatial_sound_and_master_receipts'},
      graphicsCommand:{state:'verified_local_assets',artifacts:artifacts.filter((x)=>x.kind==='svg').map((x)=>x.sha256)},
      fallenCreativeCouncil:{state:'reconciled',shotCount:shotIds.length,reconciliationSha256:readAsset(root,'creative-council-reconciliation.json').sha256},
      worldEngine:{state:'not_executed',requestedOutput:'replay_and_render_receipts_if_spatial_scenes_used'},
      fallenVisualStage:{state:'html_stage_only',exactFrameStageSha256:motion.sha256,requestedOutput:'sampled_frame_hashes_and_render_receipt'},
      voiceFoundryAndScore:{state:'not_executed',direction:plan.sound,requestedOutput:'voice_music_sfx_licensing_and_master_receipts'},
      fallenMasterQc:{state:'blocked_upstream',requestedOutput:'verified_final_video_plus_audio_sync_and_loudness_receipts'},
      visualDesk:{state:'local_pack_only',requestedOutput:'deployed_url_http_canary'},
      evercraftClip:{state:'handoff_only',requestedOutput:'authorized_media_intake_and_destination_receipts'}
    },
    delivery:{customerReady:false,publishReady:false,publicationAuthority:false,
      missing:['rendered_video','voice_music_sfx_master','frame_and_visual_review','master_qc','deployed_visual_desk_receipt','clip_media_intake']},
  };
  const core = {
    schema:'evercraft.graphics-command.production-mesh.v1',
    campaignId:campaign.id, campaignDigest:campaign.digest,
    planDigest:plan.digest, sourceRefs:campaign.sourceRefs,
    truthState:campaign.truthState, fps, frameCount:framesAllocated,
    artifacts:artifacts.sort((a,b)=>a.path.localeCompare(b.path)),
    councilStatus:reconciliation.status, councilShotCount:shotIds.length,
    sourceModuleDigest,scopedSourceModuleCount:scopedSourceModules.length,
    jobpackSha256:hashJson(jobpack),
    status:'preproduction_verified_downstream_blocked',
    publicationAuthority:false, customerReady:false,
    proofBoundary:'Local assets and creative planning verified. No actual World Engine frame, voiced soundtrack, MP4 master, published page or customer delivery attested.'
  };
  const receipt = {...core,digest:hashJson(core)};
  fs.writeFileSync(path.join(root,'production-jobpack.json'),JSON.stringify(jobpack,null,2)+'\n');
  fs.writeFileSync(path.join(root,'production-mesh-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return {receipt,jobpack};
}