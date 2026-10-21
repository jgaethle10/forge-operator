#!/usr/bin/env node
/**
 * Fail-closed source-capture audit for the EXISTING Evercraft Instrument Foundry.
 * Local file / WAV bytes only. Never registers a canonical asset or licenses it.
 *
 * node systemia/media-studio/instrument-foundry-capture-audit.mjs \
 *   --wav path/to/real-piano-note.wav --midi 60 [--out path/to/receipt.json]
 */
import {createHash} from 'node:crypto';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeFoundryPianoWav,checkFoundryPianoRootPitch} from './instrument-foundry-capture-qa.mjs';
import {verifyFoundryWavBytes} from './instrument-foundry-bridge.mjs';

const MAX_BYTES=64*1024*1024;
export async function auditFoundryPianoCapture({bytes,expected_midi,source_name='local-piano-capture'}={}){
  if(!(bytes instanceof Uint8Array)&&!(bytes instanceof ArrayBuffer))
    throw new Error('A local WAV byte buffer is required');
  const wav=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(wav.byteLength<44||wav.byteLength>MAX_BYTES)throw new Error('Capture exceeds bounded WAV budget');
  if(!Number.isInteger(expected_midi)||expected_midi<21||expected_midi>108)
    throw new Error('Expected piano root MIDI note 21..108 required');
  if(typeof source_name!=='string'||source_name.length<1||source_name.length>240)
    throw new Error('A bounded capture source name is required');
  // Source name is presentation only. It cannot grant license, performing rights
  // or authorization to access any other stored media.
  const safeName=basename(source_name);
  const digest=createHash('sha256').update(wav).digest('hex');
  const signalQa=analyzeFoundryPianoWav(wav);
  const asset={
    id:'audio-sha256:'+digest,digest,mime_type:'audio/wav',byte_length:wav.byteLength,
    sample_rate:signalQa.metrics.sample_rate,channels:signalQa.metrics.channels,
    rights:'unknown'
  };
  // Independent integrity/format gate, not the same parser or signal test.
  await verifyFoundryWavBytes(asset,wav);
  const pitch=signalQa.status==='technical_signal_pass'
    ?checkFoundryPianoRootPitch(wav,expected_midi):null;
  const admission=signalQa.status==='technical_signal_pass'&&pitch?.status==='consistent'
    ?'candidate_for_human_listening':'held';
  return {
    schema:'evercraft.fallen.instrument-capture-audit.v1',
    source_name:safeName,
    asset_id:asset.id,
    source_sha256:digest,
    byte_length:wav.byteLength,
    expected_midi,
    status:admission,
    capture_signal_qa:signalQa,
    root_pitch_evidence:pitch,
    blockers:[
      ...signalQa.blockers,
      ...(signalQa.status==='technical_signal_pass'&&pitch?.status!=='consistent'
        ?['pitch_'+(pitch?.status||'missing')+':'+(pitch?.reason||'no_evidence')]:[]),
    ],
    source_provenance_verified:false,
    performer_consent_verified:false,
    human_listening_review:null,
    music_sample_rights_verified:false,
    audio_browser_output_verified:false,
    release_ready:false
  };
}
function args(argv){
  const obj={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i];
    if(!['--wav','--midi','--out'].includes(key)||!argv[i+1]||obj[key]!==undefined)
      throw new Error('Usage: --wav sample.wav --midi 60 [--out receipt.json]');
    obj[key]=argv[i+1];
  }
  if(!obj['--wav']||!obj['--midi'])throw new Error('Expected --wav and --midi');
  return obj;
}
async function main(argv){
  const opts=args(argv);
  const path=resolve(opts['--wav']);
  const meta=await stat(path);
  if(!meta.isFile()||meta.size<44||meta.size>MAX_BYTES)
    throw new Error('Source must be a bounded local WAV file');
  const receipt=await auditFoundryPianoCapture({
    bytes:new Uint8Array(await readFile(path)),
    expected_midi:Number(opts['--midi']),
    source_name:basename(path),
  });
  const json=JSON.stringify(receipt,null,2)+'\n';
  if(opts['--out']){
    // Fail on an existing receipt rather than silently overwriting evidence.
    await writeFile(resolve(opts['--out']),json,{flag:'wx',mode:0o600});
  }else process.stdout.write(json);
  if(receipt.status!=='candidate_for_human_listening')process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(error=>{
    process.stderr.write('Foundry capture audit failed: '+error.message+'\n');
    process.exitCode=1;
  });
}
