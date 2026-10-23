import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessVoiceTranscript} from './voice-transcript-verifier.mjs';

const MAX_AUDIO_BYTES=30*1024*1024;
const MAX_JSON_BYTES=256*1024;
const SHA=/^[a-f0-9]{64}$/i;
function readJson(filePath){
  const p=fs.realpathSync(filePath);
  const stat=fs.statSync(p);
  if(!stat.isFile()||stat.size<=0||stat.size>MAX_JSON_BYTES)throw new Error('voice_asr_input_json_too_large_or_invalid');
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function audioFingerprint(audioPath){
  const source=fs.realpathSync(audioPath);
  const stat=fs.statSync(source);
  if(!stat.isFile()||stat.size<=0||stat.size>MAX_AUDIO_BYTES)throw new Error('voice_asr_audio_size_invalid');
  // The hash always comes from the actual file on disk; never from the input JSON.
  const digest=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  return {source,bytes:stat.size,digest};
}
/** Cross-check a declared external ASR observation against real local audio bytes. */
export function auditVoiceRecording({session,cueId,audioPath,observation}){
  if(session?.schema!=='evercraft.voice-foundry.session.v1'||!Array.isArray(session.cues)||
     session.status!=='ready_for_authorized_generation')throw new Error('voice_asr_cast_session_not_ready');
  const matches=session.cues.filter(c=>c?.cueId===cueId);
  if(matches.length!==1||matches[0].status!=='ready_for_authorized_generation')
    throw new Error('voice_asr_cast_cue_not_unique_and_ready');
  const plannedCue=matches[0];
  const audio=audioFingerprint(audioPath);
  const transcript=assessVoiceTranscript({
    plannedCue,take:{artifactDigest:audio.digest},observation
  });
  const reasons=[...transcript.reasons];
  if(!SHA.test(plannedCue.planDigest??''))reasons.push('voice_asr_plan_digest_missing');
  const record={
    schema:'evercraft.voice-foundry.asr-audio-evidence.v1',
    cueId,audioDigest:audio.digest,audioBytes:audio.bytes,
    castPlanDigest:plannedCue.planDigest??null,
    asrEngineId:observation?.engineId??null,
    asrReceiptRef:observation?.sourceReceiptRef??null,
    transcript,
    status:reasons.length?'held':'candidate_text_match_needs_listening',
    reasons,
    sourceAudioActuallyHashed:true,
    externalAsrProviderReceiptIndependentlyVerified:false,
    spokenWordsHeardByHuman:false,
    pronunciationConfirmed:false,
    approvedForCommercialUse:false,
    publicationAuthorityGranted:false
  };
  return record;
}
const current=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===current){
  try{
    const [sessionPath,cueId,audioPath,observationPath,...extra]=process.argv.slice(2);
    if(!sessionPath||!cueId||!audioPath||!observationPath||extra.length)
      throw new Error('Usage: node voice-asr-evidence.mjs <casting-session.json> <cue-id> <audio-file> <asr-observation.json>');
    const result=auditVoiceRecording({
      session:readJson(sessionPath),cueId,audioPath,observation:readJson(observationPath)
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.status==='held')process.exitCode=2;
  }catch(error){process.stderr.write(String(error.message??error)+'\n');process.exitCode=1;}
}
