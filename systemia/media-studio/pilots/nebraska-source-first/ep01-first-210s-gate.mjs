import fs from 'node:fs';
import path from 'node:path';
export function evaluateEp01Opening(plan,registry){
 const errors=[],blocking=[];
 if(plan?.schema!=='evercraft.fallen.nebraska-ep01-first-act.v1'||plan?.episode!=='ep01'||plan?.targetSec!==210)errors.push('first_act_plan_invalid');
 if(registry?.schema!=='evercraft.fallen.nebraska-series-source-registry.v1')errors.push('registry_invalid');
 const sources=new Map((registry?.sources||[]).map(s=>[s.id,s]));
 const beats=Array.isArray(plan?.beats)?plan.beats:[];
 if(beats.length!==8)errors.push('eight_beat_arc_changed');
 let current=0;
 for(const b of beats){
  if(b.start!==current||!Number.isInteger(b.duration)||b.duration<12)errors.push('invalid_edit_time:'+b.id);
  current+=b.duration||0;
  if(!b.fact?.trim()||!b.visual?.trim()||!b.sound?.trim()||!b.clearance?.trim())errors.push('scene_unjustified_or_unlogged:'+b.id);
  for(const id of b.sourceIds||[]){
   const source=sources.get(id);
   if(!source)errors.push('unregistered_source:'+id);
   else if(source.publicationEligible!==true||!source.permissionReceiptId||!source.editorialApprovalReceiptId)
    blocking.push({beat:b.id,sourceId:id,reason:'source_not_individually_cleared_or_director_approved'});
  }
 }
 if(current!==210)errors.push('duration_not_210_seconds');
 if(beats[0]?.id!=='the-early-field'||beats[7]?.id!=='the-inheritance')errors.push('historical_story_reversed');
 if(beats[3]?.fact?.includes('17-12')!==true||!beats[3]?.fact?.includes('Jan 14'))errors.push('1970_title_and_1971_ceremony_not_fact_pinned');
 if(!beats[5]?.fact?.includes('38-6')||!beats[5]?.fact?.includes('Feb 1'))errors.push('1971_title_result_and_1972_meeting_not_pinned');
 if(!beats[4]?.visual?.includes('not an unrelated 1971 matchup'))errors.push('missouri_game_misrepresented_as_oklahoma');
 if(plan?.noSyntheticHistoricVideo!==true||plan?.noManufacturedPeriodAudio!==true)errors.push('false_historical_motion_or_audio_allowed');
 if(plan?.anySceneFilmReady!==false||plan?.allSourceRightsCleared!==false||
   plan?.founderApproved!==false||plan?.publicationAuthorityGranted!==false)errors.push('unearned_completion_or_distribution_claim');
 if(plan?.status!=='editorial_scratch_no_film_master')errors.push('draft_marked_master');
 return {schema:'evercraft.fallen.nebraska-ep01-opening-preflight.v1',
  status:errors.length?'rejected':'source_locked_no_publication_authority',
  seconds:current,beats:beats.length,
  knownSourceIds:([...new Set(beats.flatMap(b=>b.sourceIds||[]))]).length,
  blockedSourceReferences:blocking.length,errors:[...new Set(errors)],
  filmRenderProduced:false,sourceRightsReady:false,humanCreativeReviewComplete:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [planFile,sourceFile,outFile]=process.argv.slice(2);
  if(!planFile||!sourceFile||!outFile)throw Error('Usage: node ep01-first-210s-gate.mjs plan.json sources.json output.json');
  const result=evaluateEp01Opening(JSON.parse(fs.readFileSync(planFile,'utf8')),JSON.parse(fs.readFileSync(sourceFile,'utf8')));
  fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,beats:result.beats,durationSec:result.seconds,
   registeredSources:result.knownSourceIds,blockedSources:result.blockedSourceReferences,errors:result.errors}));
  if(result.status==='rejected')process.exitCode=1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
