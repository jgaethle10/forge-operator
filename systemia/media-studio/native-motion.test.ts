import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileNativeMotionScene,
  validateNativeMotionScene,
  type NativeMotionScene,
} from './native-motion.js';

function specimen():NativeMotionScene{
  return {
    schema:'evercraft.fallen.native-motion-scene.v1',
    id:'eps-snow-commercial-v1',
    aspectRatio:'16:9',
    durationSec:15,
    fps:30,
    seed:'eps-snow-2026-v1',
    background:{
      skyTop:'#06111f',
      skyBottom:'#385a70',
      horizonGlow:'rgba(255,178,94,.28)',
      ground:'#dfe9ef',
      road:'#25313a',
      snow:'#f5f9fb',
    },
    camera:[
      {t:0,x:0,y:0,zoom:1},
      {t:7.5,x:120,y:-12,zoom:1.06,ease:'ease_in_out'},
      {t:15,x:250,y:0,zoom:1.1,ease:'ease_in_out'},
    ],
    actors:[
      {
        id:'warehouse',
        primitive:'commercial_building',
        z:1,
        width:980,
        height:360,
        color:'#1c252b',
        path:[{t:0,x:470,y:-80,scale:1},{t:15,x:470,y:-80,scale:1}],
      },
      {
        id:'plow-one',
        primitive:'snowplow_truck',
        z:8,
        width:410,
        height:215,
        color:'#102c45',
        accentColor:'#55bdff',
        path:[
          {t:0,x:-960,y:230,scale:.94},
          {t:8,x:40,y:190,scale:1.03,ease:'ease_in_out'},
          {t:15,x:980,y:135,scale:1.08,ease:'ease_in_out'},
        ],
      },
    ],
    emitters:[
      {id:'falling-snow',kind:'snow',z:20,count:320,startSec:0,endSec:15,bounds:{x:0,y:0,width:1920,height:1080},opacity:.7},
      {id:'plow-spray',kind:'plow_spray',z:9,count:90,startSec:.3,endSec:14.7,actorId:'plow-one',offset:{x:170,y:80},velocity:{x:170,y:-130},spread:1.25},
    ],
    textCues:[
      {id:'hook',startSec:.25,endSec:4,text:'WINTER DOES NOT WAIT.',x:95,y:90,width:1120,fontSize:82,fontWeight:800},
      {id:'award',startSec:4.1,endSec:10,text:'2026 COMMUNITYVOTES YAKIMA · GOLD · SNOW REMOVAL',x:95,y:90,width:1320,fontSize:44,fontWeight:800,sourceRefs:['communityvotes:eps:2026:snow-removal:gold']},
      {id:'cta',startSec:10.2,endSec:14.8,text:'RESERVE YOUR COMMERCIAL WINTER ROUTE NOW',x:95,y:90,width:1450,fontSize:62,fontWeight:800},
    ],
    provenance:{
      mode:'synthetic_visualization',
      sourceRefs:['evercraft:fallen:native-motion:v1'],
      factualClaimRefs:['communityvotes:eps:2026:snow-removal:gold'],
    },
  };
}

test('native motion compiles a deterministic exact-frame scene',()=>{
  const first=compileNativeMotionScene(specimen());
  const second=compileNativeMotionScene(specimen());
  assert.equal(first.receipt.digest,second.receipt.digest);
  assert.equal(first.receipt.renderer,'evercraft-native-canvas-2d-v1');
  assert.deepEqual(first.receipt.dimensions,{width:1920,height:1080,fps:30,durationSec:15});
  assert.match(first.html,/__evercraftRenderAt/);
  assert.match(first.html,/__evercraftRenderFrame/);
  assert.match(first.html,/SYNTHETIC VISUALIZATION/);
  assert.match(first.html,/snowplow_truck/);
});

test('native motion fails closed without provenance',()=>{
  const scene=specimen();
  scene.provenance.sourceRefs=[];
  const validation=validateNativeMotionScene(scene);
  assert.equal(validation.status,'rejected');
  assert.ok(validation.errors.includes('provenance_source_refs_missing'));
});

test('claim-bearing title cues require factual claim lineage',()=>{
  const scene=specimen();
  scene.provenance.factualClaimRefs=[];
  const validation=validateNativeMotionScene(scene);
  assert.equal(validation.status,'rejected');
  assert.ok(validation.errors.includes('factual_claim_refs_missing'));
});

test('emitters may not bind to an unknown actor',()=>{
  const scene=specimen();
  scene.emitters.push({
    id:'bad-emitter',
    kind:'plow_spray',
    z:10,
    count:20,
    startSec:1,
    endSec:2,
    actorId:'missing-actor',
  });
  const validation=validateNativeMotionScene(scene);
  assert.equal(validation.status,'rejected');
  assert.ok(validation.errors.includes('emitter_actor_missing:bad-emitter:missing-actor'));
});
