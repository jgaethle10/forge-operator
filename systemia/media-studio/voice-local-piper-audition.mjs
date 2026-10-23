import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalPiperTake} from './voice-local-piper.mjs';
import {buildVoiceAudition} from './voice-audition-kit.mjs';

const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,59}$/;
const SHA=/^[a-f0-9]{64}$/i;
function fail(x){throw Error('voice_piper_batch_'+x);}
function required(x,key){
 if(typeof x!=='string'||!x.trim())fail(key+'_missing');
 return x.trim();
}
async function hashFile(p){
 const hash=crypto.createHash('sha256');
 for await(const chunk of fs.createReadStream(p))hash.update(chunk);
 return hash.digest('hex');
}
function normalizeLocale(v){try{return Intl.getCanonicalLocales(String(v).replace(/_/g,'-'))[0];}catch{fail('locale_invalid');}}
async function preflightAllCandidates(candidates,locale){
 const region=normalizeLocale(locale);
 for(const c of candidates){
   if(c.rightsState!=='cleared'||typeof c.licenseEvidenceRef!=='string'||!c.licenseEvidenceRef.trim())fail('batch_license_evidence_incomplete:'+c.id);
   if(typeof c.voiceProfileId!=='string'||!ID.test(c.voiceProfileId)||
      typeof c.accent!=='string'||!c.accent.trim()||
      typeof c.performanceDirection!=='string'||!c.performanceDirection.trim()||
      !['feminine','masculine','neutral','unspecified'].includes(c.genderPresentation))fail('batch_candidate_cast_invalid:'+c.id);
   if(!Number.isInteger(c.speakerId??0)||(c.speakerId??0)<0||(c.speakerId??0)>1000)fail('batch_candidate_speaker_invalid:'+c.id);
   for(const [field,value,min,max] of [
     ['lengthScale',c.lengthScale??1,.8,1.2],
     ['noiseScale',c.noiseScale??.667,0,1.5],
     ['noiseWidth',c.noiseWidth??.8,0,1.5],
     ['sentenceSilenceSec',c.sentenceSilenceSec??.2,0,1]]){
       if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('batch_candidate_parameter_invalid:'+c.id+':'+field);
   }
   for(const [label,pin,p] of [['binary',c.expectedBinarySha256,c.piperCliPath],['model',c.expectedModelSha256,c.modelPath],['config',c.expectedConfigSha256,c.modelConfigPath]]){
     if(typeof pin!=='string'||!SHA.test(pin))fail('batch_missing_sha_pin:'+c.id+':'+label);
     if(typeof p!=='string'||!path.isAbsolute(p)||!fs.existsSync(p)||!fs.statSync(p).isFile())fail('batch_runtime_file_missing:'+c.id+':'+label);
     if((await hashFile(p)).toLowerCase()!==pin.toLowerCase())fail('batch_runtime_digest_mismatch:'+c.id+':'+label);
   }
   let cfg;try{cfg=JSON.parse(fs.readFileSync(c.modelConfigPath,'utf8'));}catch{fail('batch_model_config_invalid:'+c.id);}
   if(normalizeLocale(cfg.language?.code)!==region)fail('batch_model_locale_mismatch:'+c.id);
   if(Number.isInteger(cfg.num_speakers)&&(c.speakerId??0)>=cfg.num_speakers)fail('batch_speaker_not_in_model:'+c.id);
 }
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
 // Check every declared model and its rights before generating any take.
 await preflightAllCandidates(plan.candidates,locale);
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
