import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pngPixel } from './camera-png.mjs';

const base=process.argv[2];
if(!base) throw new Error('Usage: node camera-canary-assert.mjs <artifact-prefix>');

const seen=new Set();
const expected=[['red',0],['green',45],['blue',89]];
const results=[];
for(const [color,frame] of expected){
  const reply=JSON.parse(fs.readFileSync(`${base}-${frame}.json`,'utf8'));
  assert.equal(reply.ok,true);
  assert.equal(reply.boundaries?.external_network_allowed,false);
  assert.equal(reply.boundaries?.asset_sha256_verified,true);
  assert.equal(reply.frames?.length,1);
  assert.equal(reply.frames[0].frame,frame);
  assert.equal(reply.console_errors?.length,0);
  const file=`${base}-${frame}.png`;
  const bytes=fs.readFileSync(file);
  assert.equal(reply.frames[0].sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  const rgb=pngPixel(file,270,465);
  const index={red:0,green:1,blue:2}[color];
  if(index===undefined) throw new Error('unexpected_color');
  assert.ok(rgb[index]>175,`expected ${color} at frame ${frame}, got ${rgb.join(',')}`);
  assert.ok(rgb.filter((v,i)=>i!==index).every(v=>v<90),`unexpected other channels: ${rgb.join(',')}`);
  assert.equal(seen.has(reply.frames[0].sha256),false,'camera frame hash must change');
  seen.add(reply.frames[0].sha256);
  results.push({frame,expected:color,observed_rgb:rgb,frame_sha256:reply.frames[0].sha256});
}
const receipt={
  schema:'evercraft.fallen.native-camera-pixel-proof.v1',
  status:'passed',
  engine:'evercraft-fallen-render-worker-v1',
  synthetic_fixture:true,
  capture_type:'exact_chromium_pixel_samples',
  checks:results,
  external_network_authority:false,
  creative_approval:false,
  publication_authority:false,
};
fs.writeFileSync(base+'-proof.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
