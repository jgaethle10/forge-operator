import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVERCRAFT_STUDIO_WORLD_V1,
  compileStudioJourney,
  compileStudioRoomStage,
  studioWorldDigest,
  transitionBetween,
} from './studio-world.js';
import { validateStage } from './visual-stage.js';

test('Evercraft HQ canon exposes the seven recurring rooms',()=>{
  assert.deepEqual(
    EVERCRAFT_STUDIO_WORLD_V1.rooms.map(room=>room.id),
    ['lobby','global_ops','product_gallery','research_lab','field_bay','proof_room','observation_deck']
  );
  assert.equal(studioWorldDigest(EVERCRAFT_STUDIO_WORLD_V1).length,64);
});

test('global operations compiles real subject media plus a map into fixed room surfaces',()=>{
  const stage=compileStudioRoomStage({
    id:'week-in-motion-global-ops',
    roomId:'global_ops',
    headline:'Naval movement across the Pacific',
    subhead:'Public-source track visualization',
    durationSec:14,
    contents:[
      {
        slotId:'subject-wall',
        kind:'media',
        assetId:'destroyer-source',
        mediaKind:'video',
        evidenceState:'licensed',
        sourceRefs:['license:destroyer-source']
      },
      {
        slotId:'world-wall',
        kind:'geo',
        centerLat:25,
        centerLon:155,
        zoom:1.35,
        routes:[{
          id:'route-a',
          points:[{lat:34,lon:140},{lat:31,lon:155},{lat:27,lon:170}],
          evidenceState:'public_source',
          sourceRefs:['track:001']
        }],
        evidenceState:'public_source',
        sourceRefs:['track:001']
      },
      {
        slotId:'ops-strip',
        kind:'metric',
        label:'TRACKED',
        value:42,
        evidenceState:'public_source',
        sourceRefs:['track:001']
      }
    ]
  });

  assert.equal(validateStage(stage).status,'accepted');
  const plate=stage.layers.find(layer=>layer.id==='studio-set-plate');
  assert.equal(plate?.kind,'media');
  if(plate?.kind==='media') assert.equal(plate.sourcePath,'asset://evercraft-hq-global-ops-v1');

  const subject=stage.layers.find(layer=>layer.id.includes('subject-wall'));
  assert.equal(subject?.kind,'media');
  assert.equal(subject?.rotateYDeg,-4);

  const map=stage.layers.find(layer=>layer.id.includes('world-wall'));
  assert.equal(map?.kind,'geo');
  assert.equal(map?.rotateYDeg,4);
});

test('journey preserves the canonical room transition grammar and world digest',()=>{
  const journey=compileStudioJourney({
    id:'week-001',
    stops:[
      {id:'open',roomId:'lobby',headline:'This week across Evercraft',contents:[]},
      {id:'ops',roomId:'global_ops',headline:'The world moved',contents:[]},
      {id:'products',roomId:'product_gallery',headline:'The products moved too',contents:[]}
    ]
  });
  assert.equal(journey.stages[0].transitionIn,null);
  assert.equal(journey.stages[1].transitionIn?.style,'dolly_through_portal');
  assert.equal(journey.stages[2].transitionIn?.style,'match_display');
  assert.equal(journey.worldDigest,studioWorldDigest(EVERCRAFT_STUDIO_WORLD_V1));
});

test('unknown room-to-room movement fails instead of inventing new studio geography',()=>{
  assert.throws(
    ()=>transitionBetween(EVERCRAFT_STUDIO_WORLD_V1,'lobby','proof_room'),
    /studio_transition_missing/
  );
});
