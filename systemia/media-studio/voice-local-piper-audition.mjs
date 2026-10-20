import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalPiperTake} from './voice-local-piper.mjs';
import {buildVoiceAudition} from './voice-audition-kit.mjs';

const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,59}$/;
function fail(x){throw Error('voice_piper_batch_'+x);}
function required(x,key){
 if(typeof x!=='string'||!x.trim())fail(key+'_missing');
 return x.trim();
}
/** Never spends money or downloads models. Creates a portable blind listening room
 * from two to six local Piper model/parameter auditions of the SAME spoken line.
 */
export async function buildLocalPiperAudition({plan,outputDir}){
 if(plan?.schema!=='evercraft.voice-foundry.local-piper-batch.v1')fail('schema_invalid');
 const projectId=required(plan.projectId,'project_id');
 const scriptText=required(plan.scriptText,'script_text');
 const locale=required(plan.locale,'locale');
 if(!Array.isArray(plan.candidates)||plan.candidates.length<2||plan.candidates.length>6)fail('candidate_count_2_to_6');
 const ids=new Set();
 for(const candidate of plan.candidates){
   if(typeof candidate?.id!=='string'||!ID.test(candidate.id)||ids.has(candidate.id))fail('candidate_id_invalid_or_duplicate');
   ids.add(candidate.id);
 }
 if(typeof outputDir!=='string'||!outputDir.trim())fail('output_dir_missing');
 const base=path.resolve(outputDir);
 if(!fs.existsSync(base)||!fs.statSync(base).isDirectory())fail('output_dir_not_existing');
 const manifestPath=path.join(base,'audition-manifest.json');
 const roomDir=path.join(base,'listening-room');
 if(fs.existsSync(manifestPath)||fs.existsSync(roomDir))fail('audition_already_exists');
 if(plan.allowPaidGeneration===true)fail('paid_generation_unsupported');
 const outputCandidates=[];
 for(const candidate of plan.candidates){
   // No fallback to other provider or model: each candidate must have its
   // explicit runtime and voice SHA-256 pins, license receipt and region.
   const result=await createLocalPiperTake({
      scriptText,candidateId:candidate.id,voiceProfileId:candidate.voiceProfileId,
      locale:locale,accent:candidate.accent,genderPresentation:candidate.genderPresentation,
      performanceDirection:candidate.performanceDirection,
      piperCliPath:candidate.piperCliPath,modelPath:candidate.modelPath,
      modelConfigPath:candidate.modelConfigPath,
      expectedBinarySha256:candidate.expectedBinarySha256,
      expectedModelSha256:candidate.expectedModelSha256,
      expectedConfigSha256:candidate.expectedConfigSha256,
      speakerId:candidate.speakerId??0,lengthScale:candidate.lengthScale??1,
      noiseScale:candidate.noiseScale??.667,noiseWidth:candidate.noiseWidth??.8,
      sentenceSilenceSec:candidate.sentenceSilenceSec??.2,
      licenseEvidenceRef:candidate.licenseEvidenceRef,rightsState:candidate.rightsState,
      outputDir:base
   });
   outputCandidates.push(result.record.manifestCandidate);
 }
 const manifest={schema:'evercraft.voice-foundry.audition-input.v1',projectId,
   scriptText,locale,candidates:outputCandidates};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 const room=buildVoiceAudition({manifestPath,outputDir:roomDir});
 return {schema:'evercraft.voice-foundry.local-piper-batch-output.v1',
   projectId,manifestPath,roomPath:room.indexPath,candidates:room.candidates,
   status:'private_audition_only',modelsActuallyInvoked:true,
   neuralVoiceQualityIndependentlyVerified:false,
   rightsEvidenceIndependentlyVerified:false,publicationAuthorityGranted:false};
}
const current=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===current){
 const [planPath,outputDir,...extra]=process.argv.slice(2);
 if(!planPath||!outputDir||extra.length){
   process.stderr.write('Usage: node voice-local-piper-audition.mjs <private-batch-plan.json> <existing-output-directory>\n');
   process.exitCode=1;
 }else{
   try{
     const raw=fs.readFileSync(planPath,'utf8');
     if(Buffer.byteLength(raw)>256*1024)fail('plan_too_large');
     const result=await buildLocalPiperAudition({plan:JSON.parse(raw),outputDir});
     process.stdout.write(JSON.stringify(result,null,2)+'\n');
   }catch(e){process.stderr.write(String(e.message??e)+'\n');process.exitCode=1;}
 }
}
