#!/usr/bin/env node
/**
 * Offline, paid-provider-free multipose storyboard animatic review.
 * Usage:
 * node --import tsx systemia/media-studio/toon-pose-animatic.cli.mjs \
 *   --packet /path/shot-packet.json --manifest /path/sources.json \
 *   --assets /path/sources --shot shot-id --out /path/review
 *
 * Source manifest artwork/voice approvals and rights are declarations; never
 * promote these as verified likeness, licensed content or publish-ready media.
 */
import fs from 'node:fs';
import {renderToonPoseAnimatic} from './toon-pose-animatic.mjs';

const argv=process.argv.slice(2);
const fields=new Set(['--packet','--manifest','--assets','--shot','--out']);
const config={};
for(let i=0;i<argv.length;i+=2){
  if(!fields.has(argv[i])||typeof argv[i+1]!=='string'){
    process.stderr.write('toon_animatic_cli_usage: --packet PATH --manifest PATH --assets DIR --shot ID --out DIR\n');
    process.exit(2);
  }
  config[argv[i].slice(2)]=argv[i+1];
}
if(fields.size!==Object.keys(config).length){
  process.stderr.write('toon_animatic_cli_missing_arguments\n');process.exit(2);
}
try{
  const packet=JSON.parse(fs.readFileSync(config.packet,'utf8'));
  const manifest=JSON.parse(fs.readFileSync(config.manifest,'utf8'));
  const proof=renderToonPoseAnimatic({packet,manifest,shotId:config.shot,
    bundleDir:config.assets,outDir:config.out});
  // Only print artifact metadata, never raw images, speech or embedded data URI.
  process.stdout.write(JSON.stringify({
    schema:proof.schema,state:proof.state,shotId:proof.shotId,
    output:proof.videoPath,sha256:proof.sha256,
    poseCount:proof.sampledPoseFrames.length,frameCount:proof.frameCount,
    lipSyncVerified:false,characterRigAnimated:false,
    masterReady:false,publicationAuthority:false,
  },null,2)+'\n');
}catch(error){
  process.stderr.write('toon_animatic_cli_failed:'+String(error?.message||error).slice(0,350)+'\n');
  process.exitCode=1;
}
