import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cameraAt,
  evaluateStage,
  validateStage,
  valueAt,
  type VisualStage,
} from './visual-stage.js';
import { projectGeo, projectRoute, splitAntimeridian } from './world-map.js';
import { buildVisualStageHtml } from './visual-stage-html.js';

const stage:VisualStage={
  schema:'evercraft.fallen.visual-stage.v1',
  id:'week-in-motion-world-proof',
  width:1920,
  height:1080,
  fps:30,
  durationSec:10,
  background:'#080b0b',
  camera:{keyframes:[
    {t:0,x:0,y:0,zoom:1},
    {t:10,x:100,y:50,zoom:1.2,ease:'ease_in_out'}
  ]},
  layers:[
    {
      id:'world',
      kind:'geo',
      z:1,x:0,y:0,width:1920,height:1080,
      projection:'mercator',
      centerLat:20,centerLon:150,zoom:1.4,grid:true,
      routes:[{
        id:'ship-route',
        points:[{lat:35,lon:140},{lat:33,lon:155},{lat:30,lon:170}],
        evidenceState:'public_source',
        sourceRefs:['source:ais-proof'],
        progress:[{t:0,value:0},{t:8,value:1,ease:'ease_in_out'}]
      }],
      evidenceState:'public_source',
      sourceRefs:['source:map-proof']
    },
    {
      id:'fleet-count',
      kind:'metric',
      z:2,x:120,y:80,width:500,height:180,
      label:'TRACKED VESSELS',from:0,to:42,unit:'',
      progress:[{t:0,value:0},{t:3,value:1,ease:'ease_out'}],
      evidenceState:'public_source',
      sourceRefs:['source:fleet-proof']
    },
    {
      id:'visualization-note',
      kind:'text',
      z:3,x:120,y:900,width:800,height:80,
      text:'ROUTE VISUALIZATION',fontSize:22,
      evidenceState:'synthetic_visualization',
      sourceRefs:['source:route-model']
    }
  ],
  createdAt:'2026-09-27T20:00:00.000Z'
};

test('numeric and camera keyframes are deterministic',()=>{
  assert.equal(valueAt([{t:0,value:0},{t:10,value:10}],5,0),5);
  const camera=cameraAt(stage.camera,5);
  assert.equal(camera.x,50);
  assert.equal(camera.y,25);
  assert.ok(camera.zoom>1 && camera.zoom<1.2);
});

test('stage evaluation preserves depth ordering and animated values',()=>{
  const frame=evaluateStage(stage,3);
  assert.deepEqual(frame.layers.map(layer=>layer.id),['world','fleet-count','visualization-note']);
  assert.equal(frame.layers.find(layer=>layer.id==='fleet-count')?.metricValue,42);
  const route=frame.layers.find(layer=>layer.id==='world')?.geoRoutes?.[0];
  assert.ok((route?.progressValue??0)>0 && (route?.progressValue??0)<1);
});

test('geographic projection and route progress work without a map provider',()=>{
  const center=projectGeo({lat:0,lon:0,projection:'equirectangular',width:1000,height:500});
  assert.equal(center.x,500);
  assert.equal(center.y,250);

  const segments=splitAntimeridian([{lat:0,lon:170},{lat:0,lon:-170}]);
  assert.equal(segments.length,2);

  const projected=projectRoute({
    id:'r',
    points:[{lat:0,lon:0},{lat:0,lon:30},{lat:0,lon:60}]
  },{
    projection:'equirectangular',width:1000,height:500,progress:.5
  });
  assert.equal(projected.length,1);
  assert.ok(projected[0].length>=2);
});

test('stage validation enforces provenance for modeled and synthetic layers',()=>{
  const valid=validateStage(stage);
  assert.equal(valid.status,'accepted');
  assert.equal(valid.digest.length,64);

  const broken:VisualStage={
    ...stage,
    id:'broken',
    layers:[{
      id:'synthetic',
      kind:'text',
      z:1,x:0,y:0,width:100,height:100,
      text:'visualization',fontSize:20,
      evidenceState:'synthetic_visualization'
    }]
  };
  assert.equal(validateStage(broken).status,'rejected');
});

test('HTML stage has deterministic frame-control hooks and no external runtime dependency',()=>{
  const html=buildVisualStageHtml(stage);
  assert.match(html,/__evercraftRenderFrame/);
  assert.match(html,/__evercraftRenderAt/);
  assert.match(html,/evercraftFrameReady/);
  assert.doesNotMatch(html,/https:\/\//);
  assert.match(html,/ROUTE VISUALIZATION/);
});
