import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVirtualProductionEpisode } from './virtual-production.js';

const base={
  schema:'evercraft.fallen.virtual-production.v1' as const,
  id:'virtual-production-test',
  aspectRatio:'16:9' as const,
  host:{
    id:'host-1',
    assetId:'approved-host-alpha',
    mediaKind:'video' as const,
    evidenceState:'observed' as const,
    sourceRefs:['asset:approved-host-alpha'],
    identityEvidenceRefs:['identity:approved-reference-pack'],
    loop:true,
  },
  beats:[
    {
      id:'lobby-open',
      roomId:'lobby' as const,
      headline:'WEEK IN MOTION',
      durationSec:5,
      cameraMode:'wide_reveal' as const,
      contents:[
        {slotId:'welcome-wall',kind:'text' as const,text:'REAL WEEK',evidenceState:'observed' as const,sourceRefs:['receipt:week']}
      ],
    },
    {
      id:'ops-review',
      roomId:'global_ops' as const,
      headline:'SYSTEMIA',
      durationSec:6,
      cameraMode:'screen_push' as const,
      focusSlotId:'world-wall',
      contents:[
        {slotId:'subject-wall',kind:'text' as const,text:'SYSTEMIA',evidenceState:'observed' as const,sourceRefs:['receipt:systemia']}
      ],
    },
    {
      id:'product-review',
      roomId:'product_gallery' as const,
      headline:'PRODUCTS',
      durationSec:5,
      cameraMode:'follow_host' as const,
      contents:[
        {slotId:'hero-product',kind:'text' as const,text:'RIVET',evidenceState:'observed' as const,sourceRefs:['receipt:rivet']}
      ],
    }
  ]
};

test('virtual production compiles multiple rooms into one continuous stage',()=>{
  const plan=compileVirtualProductionEpisode(base);
  assert.equal(plan.schema,'evercraft.fallen.virtual-production-plan.v1');
  assert.equal(plan.boundaries.continuousWorldSpace,true);
  assert.equal(plan.beatWindows.length,3);
  assert.equal(plan.stage.width,1920);
  assert.ok(plan.stage.durationSec>16,'canonical room transitions add time');

  const roomPlates=plan.stage.layers.filter(layer=>layer.id.endsWith('studio-set-plate'));
  assert.equal(roomPlates.length,3);
  assert.deepEqual(roomPlates.map(layer=>layer.x),[0,1920,3840]);

  const ids=plan.stage.layers.map(layer=>layer.id);
  assert.equal(new Set(ids).size,ids.length,'continuous stage layer ids stay unique');
});

test('camera physically travels through shared world space and can push into a screen',()=>{
  const plan=compileVirtualProductionEpisode(base);
  const frames=plan.stage.camera.keyframes;
  assert.ok(Math.max(...frames.map(frame=>frame.x))>1920,'camera reaches later rooms');
  assert.ok(Math.max(...frames.map(frame=>frame.zoom))>=1.16,'screen push creates a real camera move');
});

test('host is an evidence-bound moving media layer rather than an invented identity',()=>{
  const plan=compileVirtualProductionEpisode(base);
  const host=plan.stage.layers.find(layer=>layer.id==='virtual-host-host-1');
  assert.ok(host);
  assert.equal(host?.kind,'media');
  if(host?.kind==='media'){
    assert.equal(host.sourcePath,'asset://approved-host-alpha');
    assert.equal(host.loop,true);
    assert.ok(Array.isArray(host.translateX));
    const x=host.translateX as Array<{t:number;value:number}>;
    assert.ok(Math.max(...x.map(frame=>frame.value))-Math.min(...x.map(frame=>frame.value))>1920);
    assert.ok(host.sourceRefs?.includes('identity:approved-reference-pack'));
  }
});

test('host identity evidence is mandatory',()=>{
  assert.throws(
    ()=>compileVirtualProductionEpisode({
      ...base,
      host:{...base.host,identityEvidenceRefs:[]}
    }),
    /virtual_production_host_identity_evidence_missing/
  );
});

test('screen push requires a canonical display slot',()=>{
  assert.throws(
    ()=>compileVirtualProductionEpisode({
      ...base,
      beats:[{
        ...base.beats[0],
        cameraMode:'screen_push',
        focusSlotId:undefined,
      }]
    }),
    /virtual_production_screen_push_focus_missing/
  );
});
