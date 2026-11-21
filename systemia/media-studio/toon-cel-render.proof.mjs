#!/usr/bin/env node
/** End-to-end ORIGINAL-FOX CANARY ONLY: Fallen Series Mode -> shot packet -> FFmpeg MP4. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {compileSeriesEpisode} from './series.ts';
import {compileToonShotHandoff} from './toon-shot-handoff.mjs';
import {renderToonCelPreview} from './toon-cel-adapter.mjs';

const output=process.argv[2]||'_toon_shot_preview';
const python=process.argv[3]||'python3';
const variant=process.argv[4]||'reach';
assert.ok(['reach','observe','speak'].includes(variant),'unknown original-fox acting variant');
const bible={
  schema:'evercraft.fallen.series-bible.v1',
  id:'original-lantern-fox',
  title:'Lantern Fox: Original Animation Engineering Specimen',
  styleRules:['Paper-cut 2D character rig with physically motivated lantern reach.'],
  entities:[
    {id:'ember',kind:'character',name:'Ember',immutableTraits:{species:'fox',fur:'rust',eyes:'dark brown'},
      voiceProfileId:'fictional-fox-voice-locked',referenceAssetIds:['original-fox-art-reference']},
    {id:'pines',kind:'location',name:'Lantern Grove',immutableTraits:{setting:'fictional forest'}},
  ],
  canon:[],
};
const project={
  id:'original-lantern-fox-canary',title:'Fox and Lantern',
  brief:{prompt:'A fictional fox notices an enchanted lantern and reaches for it.',
    format:'episode',durationSec:60,aspectRatio:'16:9',seriesId:bible.id,
    episodeId:'original-fox-canary-001',style:'Original authored 2D animated cel',
    ...(variant==='speak'?{dialogue:[{id:'scratch-line-1',speakerId:'ember',
      text:'Hello, little light.',emotion:'wonder'}]}:{})},
  assets:[{id:'original-fox-art-reference',path:'upload://synthetic/canary/fox',
    kind:'image',rights:'owned',tags:['fox','fictional','illustrated'],entityRefs:['ember']}],
};
const episode=compileSeriesEpisode(project,bible);
const needs=episode.productionNeeds.filter(need=>need.kind==='video');
assert.ok(needs.length>0,'need actual compiled Series Mode video work');
const shots=needs.map((need,i)=>({
  id:'fox-production-shot-'+String(i+1),visualNeedId:need.id,
  locationId:'pines',durationSec:need.durationSec,
  action:'Ember looks at a lantern and reaches with a small controlled paw',
  soundDirection:variant==='speak'?'Experimental offline synthetic dialogue; no actor-voice match':'Instrumental melody only; no speech is produced in this canary',
  characters:[{entityId:'ember',acting:{
    objective:'Examine the glowing lantern',
    physicalAction:'Reach toward the lantern without changing anatomy',
    face:'Subtle curiosity and one natural blink',
    gazeTarget:'Floating lantern above shoulder',
    hands:'Preserve the single fox paw, claws and grip continuity',
  }}],
  dialogueCueIds:variant==='speak'&&need.durationSec>=3?['scratch-line-1']:[],
  previewMotion:variant==='reach'||variant==='speak'
    ? {specimenProfile:'original_fox_v1',reach:1,blinkAtSec:.75,
       gazeX:1,lanternLift:1,tailEnergy:.8}
    : {specimenProfile:'original_fox_v1',reach:0,blinkAtSec:1.6,
       gazeX:-1,lanternLift:0,tailEnergy:0},

}));
const packet=compileToonShotHandoff({bible,episode,shots,fps:24});
const renderable=packet.shots.filter(s=>s.frameCount/s.fps<=8&&s.frameCount/s.fps>=.5);
assert.ok(renderable.length>0,'no shot inside bounded canary runtime');
const target=variant==='speak'
  ?renderable.find(s=>s.dialogue.some(d=>d.id==='scratch-line-1'))
  :renderable.sort((a,b)=>a.frameCount-b.frameCount)[0];
assert.ok(target,'no renderable shot matched speech cue');
const result=renderToonCelPreview({
  packet,shotId:target.id,outDir:path.resolve(output),
  python,allowSyntheticCanary:true,allowSpeechCanary:variant==='speak',
});
assert.equal(result.state,'rendered_synthetic_preview_only');
assert.equal(result.packetDigest,packet.digest);
assert.equal(result.shotId,target.id);
assert.equal(result.referenceMatched,false);
assert.equal(result.filmMasterReady,false);
assert.equal(result.actualAuthoredMotionApplied,true);
assert.equal(result.measuredAudioMouthReactivity,variant==='speak');
assert.equal(result.voiceProfileMatched,false);
assert.equal(result.phonemeTimingVerified,false);
assert.equal(result.previewMotionDigest,crypto.createHash('sha256').update(JSON.stringify(target.previewMotion)).digest('hex'));
fs.writeFileSync(path.join(path.resolve(output),'bound-shot-work-order.json'),
  JSON.stringify({schema:'evercraft.fallen.toon-original-canary-work-order.v1',
    shotId:target.id,packetDigest:packet.digest,
    shot:target,variant,filmMasterReady:false,publicationAuthority:false},null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
