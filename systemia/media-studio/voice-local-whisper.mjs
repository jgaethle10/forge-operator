import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessVoiceTranscript} from './voice-transcript-verifier.mjs';

const MAX_AUDIO_BYTES=30*1024*1024;
const MAX_MODEL_BYTES=3500*1024*1024;
const MAX_SECONDS=150;
const MAX_TEXT_BYTES=64*1024;
const SHA=/^[a-f0-9]{64}$/i;
const CLI_TIMEOUT_MS=180000;
const idRE=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
function fail(reason){throw new Error('voice_local_asr_'+reason);}
function requiredFile(input,label,maxBytes){
 if(typeof input!=='string'||!input.trim())fail(label+'_path_missing');
 let file;try{file=fs.realpathSync(input);}catch{fail(label+'_not_installed');}
 const st=fs.statSync(file);
 if(!st.isFile()||st.size===0||st.size>maxBytes)fail(label+'_file_invalid_or_oversize');
 return {file,bytes:st.size};
}
async function fileSha256(file){
 const hash=crypto.createHash('sha256');
 for await (const chunk of fs.createReadStream(file,{highWaterMark:1024*1024}))hash.update(chunk);
 return hash.digest('hex');
}
function command(executable,args,timeout=CLI_TIMEOUT_MS){
 const result=spawnSync(executable,args,{encoding:'utf8',timeout,maxBuffer:1024*1024,shell:false});
 if(result.error)fail('process_error:'+result.error.code);
 if(result.status!==0)fail('process_failed:'+result.status+':'+String(result.stderr).slice(-280));
 return result;
}
function getDuration(file){
 const result=command('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],20000);
 const data=JSON.parse(result.stdout);
 const seconds=Number(data.format?.duration);
 if(!data.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(seconds)||seconds<=0||seconds>MAX_SECONDS)fail('audio_duration_or_stream_invalid');
 return seconds;
}
/**
 * Actually invokes a caller-installed local whisper.cpp CLI against a real media file.
 * The caller must separately install/license a model and know/trust its binary path.
 * No downloads, remote APIs, secret keys or paid generation.
 * This executes local programs: accept trusted paths only, never untrusted web input.
 */
export async function runLocalWhisperAudit({session,cueId,audioPath,modelPath,whisperCliPath,outputDir,expectedModelSha256,expectedBinarySha256}){
 if(session?.schema!=='evercraft.voice-foundry.session.v1'||session.status!=='ready_for_authorized_generation'||!Array.isArray(session.cues))
   fail('casting_session_not_ready');
 if(typeof cueId!=='string'||!idRE.test(cueId))fail('cue_id_unsafe');
 const matched=session.cues.filter(c=>c?.cueId===cueId&&c?.status==='ready_for_authorized_generation');
 if(matched.length!==1)fail('approved_cue_missing_or_duplicate');
 const cue=matched[0];
 if(typeof cue.text!=='string'||!cue.text.trim()||!Array.isArray(cue.pronunciation))fail('cue_script_or_lexicon_invalid');
 let language;try{language=new Intl.Locale(cue.locale).language;}catch{fail('locale_invalid');}
 const audio=requiredFile(audioPath,'audio',MAX_AUDIO_BYTES);
 const model=requiredFile(modelPath,'model',MAX_MODEL_BYTES);
 const binary=requiredFile(whisperCliPath,'binary',50*1024*1024);
 if(!path.isAbsolute(whisperCliPath))fail('whisper_cli_absolute_path_required');
 if(!(fs.statSync(binary.file).mode&0o111))fail('binary_not_executable');
 if(typeof outputDir!=='string'||!outputDir.trim())fail('output_directory_missing');
 const output=path.resolve(outputDir);
 if(!fs.existsSync(output)||!fs.statSync(output).isDirectory())fail('output_directory_not_existing');
 const observationPath=path.join(output,'voice-asr-'+cueId+'.json');
 const auditPath=path.join(output,'voice-asr-audit-'+cueId+'.json');
 if(fs.existsSync(observationPath)||fs.existsSync(auditPath))fail('output_already_exists');
 getDuration(audio.file);
 if(!SHA.test(expectedModelSha256??'')||!SHA.test(expectedBinarySha256??''))fail('model_and_binary_digest_pins_required');
 const [audioDigest,modelDigest,binaryDigest]=await Promise.all([
   fileSha256(audio.file),fileSha256(model.file),fileSha256(binary.file)
 ]);
 if(modelDigest.toLowerCase()!==expectedModelSha256.toLowerCase()||binaryDigest.toLowerCase()!==expectedBinarySha256.toLowerCase())
   fail('model_or_binary_digest_pin_mismatch');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-whisper-asr-'));
 try{
   const pcm=path.join(scratch,'speech-16k-mono.wav');
   command('ffmpeg',['-nostdin','-v','error','-i',audio.file,'-vn','-ar','16000','-ac','1','-c:a','pcm_s16le','-y',pcm],40000);
   const pcmHash=await fileSha256(pcm);
   const outPrefix=path.join(scratch,'recognition');
   command(binary.file,['-m',model.file,'-f',pcm,'-l',language,'-otxt','-of',outPrefix,'-np']);
   const textPath=outPrefix+'.txt';
   if(!fs.existsSync(textPath))fail('recognized_text_file_missing');
   const meta=fs.statSync(textPath);
   if(!meta.isFile()||meta.size===0||meta.size>MAX_TEXT_BYTES)fail('recognized_text_missing_or_oversize');
   const recognizedText=fs.readFileSync(textPath,'utf8').trim();
   if(!recognizedText)fail('recognized_text_empty');
   const observation={
     schema:'evercraft.voice-foundry.asr-observation.v1',
     method:'automated_asr',
     engineId:'whisper.cpp-local-executable',
     engineVersion:'local-cli-binary-sha256:'+binaryDigest,
     sourceReceiptRef:'local-whisper-model-sha256:'+modelDigest,
     modelDigest,pcmDigest:pcmHash,
     cueId,locale:cue.locale,audioDigest,recognizedText
   };
   const transcript=assessVoiceTranscript({plannedCue:cue,take:{artifactDigest:audioDigest},observation});
   const record={
     schema:'evercraft.voice-foundry.local-asr-run.v1',
     cueId,audioDigest,modelDigest,binaryDigest,pcmDigest:pcmHash,
     transcript,status:transcript.status==='candidate_text_match_needs_human_review'?'text_match_needs_human_review':'held',
     sourceAudioActuallyHashed:true,transcriptionProcessActuallyInvoked:true,
     recognizerIdentityExternallyAuthenticated:false,
     actualSpeakerIdentityVerified:false,
     truePronunciationVerified:false,
     consentAndRightsVerified:false,publicationAuthorityGranted:false
   };
   // Create-only, before any public promotion. A partial write is not an approval.
   let wroteObservation=false;
   try{
     fs.writeFileSync(observationPath,JSON.stringify(observation,null,2)+'\n',{flag:'wx',mode:0o600});
     wroteObservation=true;
     fs.writeFileSync(auditPath,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
   }catch(e){
     if(wroteObservation)fs.rmSync(observationPath,{force:true});
     throw e;
   }
   return {observationPath,auditPath,observation,record};
 }finally{
   fs.rmSync(scratch,{recursive:true,force:true});
 }
}
const current=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===current){
 const [sessionPath,cueId,audioPath,cliPath,modelPath,outputDir,expectedModelSha256,expectedBinarySha256,...rest]=process.argv.slice(2);
 if(!sessionPath||!cueId||!audioPath||!cliPath||!modelPath||!outputDir||!expectedModelSha256||!expectedBinarySha256||rest.length){
   process.stderr.write('Usage: node voice-local-whisper.mjs <casting-session.json> <cue-id> <audio> <absolute-whisper-cli> <model.bin> <existing-output-dir> <model-sha256> <cli-sha256>\n');
   process.exitCode=1;
 }else{
   try{
     const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
     const result=await runLocalWhisperAudit({session,cueId,audioPath,whisperCliPath:cliPath,modelPath,outputDir,expectedModelSha256,expectedBinarySha256});
     process.stdout.write(JSON.stringify({status:result.record.status,observationPath:result.observationPath,auditPath:result.auditPath},null,2)+'\n');
     if(result.record.status==='held')process.exitCode=2;
   }catch(error){process.stderr.write(String(error.message??error)+'\n');process.exitCode=1;}
 }
}
