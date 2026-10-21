/**
 * Source-first editorial development gate for Nebraska | The Giant Stirs S1.
 * Structural certification is NOT footage, legal approval or artistic approval.
 */
import fs from 'node:fs';
import path from 'node:path';
const hex=(value,n)=>typeof value==='string'&&new RegExp('^[0-9a-f]{'+n+'}$','i').test(value);
const safe=(x)=>Array.isArray(x)?x:[];

export function inspectNebraskaSeries(manifest,registry){
 const errors=[],notReady=[];
 if(manifest?.schema!=='evercraft.fallen.nebraska-series-plan.v1')errors.push('series_schema_invalid');
 if(registry?.schema!=='evercraft.fallen.nebraska-series-source-registry.v1')errors.push('source_registry_schema_invalid');
 if(manifest?.seriesId!==registry?.seriesId)errors.push('series_id_mismatch');
 if(manifest?.format!=='three-part-observational-sports-documentary'||manifest?.targetTotalSec!==4500)errors.push('format_or_target_invalid');
 if(manifest?.seriesStatus!=='development_only')errors.push('series_premature_final_status');
 if(manifest?.publication?.automatedPublish!==false||
   Object.entries(manifest?.publication||{}).some(([k,v])=>k!=='automatedPublish'&&v!==false))
  errors.push('publication_or_release_authority_claimed');
 if(manifest?.currentSeason?.asOf!=='2026-10-21'||manifest?.currentSeason?.record?.wins!==5||
   manifest?.currentSeason?.record?.losses!==2||
   manifest?.currentSeason?.nextKnownGame?.date!=='2026-10-31'||
   manifest?.currentSeason?.nextKnownGame?.opponent!=='Washington'||
   manifest?.currentSeason?.nextKnownGame?.result!=='not_played'||
   manifest?.currentSeason?.seasonComplete!==false)
  errors.push('2026_record_future_game_or_season_truth_changed');
 if(manifest?.releasePolicy?.schedule!=='not_set')errors.push('unapproved_release_schedule');
 const episodes=safe(manifest?.episodes),sources=safe(registry?.sources);
 const sourceIds=sources.map(x=>x.id),episodeIds=episodes.map(x=>x.id);
 if(new Set(sourceIds).size!==sourceIds.length||sourceIds.length<10)errors.push('source_registry_duplicates_or_truncated');
 if(episodes.length!==3||episodeIds.join('|')!=='ep01|ep02|ep03')errors.push('three_episode_identity_invalid');
 const blockedBySource=new Map();
 for(const s of sources){
  if(!s.id||!s.title||!s.kind||!s.acquisitionState||!s.rightsStatus)errors.push('source_has_no_chain_of_custody:'+s.id);
  if(s.acquisitionState==='acquired_digest_verified'&&!hex(s.sha256,64)&&!hex(s.sha1,40))
   errors.push('claimed_verified_source_without_digest:'+s.id);
  if(s.publicationEligible!==false){
   // A source state is not permission, and this file must never auto-authorize.
   errors.push('source_publication_unreviewed_claim:'+s.id);
  }
  if(s.permissionReceiptId!==null||s.editorialApprovalReceiptId!==null)
   errors.push('source_has_unverified_permission_or_editorial_receipt:'+s.id);
  blockedBySource.set(s.id,{
   id:s.id,title:s.title,
   sourceVerified:s.acquisitionState==='acquired_digest_verified',
   rightsStatus:s.rightsStatus,
   blocking: s.acquisitionState==='acquired_digest_verified' ?
     'legal_use_and_film_edit_approval_pending':'recording_or_source_bytes_unavailable'
  });
 }
 if(sources.length===0)errors.push('no_sources');
 if(registry?.production?.actual2026GameFootageAcquired!==false||
  registry?.production?.fanInterviewCapturedAndReleased!==false||
  registry?.production?.archiveUsePermissionObtained!==false||
  registry?.production?.paidLicensesPurchased!==false||
  registry?.production?.publicationAuthorityGranted!==false)
  errors.push('rights_or_recordings_claimed_without_evidence');
 let total=0,acts=0; const episodeReports=[];
 for(const ep of episodes){
  if(!Number.isFinite(ep.targetDurationSec)||ep.targetDurationSec!==1500 ||
     ep.allowedRuntimeSec?.min!==1320||ep.allowedRuntimeSec?.max!==1680)
   errors.push('episode_runtime_spec_invalid:'+ep.id);
  if(ep.productionStage!=='story_outline_only_no_finished_episode'||ep.founderApproved!==false||ep.publicationAuthorityGranted!==false)
   errors.push('episode_unearned_completion_claim:'+ep.id);
  if(!ep.question?.trim()||!ep.audienceValue?.trim())errors.push('episode_lacks_story_question:'+ep.id);
  const scenes=safe(ep.acts),ids=scenes.map(x=>x.id);if(scenes.length!==6||new Set(ids).size!==scenes.length)errors.push('missing_scenes_or_duplicate_ids:'+ep.id);
  let duration=0;
  const required=new Set(),optional=new Set();
  for(const scene of scenes){
   if(!scene.id||!scene.storyQuestion?.trim()||scene.mediaAdmission!=='blocked_pending_real_footage_rights_and_director_review')
    errors.push('act_has_no_story_or_false_admission:'+ep.id+':'+scene.id);
   if(!Number.isInteger(scene.durationSec)||scene.durationSec<45||scene.durationSec>430)
    errors.push('scene_duration_invalid:'+ep.id+':'+scene.id);
   duration+=scene.durationSec||0;
   if(!safe(scene.requiredSourceIds).length)errors.push('scene_with_no_source_requirement:'+ep.id+':'+scene.id);
   for(const id of safe(scene.requiredSourceIds)){
    if(!sourceIds.includes(id))errors.push('unregistered_required_source:'+ep.id+':'+id);
    else required.add(id);
   }
   for(const id of safe(scene.optionalSourceIds)){
    if(!sourceIds.includes(id))errors.push('unregistered_optional_source:'+ep.id+':'+id);
    else optional.add(id);
   }
  }
  if(duration!==ep.targetDurationSec)errors.push('scene_sum_not_episode_target:'+ep.id+':'+duration);
  total+=duration;acts+=scenes.length;
  episodeReports.push({
   episodeId:ep.id,title:ep.title,
   draftSeconds:duration,draftMinutes:Number((duration/60).toFixed(1)),
   structureOnly:true,
   requiredSourceCount:required.size,
   requiredMediaBlockers:[...required].map(id=>blockedBySource.get(id)).filter(Boolean),
   optionalArchiveCandidates:[...optional],
   availableForPublicFilmMinutes:0,
   humanDirectorAcceptance:false
  });
 }
 if(total!==4500||acts!==18)errors.push('75_minute_18_scene_outline_invalid');
 const ep3=episodes.find(ep=>ep.id==='ep03');
 if(!ep3||!ep3.acts.some(a=>safe(a.requiredSourceIds).includes('postseason-and-season-outcome'))||
   !ep3.acts.some(a=>safe(a.requiredSourceIds).includes('washington-2026-game-film'))||
   !ep3.acts.some(a=>safe(a.requiredSourceIds).includes('november-2026-game-film')))
   errors.push('finale_cannot_be_fixed_without_future_season_events');
 if(!safe(manifest?.workingFilmReferences).some(x=>x.work==='Before the Echo RC08'&&x.durationSec===50&&x.status==='private_review_not_licensed_for_publication'))
  errors.push('native_review_proof_missing_or_called_release_ready');
 if(!safe(manifest?.workingFilmReferences).some(x=>x.work==='Ten Seconds source-locked chapter'&&x.durationSec===138&&x.status==='scripted_not_renderable_no_broadcast_rights'))
  errors.push('game_chapter_truth_boundary_removed');
 return {
  schema:'evercraft.fallen.nebraska-series-preflight.v1',
  status:errors.length?'rejected':'structure_passed_sources_and_rights_blocked',
  editorialProgress:'three_episode_structure_only',
  targetMinutes:total/60,episodeCount:episodes.length,sceneCount:acts,
  acquiredHashVerifiedSources:sources.filter(s=>s.acquisitionState==='acquired_digest_verified').length,
  episodes:episodeReports,errors:[...new Set(errors)],
  boundaries:{independentAudienceFeedbackNotRecorded:true,
    noAuthenticatedHumanInterviews:true,noLicensed2026GameMedia:true,
    seasonNotComplete:true,noPublishOrSpendAuthority:true,
    cinematicQualityNotCertified:true}
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [seasonFile,sourcesFile,outFile]=process.argv.slice(2);
  if(!seasonFile||!sourcesFile||!outFile)throw Error('Usage: node series-production-gate.mjs <season.json> <sources.json> <output.json>');
  const result=inspectNebraskaSeries(JSON.parse(fs.readFileSync(seasonFile,'utf8')),
   JSON.parse(fs.readFileSync(sourcesFile,'utf8')));
  fs.mkdirSync(path.dirname(outFile),{recursive:true});
  fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,episodeCount:result.episodeCount,sceneCount:result.sceneCount,
    targetMinutes:result.targetMinutes,verifiedSources:result.acquiredHashVerifiedSources,
    blockers:result.episodes.map(x=>({ep:x.episodeId,required:x.requiredSourceCount,releaseReady:false})),
    errors:result.errors}));
  if(result.status==='rejected')process.exitCode=1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
