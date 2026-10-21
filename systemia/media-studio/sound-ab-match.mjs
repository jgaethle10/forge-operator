/** Reproducible gain-only blind A/B between two existing authorized audio files.
 * This is a listening aid, NEVER a quality, rights or publication certification.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function run(command,args){
  const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});
  if(r.error || r.status!==0)throw new Error('sound_ab_command_failed:'+command+':'+String(r.error?.message||r.stderr).slice(-700));
  return String(r.stderr||'') || String(r.stdout||'');
}
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function summaryField(log,expr){
  const m=expr.exec(log);
  if(!m)throw new Error('sound_ab_ebur128_field_missing');
  const n=Number(m[1]);return Number.isFinite(n)?n:null;
}
export function parseSoundAbEbur128(log){
  const i=log.lastIndexOf('Summary:');
  if(i<0)throw new Error('sound_ab_ebur128_summary_missing');
  const text=log.slice(i);
  return {
    integrated_lufs:summaryField(text,/Integrated loudness:\s*I:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*LUFS/i),
    lra_lu:summaryField(text,/Loudness range:\s*LRA:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*LU/i),
    true_peak_dbtp:summaryField(text,/True peak:\s*Peak:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*dBFS/i),
  };
}
function observe(file){
  return parseSoundAbEbur128(run('ffmpeg',['-hide_banner','-nostats','-v','info','-i',file,
    '-map','0:a:0','-vn','-af','ebur128=peak=true','-f','null','-']));
}
function duration(file){
  const r=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries',
    'stream=duration:format=duration','-of','json',file],{encoding:'utf8',timeout:120000});
  if(r.error||r.status!==0)throw new Error('sound_ab_probe_failed');
  const j=JSON.parse(r.stdout);
  if(!j.streams?.length)throw new Error('sound_ab_audio_stream_missing');
  const n=Number(j.streams[0].duration||j.format?.duration);
  if(!Number.isFinite(n)||n<=0||n>1200)throw new Error('sound_ab_duration_invalid');
  return n;
}
const r3=n=>Math.round(n*1000)/1000;
export function chooseSoundAbGain(a,b,{targetLufs=-18,peakCeilingDbtp=-1.5}={}){
  for(const x of [a,b])if(!Number.isFinite(x?.integrated_lufs)||!Number.isFinite(x?.true_peak_dbtp)){
    throw new Error('sound_ab_unmeasurable_audio');
  }
  if(!Number.isFinite(targetLufs)||targetLufs < -30||targetLufs> -8||
     !Number.isFinite(peakCeilingDbtp)||peakCeilingDbtp < -9||peakCeilingDbtp> -.5){
    throw new Error('sound_ab_level_policy_invalid');
  }
  // Harder-to-normalize file sets the achievable target; neither is limited.
  const achieved=Math.min(targetLufs,
    a.integrated_lufs+peakCeilingDbtp-a.true_peak_dbtp-.35,
    b.integrated_lufs+peakCeilingDbtp-b.true_peak_dbtp-.35);
  return {requested_lufs:targetLufs,target_lufs:r3(achieved),
    gain_db:[r3(achieved-a.integrated_lufs),r3(achieved-b.integrated_lufs)],
    peak_ceiling_dbtp:peakCeilingDbtp,gain_only:true,automatic_compression:false};
}
export function prepareSoundAB({a,b,out,targetLufs=-18,peakCeilingDbtp=-1.5}){
  if(!a||!b||!out)throw new Error('sound_ab_inputs_required');
  const inputs=[path.resolve(a),path.resolve(b)],folder=path.resolve(out);
  if(inputs.includes(folder)||inputs.some(x=>folder.startsWith(x+path.sep)))throw new Error('sound_ab_output_overlaps_source');
  for(const name of inputs)if(!fs.statSync(name).isFile())throw new Error('sound_ab_input_not_file');
  if(fs.existsSync(folder))throw new Error('sound_ab_destination_exists');
  const durations=inputs.map(duration);
  if(Math.abs(durations[0]-durations[1])>Math.max(.25,.01*Math.max(...durations))){
    throw new Error('sound_ab_duration_mismatch');
  }
  const before=inputs.map(observe);
  const policy=chooseSoundAbGain(before[0],before[1],{targetLufs,peakCeilingDbtp});
  const sourceDigests=inputs.map(digest);
  fs.mkdirSync(folder,{recursive:false});
  try{
    const names=['blind_A.wav','blind_B.wav'];
    for(let i=0;i<2;i++){
      run('ffmpeg',['-y','-v','error','-i',inputs[i],'-map','0:a:0','-af',
        'volume='+policy.gain_db[i]+'dB:precision=double',
        '-ar','48000','-ac','2','-c:a','pcm_s24le',path.join(folder,names[i])]);
    }
    const after=names.map(name=>observe(path.join(folder,name)));
    for(const m of after){
      if(!Number.isFinite(m.integrated_lufs)||!Number.isFinite(m.true_peak_dbtp))throw new Error('sound_ab_output_unmeasurable');
      if(m.true_peak_dbtp>peakCeilingDbtp+.1)throw new Error('sound_ab_peak_ceiling_exceeded');
    }
    const delta=r3(Math.abs(after[0].integrated_lufs-after[1].integrated_lufs));
    if(delta>.35)throw new Error('sound_ab_post_render_loudness_mismatch');
    const receipt={schema:'evercraft.sound.blind-ab.v1',
      samples:names.map((name,i)=>({label:i===0?'A':'B',filename:name,
        original_source:path.basename(inputs[i]),original_sha256:sourceDigests[i],
        output_sha256:digest(path.join(folder,name)),input_measurements:before[i],
        output_measurements:after[i],applied_gain_db:policy.gain_db[i]})),
      policy,original_duration_seconds:durations.map(r3),
      comparison_lufs_difference:delta,comparison_is_level_matched:true,
      blind_human_listening_not_conducted:true,no_automated_sound_quality_ranking:true,
      source_rights_verified:false,commercial_release_approved:false,
      publication_authority_granted:false};
    fs.writeFileSync(path.join(folder,'REVIEW_README.txt'),
      'EVERCRAFT BLIND LISTENING STUDY\n\nCompare blind_A.wav and blind_B.wav at the same device volume.\n'+
      'Rate emotion, phrasing, note releases, pumping, timbre and clarity.\n'+
      'Do not open sealed_source_receipt.json until ratings are recorded.\n'+
      'Do not interpret loudness matching as rights clearance or release authority.\n');
    fs.writeFileSync(path.join(folder,'sealed_source_receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    return receipt;
  }catch(error){fs.rmSync(folder,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length!==6||args[0]!=='--a'||args[2]!=='--b'||args[4]!=='--out'){
    console.error('Usage: node sound-ab-match.mjs --a sourceA.wav --b sourceB.wav --out new-directory');
    process.exitCode=2;
  }else{
    try{
      const receipt=prepareSoundAB({a:args[1],b:args[3],out:args[5]});
      console.log(JSON.stringify({status:'prepared',lufs_delta:receipt.comparison_lufs_difference,release_ready:false},null,2));
    }catch(error){console.error(String(error.message));process.exitCode=1;}
  }
}
