import fs from 'node:fs';
import path from 'node:path';
const sha=x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x);
export function verifyTenSeconds(input){
 const errors=[],missing=[];
 if(input?.schema!=='evercraft.fallen.nebraska-finish-chapter.v1')errors.push('schema_invalid');
 if(input?.automaticMusic!==false)errors.push('score_first_not_allowed');
 if(input?.generatedFootageOfActualGames!==false)errors.push('synthetic_game_misrepresentation');
 if(input?.boundaries?.publicationAuthorityGranted!==false||input?.boundaries?.founderApproved!==false)errors.push('authority_claim_invalid');
 const acts=Array.isArray(input?.acts)?input.acts:[],clips=Array.isArray(input?.media)?input.media:[],facts=Array.isArray(input?.verifiedHistoricalFacts)?input.verifiedHistoricalFacts:[];
 let cursor=0;const clipIds=clips.map(x=>x.id);const factIds=facts.map(x=>x.id);
 if(new Set(clipIds).size!==clipIds.length||new Set(factIds).size!==factIds.length)errors.push('duplicate_asset_or_fact_id');
 for(const act of acts){
  if(act.startSec!==cursor||!Number.isFinite(act.durationSec)||act.durationSec<=0)errors.push('timeline_gap_or_overlap:'+act.id);
  cursor+=act.durationSec;
  if(!act.question||!act.sound||!Array.isArray(act.clips)||!act.clips.length)errors.push('act_without_story_purpose:'+act.id);
  for(const id of act.clips||[])if(!clipIds.includes(id))errors.push('missing_clip_requirement:'+id);
  for(const id of act.requiredClaims||[])if(!factIds.includes(id))errors.push('missing_claim:'+id);
 }
 if(cursor!==input?.durationSec||acts.length!==4)errors.push('duration_or_act_count_mismatch');
 const fact=id=>facts.find(x=>x.id===id)||{};
 const i1=fact('indiana-twelve-oh-one'),i2=fact('indiana-eleven-fifty-one'),i3=fact('indiana-seven-thirteen');
 const o1=fact('oregon-fourth-start'),o2=fact('oregon-defensive-work'),o3=fact('oregon-last-score');
 const ind='https://huskers.com/news/2026/10/10/huskers-push-no-7-hoosiers-to-limit',ore='https://huskers.com/news/2026/10/17/fb-recap';
 if([i1,i2,i3].some(x=>x.source!==ind)||i1.clock!=='Q4 12:01'||i2.clock!=='Q4 11:51'||i3.clock!=='Q4 07:13'||i1.score?.nebraska!==17||i1.score?.indiana!==6||i2.score?.indiana!==13||i3.score?.indiana!==20||!i2.event?.includes('75-yard')||!i3.event?.includes('44-yard'))errors.push('indiana_official_score_or_timing_changed');
 if([o1,o2,o3].some(x=>x.source!==ore)||o1.score?.nebraska!==14||o1.score?.oregon!==6||o2.stat?.tacklesForLoss!==11||o2.stat?.oregonTotalYards!==242||o3.clock!=='Q4 00:28'||o3.score?.oregon!==17||o3.score?.nebraska!==14)errors.push('oregon_official_score_or_timing_changed');
 for(const clip of clips){
  const admitted=sha(clip.sourceSha256)&&clip.rights==='verified_human_signed_clearance';
  if(!admitted)missing.push('actual_source_and_rights_required:'+clip.id);
  if(clip.kind==='dated_archival_still'&&!/^([a-f0-9]{40})$/i.test(clip.originalSha1||''))errors.push('archive_digest_missing:'+clip.id);
  if(clip.kind==='licensed_2026_game_footage'&&clip.rights!=='missing'&&!admitted)errors.push('game_footage_cannot_self_certify:'+clip.id);
 }
 if(input?.boundaries?.real2026GameFootageAcquired||input?.boundaries?.realFanInterviewAcquired||input?.boundaries?.professionalNarrationAuditioned)errors.push('unverified_readiness_claim');
 return {schema:'evercraft.fallen.ten-seconds-evidence-report.v1',status:errors.length?'rejected':missing.length?'story_locked_media_rights_blocked':'requires_human_director_review',errors:[...new Set(errors)],missing:[...new Set(missing)],metrics:{acts:acts.length,durationSec:cursor,officialPlayEvents:facts.length,neededMedia:clips.length},boundaries:{noTruthInferenceFromSourceLabels:true,noPictureContentVerification:true,publicationAuthorityGranted:false}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const [file,out]=process.argv.slice(2);if(!file||!out)throw Error('Usage: node ten-seconds-evidence.mjs <chapter.json> <report.json>');
  const r=verifyTenSeconds(JSON.parse(fs.readFileSync(file,'utf8')));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({status:r.status,errors:r.errors.length,missing:r.missing.length,metrics:r.metrics}));if(r.status==='rejected')process.exitCode=1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
