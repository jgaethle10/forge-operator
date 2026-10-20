/** Fallen observational edit-grammar preflight. Editorial structure only, not source verification or beauty. */
import fs from 'node:fs';
import path from 'node:path';
const PURPOSE=new Set(['establish','reveal','prove','complicate','resolve']);
const CUT=new Set(['action','reaction','causal','contrast','observation','deliberate_pause','music_beat']);
const REAL=new Set(['captured_location','captured_interview','cleared_game_footage']);
const SOUND=new Set(['location','interview','field','intentional_silence','score']);
const text=x=>typeof x==='string'&&x.trim().length>2&&!/^(tbd|pending|n\/a|placeholder)$/i.test(x.trim());
const num=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const ary=x=>Array.isArray(x)?x:[];
const round=x=>Number(x.toFixed(3));
export function assessObservationalEdit(input,studioDraft){
 const errors=[],blockers=[];
 if(input?.schema!=='evercraft.fallen.observational-edit-plan.v1')errors.push('edit_plan_schema_invalid');
 const plan=studioDraft??input?.studioDraft;
 if(plan?.schema!=='evercraft.fallen.studio-draft-plan.v1')errors.push('studio_plan_schema_invalid');
 const scenes=ary(plan?.scenes),shots=ary(input?.shots);
 if(scenes.length===0||shots.length!==scenes.length)errors.push('shot_count_not_equal_studio_scenes');
 const sceneIds=new Set(scenes.map(s=>s.id)),shotIds=new Set();
 let cursor=0,captured=0,diegetic=0,scoreOnly=0,silent=0,beatCuts=0;
 for(let i=0;i<shots.length;i++){
  const s=shots[i],scene=scenes[i]||{},id=String(s.id);
  if(!text(s.id)||shotIds.has(id))errors.push('invalid_or_duplicate_shot_id:'+id);
  shotIds.add(id);
  if(s.sceneId!==scene.id||!sceneIds.has(s.sceneId))errors.push('shot_scene_order_mismatch:'+id);
  if(!num(s.startSec)||!num(s.durationSec)||!num(scene.durationSec)||scene.durationSec<=0||Math.abs(s.startSec-cursor)>.03||Math.abs(s.durationSec-scene.durationSec)>.03)errors.push('timeline_binding_mismatch:'+id);
  const d=num(scene.durationSec)?scene.durationSec:0;cursor+=d;
  if(!PURPOSE.has(s.purpose)||!text(s.viewerQuestion)||!text(s.observedChange))errors.push('shot_no_meaningful_story_function:'+id);
  if(!CUT.has(s.cut?.cause)||!text(s.cut?.whyNow))errors.push('cut_without_story_cause:'+id);
  if(i>0&&s.cut?.cause==='music_beat')beatCuts++;
  if(!REAL.has(s.source?.type)&&s.source?.type!=='illustrative')errors.push('scene_source_type_invalid:'+id);
  if(!text(s.source?.assetRef)||!text(s.source?.evidenceRef))blockers.push('footage_source_missing:'+id);
  if(s.source?.state!=='cleared'||!text(s.source?.rightsRef))blockers.push('source_rights_not_cleared:'+id);
  if(REAL.has(s.source?.type))captured+=d;
  if(!SOUND.has(s.sound?.primary))errors.push('primary_sound_missing:'+id);
  if(s.sound?.primary==='score')scoreOnly+=d;
  if(s.sound?.primary==='intentional_silence')silent+=d;
  if(['location','interview','field'].includes(s.sound?.primary)){
   diegetic+=d;
   if(!text(s.sound?.audioEvidenceRef))blockers.push('actual_sound_source_pending:'+id);
  }
  if(s.sound?.musicBed===true&&!text(s.sound?.scoreCuePurpose))errors.push('unmotivated_music_bed:'+id);
  if(s.source?.type==='illustrative'&&s.portraysActual2026Game===true)errors.push('synthetic_as_2026_game:'+id);
  if(s.source?.type==='cleared_game_footage'&&!text(s.source?.eventRef))blockers.push('game_play_identification_pending:'+id);
  if(s.source?.type==='captured_interview'&&!text(s.source?.speakerReleaseRef))blockers.push('interview_release_pending:'+id);
  if(!text(s.actionOrReaction))errors.push('observable_action_or_reaction_missing:'+id);
  if(!s.humanEditorialApprovalRef)blockers.push('human_shot_review_pending:'+id);
 }
 if(new Set(shots.map(s=>s.purpose)).size<3)errors.push('too_few_distinct_editorial_functions');
 const total=round(cursor),metrics={
  runtimeSec:total,
  plannedCapturedFootageFraction:total?round(captured/total):0,
  diegeticSoundFraction:total?round(diegetic/total):0,
  scoreOnlyFraction:total?round(scoreOnly/total):0,
  deliberateSilenceSec:round(silent),
  musicBeatCutFraction:shots.length>1?round(beatCuts/(shots.length-1)):0
 };
 if(metrics.plannedCapturedFootageFraction<.70)errors.push('too_much_nonobservational_imagery');
 if(metrics.diegeticSoundFraction<.45)errors.push('insufficient_source_sound_or_voice');
 if(metrics.scoreOnlyFraction>.25)errors.push('score_bed_dominates_story');
 if(metrics.deliberateSilenceSec<2)errors.push('no_deliberate_silent_breath');
 if(metrics.musicBeatCutFraction>.20)errors.push('edit_cuts_overdetermined_by_music');
 if(!text(input?.audienceQuestion))errors.push('central_documentary_question_missing');
 if(!text(input?.editorialReviewerRef))blockers.push('editorial_signoff_pending');
 return {
  schema:'evercraft.fallen.observational-edit-preflight.v1',
  status:errors.length?'rejected':blockers.length?'structure_passed_assets_pending':'structure_passed_human_review_required',
  errors:[...new Set(errors)],blockers:[...new Set(blockers)],metrics,
  checks:{exactStudioSceneBinding:!errors.some(e=>e.includes('mismatch')),
   musicNotSoleEditDriver:metrics.musicBeatCutFraction<=.2,
   sourceMediaRightsVerified:false,realActionIndependentMotionVerified:false,
   creativeQualityVerified:false,publicationAuthorityGranted:false}
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 const [planFile,intentFile,out]=process.argv.slice(2);
 if(!planFile||!intentFile||!out){console.error('Usage: node observational-edit-preflight.mjs <studio.plan.json> <intent.json> <report.json>');process.exitCode=2;}
 else{
  try{
   const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
   const result=assessObservationalEdit(read(intentFile),read(planFile));
   fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
   console.log(JSON.stringify({status:result.status,errors:result.errors.length,blockers:result.blockers.length,metrics:result.metrics}));
   if(result.status==='rejected')process.exitCode=1;
  }catch(e){console.error(String(e));process.exitCode=2;}
 }
}
