import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectVoiceSignal } from './voice-signal-inspector.mjs';
import { inspectVoicePacing } from './voice-pacing.mjs';
import { assessVoiceTranscript } from './voice-transcript-verifier.mjs';

const currentDir=path.dirname(fileURLToPath(import.meta.url));
const AUDIO_EXTENSIONS=new Set(['.wav','.mp3','.flac','.m4a','.ogg','.opus']);
const AUDIO_MAX=30*1024*1024;
const TOTAL_MAX=100*1024*1024;
const MAX_CANDIDATES=20;
const idRE=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const allowedRights=new Set(['cleared','unknown','restricted']);
const allowedPresentation=new Set(['feminine','masculine','neutral','unspecified']);

function required(value,code){if(typeof value!=='string'||!value.trim()) throw Error('audition_'+code);return value.trim();}
function candidateId(value){const id=required(value,'candidate_id_missing');if(!idRE.test(id))throw Error('audition_candidate_id_unsafe');return id;}
function validLocale(value){try{return Intl.getCanonicalLocales(required(value,'locale_missing'))[0];}catch{throw Error('audition_locale_invalid');}}
function stableJson(value){return JSON.stringify(value,null,2)+'\n';}
function normalizeManifest(input){
 if(input?.schema!=='evercraft.voice-foundry.audition-input.v1')throw Error('audition_schema_invalid');
 const projectId=required(input.projectId,'project_id_missing');
 const scriptText=required(input.scriptText,'script_missing');
 const locale=validLocale(input.locale);
 if(!Array.isArray(input.candidates)||input.candidates.length<2||input.candidates.length>MAX_CANDIDATES)throw Error('audition_candidate_count_outside_2_to_20');
 const ids=new Set();
 const candidates=input.candidates.map(c=>{
   const id=candidateId(c?.id);
   if(ids.has(id))throw Error('audition_duplicate_candidate_id:'+id);ids.add(id);
   const cLocale=validLocale(c?.locale);
   if(new Intl.Locale(cLocale).language!==new Intl.Locale(locale).language)throw Error('audition_language_mismatch:'+id);
   if(required(c?.scriptText,'candidate_script_missing')!==scriptText)throw Error('audition_script_mismatch:'+id);
   const rightsState=required(c?.rightsState,'rights_missing');
   if(!allowedRights.has(rightsState))throw Error('audition_rights_state_invalid:'+id);
   const genderPresentation=required(c?.genderPresentation,'presentation_missing');
   if(!allowedPresentation.has(genderPresentation))throw Error('audition_presentation_invalid:'+id);
   return {
     id, label:required(c.label,'label_missing'),voiceProfileId:required(c.voiceProfileId,'voice_profile_missing'),
     locale:cLocale,accent:required(c.accent,'accent_missing'),genderPresentation,
     scriptText,
     provider:required(c.provider,'provider_missing'),modelId:required(c.modelId,'model_id_missing'),providerReceiptRef:c.providerReceiptRef??null,
     rightsState,rightsEvidenceRef:c.rightsEvidenceRef??null,
     sourcePath:required(c.audioPath,'audio_path_missing'),
     asrObservationPath:c.asrObservationPath===undefined?null:required(c.asrObservationPath,'asr_path_invalid'),
     performanceDirection:required(c.performanceDirection,'direction_missing')
   };
 });
 return {projectId,scriptText,locale,candidates};
}
function copyCandidateAudio(sourcePath,destDir){
 const source=fs.realpathSync(sourcePath);
 const stat=fs.statSync(source);
 if(!stat.isFile()||stat.size===0||stat.size>AUDIO_MAX)throw Error('audition_audio_size_invalid');
 const extension=path.extname(source).toLowerCase();
 if(!AUDIO_EXTENSIONS.has(extension))throw Error('audition_audio_format_unsupported');
 const signal=inspectVoiceSignal(source);
 const pacing=inspectVoicePacing(source);
 if(signal.audioDigest!==pacing.audioDigest)throw Error('audition_pacing_audio_digest_mismatch');
 const name=signal.audioDigest+extension;
 fs.copyFileSync(source,path.join(destDir,name));
 return {audioPath:'audio/'+name,signal,pacing,bytes:stat.size};
}
/** Generate an offline, portable audition report. No synthesis, publication, AI/voice calls, or network access. */
export function buildVoiceAudition({manifestPath,outputDir,templatePath=path.join(currentDir,'voice-listening-room.html')}){
 const manifest=normalizeManifest(JSON.parse(fs.readFileSync(manifestPath,'utf8')));
 const inputDir=path.dirname(path.resolve(manifestPath));
 const output=path.resolve(outputDir);
 const realInput=fs.realpathSync(inputDir);
 const sourceFiles=manifest.candidates.map(c=>{
   if(path.isAbsolute(c.sourcePath))throw Error('audition_absolute_source_path_rejected');
   const resolved=fs.realpathSync(path.resolve(inputDir,c.sourcePath));
   if(!resolved.startsWith(realInput+path.sep))throw Error('audition_source_outside_manifest_directory');
   return resolved;
 });
 // Never overwrite a source directory or a source recording in place.
 if(sourceFiles.some(s=>s===output||s.startsWith(output+path.sep)))throw Error('audition_source_inside_output_dir');
 if(!fs.existsSync(templatePath))throw Error('audition_template_missing');
 fs.mkdirSync(path.join(output,'audio'),{recursive:true});
 let total=0;
 const candidates=manifest.candidates.map(c=>{
   const result=copyCandidateAudio(sourceFiles[manifest.candidates.indexOf(c)],path.join(output,'audio'));
   total+=result.bytes;
   if(total>TOTAL_MAX)throw Error('audition_total_audio_size_exceeded');
   let transcriptAudit=null;
   if(c.asrObservationPath){
     if(path.isAbsolute(c.asrObservationPath))throw Error('audition_asr_absolute_path_rejected');
     const resolved=fs.realpathSync(path.resolve(inputDir,c.asrObservationPath));
     if(!resolved.startsWith(realInput+path.sep))throw Error('audition_asr_path_outside_project');
     const stat=fs.statSync(resolved);
     if(!stat.isFile()||stat.size>262144||stat.size===0)throw Error('audition_asr_json_size_invalid');
     transcriptAudit=assessVoiceTranscript({
       plannedCue:{cueId:c.id,text:c.scriptText,locale:c.locale,pronunciation:[]},
       take:{artifactDigest:result.signal.audioDigest},
       observation:JSON.parse(fs.readFileSync(resolved,'utf8'))
     });
   }
   const {sourcePath,asrObservationPath,...publicCandidate}=c;
   const status=result.signal.status!=='objective_measurements_only'?'signal_held'
     :transcriptAudit&&transcriptAudit.status!=='candidate_text_match_needs_human_review'
       ?'asr_review_held':'awaiting_human_review';
   return {...publicCandidate,audioPath:result.audioPath,signal:result.signal,pacing:result.pacing,
     transcriptAudit,asrAnalysisStatus:transcriptAudit?.status??'asr_not_provided',bytes:result.bytes,
     pacingReviewRequired:result.pacing.warnings.length>0,
     audibleQualityReviewed:false,consentEvidenceVerified:false,
     status};
 });
 const report={
   schema:'evercraft.voice-foundry.audition-report.v1',
   projectId:manifest.projectId,scriptText:manifest.scriptText,locale:manifest.locale,
   candidates,
   verdict:'INTERNAL_AUDITION_ONLY',
   rightsAndConsentUnverified:true,
   publicationAuthorityGranted:false,
   providerCallsMade:false,
   paidGenerationAuthorized:false,
   notes:'Synthetic audio measurements do not establish human speech, authentic accents, commercial rights or subjective listening quality. Reviewer exports are unverified drafts.'
 };
 fs.writeFileSync(path.join(output,'audition-report.json'),stableJson(report));
 // Escape script delimiters to make metadata a data assignment, not injected code.
 const embedded=JSON.stringify(report).replace(/[<>&\u2028\u2029]/g,char=>`\\u${char.codePointAt(0).toString(16).padStart(4,'0')}`);
 fs.writeFileSync(path.join(output,'audition-data.js'),'window.__EVERCRAFT_VOICE_AUDITION_DATA__ = '+embedded+';\n');
 fs.copyFileSync(templatePath,path.join(output,'index.html'));
 return {reportPath:path.join(output,'audition-report.json'),indexPath:path.join(output,'index.html'),
         candidates:candidates.length,held:candidates.filter(c=>c.status!=='awaiting_human_review').length};
}
function main(){
 const [manifestPath,outputDir,...extra]=process.argv.slice(2);
 if(!manifestPath||!outputDir||extra.length)throw Error('Usage: node voice-audition-kit.mjs <manifest.json> <output-dir>');
 console.log(JSON.stringify(buildVoiceAudition({manifestPath,outputDir}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
