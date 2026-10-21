import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStageHtml } from './runtime.mjs';

const media = {
  id:'actual-native-camera',kind:'media',mediaKind:'image',fit:'cover',
  z:1,x:25,y:150,width:490,height:630,
  sourcePath:'asset://camera-test',evidenceState:'observed',
  sourceRefs:['ci:synthetic-raster'],
  sourceWindow:{x:300,y:400,width:840,height:1080,sourceWidth:1440,sourceHeight:2408},
  sourceWindowKeyframes:[
    {t:0,x:300,y:400,width:840,height:1080},
    {t:1.5,x:300,y:850,width:840,height:1080,ease:'ease_in_out'},
    {t:3,x:300,y:1250,width:840,height:1080,ease:'ease_in_out'},
  ],
};
const stage = {
  schema:'evercraft.fallen.visual-stage.v1',id:'native-camera-contract',
  width:540,height:960,fps:30,durationSec:3,background:'#080b0b',
  camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
  layers:[media],
  createdAt:'2026-10-19T00:00:00.000Z',
};
test('private chromium HTML honors source-window crop and time-based source-camera positions',()=>{
  const html=buildStageHtml(stage);
  assert.match(html,/https:\/\/fallen\.local\/assets\/camera-test/);
  assert.match(html,/position:absolute;max-width:none/);
  assert.match(html,/sourceWindowKeyframes/);
  assert.match(html,/const sourceAt=/);
  assert.match(html,/const applySource=/);
  assert.match(html,/applySource\(el\.querySelector\('img,video'\),sourceAt\(l,t\)\)/);
  assert.match(html,/__evercraftRenderFrame/);
});
