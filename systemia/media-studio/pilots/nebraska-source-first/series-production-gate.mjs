/**
 * Source-first editorial development gate for Nebraska | The Giant Stirs S1.
 * Structural certification is NOT footage, legal approval or artistic approval.
 */
import fs from 'node:fs';
import path from 'node:path';
const hex=(value,n)=>typeof value==='string'&&new RegExp('^[0-9a-f]{'+n+'}$','i').test(value);
const safe=(x)=>Array.isArray(x)?x:[];

export function inspectNebraskaHistory(ledger){
 const errors=[];
 if(ledger?.schema!=='evercraft.fallen.nebraska-historical-research.v1'||ledger?.asOf!=='2026-10-21')
  errors.push('historical_ledger_schema_or_asof_invalid');
 const claims=safe(ledger?.claims),ids=claims.map(x=>x.id);
 if(claims.length<20||new Set(ids).size!==claims.length)errors.push('historical_facts_or_unique_ids_missing');
 for(const c of claims){
  if(!c.id||!c.era||!c.statement?.trim()||!c.status||!safe(c.sources).length||
   safe(c.sources).some(v=>!/^https:\/\//.test(v)))
   errors.push('historical_claim_unattributed:'+c.id);
 }
 const assertion=(id,patterns)=>{
  const claim=claims.find(c=>c.id===id);
  if(!claim||patterns.some(pattern=>!pattern.test(claim.statement)))
   errors.push('historical_anchor_missing_or_changed:'+id);
 };
 assertion('devaney-arrival',[/1962/,/1970/,/1971/]);
 assertion('boyd-epley-strength-program-1969',[/Boyd Epley/,/1969/,/strength/i]);
 assertion('three-nineties-titles',[/1994/,/1995/,/1997/,/five/i]);
 assertion('solich-inherited',[/58-19/,/six seasons/i]);
 assertion('2002-season-fall',[/7-7/,/2003/,/9-3/]);
 assertion('pelini-not-blanket-failure',[/nine wins/i,/seven seasons/i,/never won a conference championship/i]);
 assertion('big-ten-move',[/2011/,/without assuming/i]);
 assertion('2024-bowl-breakthrough',[/7-6/,/20-15/,/2015/,/2016/]);
 assertion('rhule-first-three-record',[/5-7/,/7-6/,/2023/,/2024/,/2025/]);
 assertion('2026-record-incomplete',[/5-2/,/20-17/,/17-14/,/not over/i]);
 const investigative=claims.filter(c=>c.status==='investigative_question');
 if(investigative.length<2||safe(ledger?.interpretationsToInvestigate).length<5||
  safe(ledger?.interpretationsToInvestigate).some(x=>!x.question?.trim()))
  errors.push('historical_causes_must_remain_investigative');
 if(ledger?.publicationAuthorityGranted!==false||
  !/not.*substitute|never.*substitute/i.test(ledger?.rightsPolicy||''))errors.push('history_research_grants_no_media_rights');
 return [...new Set(errors)];
}

export function inspectNebraskaSeries(manifest,registry,ledger){
 const errors=[...inspectNebraskaHistory(ledger)],notReady=[];
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
 const episodeTitles=episodes.map(x=>x.title).join('|');
 if(episodeTitles!=='The Giant|The Sleeping Giant|The Giant Stirs')errors.push('history_decline_revival_arc_replaced');
 const requireCoverage=(epId,ids,sourceIdsNeeded)=>{
  const ep=episodes.find(x=>x.id===epId);
  const eras=safe(ep?.historicalCoverage);
  if(!ep||ids.some(id=>!eras.includes(id)))errors.push('historical_era_coverage_missing:'+epId);
  const required=new Set(safe(ep?.acts).flatMap(a=>safe(a.requiredSourceIds)));
  if(sourceIdsNeeded.some(id=>!required.has(id)))errors.push('core_historical_visual_or_interview_missing:'+epId);
 };
 requireCoverage('ep01',['origins','1970-1971','1994-1995-1997'],
  ['history-nebraska-rg6137','1970-1971-championship-game-film','1994-1997-championship-game-film','osborne-football-system']);
 requireCoverage('ep02',['2001-2003','2004-2014','2015-2022'],
  ['2001-colorado-game-film','2002-2003-solich-records','callahan-era-footage','pelini-era-footage','riley-era-footage','frost-era-footage','2011-big-ten-transition-records']);
 requireCoverage('ep03',['2023-2025','2026-as-of-Oct21','future-results-open'],
  ['rhule-2023-arrival','rhule-player-development','2024-pinstripe-bowl-film','2025-season-game-footage',
   '2026-five-win-start','indiana-2026-game-film','oregon-2026-game-film']);
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
 if(manifest?.historicalEvidence!=='history.evidence.json')errors.push('historical_evidence_registry_not_linked');
 if(!safe(manifest?.workingFilmReferences).some(x=>x.work==='Ten Seconds source-locked chapter'&&x.possiblePlacement==='ep03-2026-scrutiny'))
  errors.push('old_2026_chapter_still_driving_entire_series');
 if(!safe(manifest?.workingFilmReferences).some(x=>x.work==='Ten Seconds source-locked chapter'&&x.durationSec===138&&x.status==='scripted_not_renderable_no_broadcast_rights'))
  errors.push('game_chapter_truth_boundary_removed');
 return {
  schema:'evercraft.fallen.nebraska-series-preflight.v1',
  status:errors.length?'rejected':'structure_passed_sources_and_rights_blocked',
  editorialProgress:'three_episode_history_decline_rebuild_structure_only',
  targetMinutes:total/60,episodeCount:episodes.length,sceneCount:acts,
  historicalFactsWithSourceLinks:safe(ledger?.claims).length,
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
  const [seasonFile,sourcesFile,historyFile,outFile]=process.argv.slice(2);
  if(!seasonFile||!sourcesFile||!historyFile||!outFile)throw Error('Usage: node series-production-gate.mjs <season.json> <sources.json> <history.json> <output.json>');
  const result=inspectNebraskaSeries(JSON.parse(fs.readFileSync(seasonFile,'utf8')),
   JSON.parse(fs.readFileSync(sourcesFile,'utf8')),
   JSON.parse(fs.readFileSync(historyFile,'utf8')));
  fs.mkdirSync(path.dirname(outFile),{recursive:true});
  fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,episodeCount:result.episodeCount,sceneCount:result.sceneCount,
    targetMinutes:result.targetMinutes,verifiedSources:result.acquiredHashVerifiedSources,
    blockers:result.episodes.map(x=>({ep:x.episodeId,required:x.requiredSourceCount,releaseReady:false})),
    errors:result.errors}));
  if(result.status==='rejected')process.exitCode=1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
