import assert from 'node:assert/strict';
import test from 'node:test';
import { compileWorldIntelStage } from './world-intel-stage.js';
import { evaluateStage, validateStage } from './visual-stage.js';

test('world intelligence compiler creates a dimensional sourced scene instead of a title-card sequence',()=>{
  const stage=compileWorldIntelStage({
    id:'fleet-proof',
    headline:'Naval movement across the Pacific',
    subhead:'Public-source track visualization',
    durationSec:18,
    setPlate:{
      sourcePath:'./evercraft-global-ops.jpg',
      mediaKind:'image',
      evidenceState:'synthetic_visualization',
      sourceRefs:['asset:evercraft-global-ops-set']
    },
    subjectMedia:{
      sourcePath:'./destroyer.mp4',
      mediaKind:'video',
      evidenceState:'licensed',
      sourceRefs:['license:destroyer-001']
    },
    map:{
      centerLat:25,
      centerLon:155,
      zoom:1.35,
      routes:[{
        id:'route-a',
        points:[{lat:33,lon:140},{lat:31,lon:154},{lat:28,lon:168}],
        evidenceState:'public_source',
        sourceRefs:['public-track:001']
      }],
      points:[{
        id:'point-a',lat:33,lon:140,label:'TRACK A',
        evidenceState:'public_source',sourceRefs:['public-track:001']
      }]
    },
    metrics:[{
      id:'tracked',label:'TRACKED',value:42,
      evidenceState:'public_source',sourceRefs:['public-track:001']
    }],
    timeline:{
      startSec:0,endSec:12,
      events:[{
        id:'event-1',t:4,label:'position update',
        evidenceState:'public_source',sourceRefs:['public-track:001']
      }]
    }
  });

  const validation=validateStage(stage);
  assert.equal(validation.status,'accepted');
  assert.ok(stage.layers.some(layer=>layer.id==='subject-media' && layer.kind==='media'));
  assert.ok(stage.layers.some(layer=>layer.id==='world-geo' && layer.kind==='geo'));
  assert.ok(stage.layers.some(layer=>layer.id==='intel-timeline' && layer.kind==='timeline'));

  const subject=stage.layers.find(layer=>layer.id==='subject-media');
  assert.equal(subject?.parallax,.9);
  assert.equal(subject?.evidenceState,'licensed');

  const mid=evaluateStage(stage,10);
  const geo=mid.layers.find(layer=>layer.id==='world-geo');
  assert.ok((geo?.opacity??0)>0);
  assert.ok((geo?.geoRoutes?.[0]?.progressValue??0)>0);
});

test('vertical compiler rearranges subject, map and metrics for social cuts',()=>{
  const stage=compileWorldIntelStage({
    id:'vertical-proof',
    headline:'Global infrastructure movement',
    aspectRatio:'9:16',
    subjectMedia:{
      sourcePath:'./ship.jpg',
      mediaKind:'image',
      evidenceState:'public_source',
      sourceRefs:['source:ship']
    },
    map:{
      routes:[{
        id:'route',points:[{lat:0,lon:0},{lat:10,lon:20}],
        evidenceState:'modeled',
        sourceRefs:['model:route']
      }]
    },
    metrics:[{
      id:'count',label:'COUNT',value:10,
      evidenceState:'modeled',sourceRefs:['model:count']
    }]
  });
  assert.equal(stage.width,1080);
  assert.equal(stage.height,1920);
  const map=stage.layers.find(layer=>layer.id==='world-geo');
  assert.equal(map?.x,70);
  assert.equal(map?.y,1040);
});
