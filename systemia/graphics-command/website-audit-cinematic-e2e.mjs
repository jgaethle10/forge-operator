#!/usr/bin/env node
// Synthetic fixture integration proof, NOT genuine film, legal evidence or creative approval.
// Exercises a real FFmpeg -> intake -> Fallen -> ffprobe -> hash receipt pipeline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {template, FILM_SHOTS} from './website-audit-cinematic-intake.mjs';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const intakeCli=path.resolve(cwd,'systemia/graphics-command/website-audit-cinematic-intake.mjs');
function run(command,args,timeout=300000){
  const child=spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:3*1024*1024});
  if(child.status!==0||child.error)throw new Error(
    command+' '+args.slice(0,3).join(' ')+' failed ('+child.status+'): '+
    String(child.stderr||child.stdout||child.error?.message).slice(-1800)
  );
  return child.stdout;
}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function assert(value,why){if(!value)throw new Error('cinematic_e2e:'+why);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-cinema-fixture-'));
try{
  const workspace=path.join(temp,'source');
  const out=path.join(temp,'preview');
  run(process.execPath,[intakeCli,'--init',workspace],10000);
  const form=template();
  const colors=['0x294256','0x1B3B4A','0x394046','0x304C38','0x59442A'];
  for(let i=0;i<FILM_SHOTS.length;i++){
    const shot=FILM_SHOTS[i],item=form.shots[i];
    const video=path.join(workspace,item.file);
    const rights=path.join(workspace,item.rightsEvidenceFile);
    fs.mkdirSync(path.dirname(video),{recursive:true});
    fs.mkdirSync(path.dirname(rights),{recursive:true});
    // Plain test-color frames: deliberately NOT evidence of real people, real UI or actual audit.
    run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',
      'color=c='+colors[i]+':s=640x360:r=15',
      '-t',String(shot.durationSec+0.1),'-c:v','mpeg4','-q:v','25',
      '-pix_fmt','yuv420p','-an',video],60000);
    fs.writeFileSync(rights,'Synthetic, test fixture generated locally in CI. Not licensed for use as customer evidence.\n');
    item.sha256=sha(video);
    item.rights='owned';
    item.sourceRef='synthetic-ci-fixture:'+shot.id;
    if(item.id==='real_audit_capture')item.evidenceRefs=['synthetic-ci-not-real-ui'];
    if(item.id==='five_verified_fixes'){
      item.evidenceRefs=['synthetic-fixture-fix1','synthetic-fixture-fix2',
        'synthetic-fixture-fix3','synthetic-fixture-fix4','synthetic-fixture-fix5'];
    }
  }
  const manifest=path.join(workspace,'film-intake.json');
  fs.writeFileSync(manifest,JSON.stringify(form,null,2)+'\n');
  run(process.execPath,[intakeCli,'--inspect',workspace,manifest,out],45000);
  run(process.execPath,[intakeCli,'--render',workspace,manifest,out],300000);
  const video=path.join(out,'website-audit-PREVIEW-SILENT.mp4');
  const receipt=JSON.parse(fs.readFileSync(path.join(out,'film-preview-receipt.json'),'utf8'));
  const admission=JSON.parse(fs.readFileSync(path.join(out,'film-admission.json'),'utf8'));
  const plan=JSON.parse(fs.readFileSync(path.join(out,'fallen-picture-plan.json'),'utf8'));
  assert(admission.state==='picture_preview_ready','admission');
  assert(admission.admittedSourceCount===5,'source_count');
  assert(admission.publicationAuthority===false,'publication_denied');
  assert(plan.scenes.length===5,'shot_count');
  assert(receipt.sha256===sha(video),'output_hash_receipt');
  assert(receipt.audioMastered===false,'silent_preview_only');
  assert(receipt.publicationAuthority===false,'receipt_publication_denied');
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries',
    'format=duration:stream=codec_type,width,height,r_frame_rate',
    '-of','json',video],10000));
  const videoStream=probe.streams.find(s=>s.codec_type==='video');
  assert(videoStream?.width===1920&&videoStream?.height===1080,'expected_full_hd');
  assert(!probe.streams.some(s=>s.codec_type==='audio'),'no_fake_audio');
  assert(Math.abs(Number(probe.format?.duration)-25)<0.25,'expected_25sec');
  console.log(JSON.stringify({
    schema:'evercraft.website-audit.synthetic-render-ci-proof.v1',
    status:'pass',
    fixture:'test_generated_solid_color_clips_NOT_real_commercial_footage',
    renderer:'existing_fallen_media_studio',
    durationSec:Number(probe.format.duration),
    width:videoStream.width,height:videoStream.height,
    sceneCount:plan.scenes.length,sha256:receipt.sha256,
    audioMastered:false,realCustomerEvidence:false,publicationAuthority:false,
    releaseArtifactPreserved:false,
  },null,2));
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
