import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeRenderJob } from './policy.mjs';

const base={
  schema:'evercraft.fallen.render-job.v1',
  job_id:'proof-job',
  stage:{
    schema:'evercraft.fallen.visual-stage.v1',
    id:'proof-stage',width:640,height:360,fps:30,durationSec:2,background:'#080b0b',
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
    layers:[{id:'headline',kind:'text',z:1,x:20,y:20,width:600,height:100,text:'Evercraft proof',fontSize:42}],
    createdAt:'2026-09-27T00:00:00.000Z'
  },
  assets:[],frame_start:0,frame_count:1
};

test('accepts a bounded stage-only render job',()=>{
  const job=sanitizeRenderJob(base);
  assert.equal(job.total_frames,60);
  assert.equal(job.frame_count,1);
});

test('rejects arbitrary local or web media sources',()=>{
  for(const sourcePath of ['/etc/passwd','https://example.com/a.mp4','file:///tmp/a.mp4']){
    assert.throws(()=>sanitizeRenderJob({
      ...base,
      stage:{...base.stage,layers:[{id:'media',kind:'media',z:1,x:0,y:0,width:640,height:360,sourcePath,mediaKind:'video',fit:'cover'}]},
      assets:[{id:'a',filename:'a.mp4',sha256:'a'.repeat(64),media_type:'video/mp4'}]
    }),/media_source_must_be_asset_uri/);
  }
});

test('requires every asset URI to be manifested with a digest',()=>{
  assert.throws(()=>sanitizeRenderJob({
    ...base,
    stage:{...base.stage,layers:[{id:'media',kind:'media',z:1,x:0,y:0,width:640,height:360,sourcePath:'asset://ship',mediaKind:'video',fit:'cover'}]},
    assets:[]
  }),/media_asset_missing/);
});

test('rejects modeled or synthetic layers with no source references',()=>{
  assert.throws(()=>sanitizeRenderJob({
    ...base,
    stage:{...base.stage,layers:[{id:'model',kind:'text',z:1,x:0,y:0,width:100,height:100,text:'model',fontSize:20,evidenceState:'modeled'}]}
  }),/evidence_source_refs_missing/);
});


test('accepts a bounded phenomenon layer for owned distributed rendering',()=>{
  const job=sanitizeRenderJob({
    ...base,
    stage:{
      ...base.stage,
      id:'phenomenon-proof',
      width:1080,
      height:1920,
      layers:[{
        id:'phenomenon-field',
        kind:'phenomenon',
        z:1,x:0,y:0,width:1080,height:1920,
        title:'Flow proof',
        motionLabel:'flow direction',
        sourceLabel:'Synthetic test source',
        bounds:{north:48.5,south:46.9,west:-123.5,east:-121.8},
        streamlines:[{
          id:'stream-a',
          points:[
            {lat:48.1,lon:-122.9,colorValue:2,magnitude:1},
            {lat:47.6,lon:-122.6,colorValue:5,magnitude:3}
          ]
        }],
        colorEncoding:{label:'test scalar',min:0,max:10},
        brightnessEncoding:{label:'test magnitude',min:0,max:5},
        evidenceState:'synthetic_visualization',
        sourceRefs:['ci:phenomenon']
      }]
    }
  });
  assert.equal(job.stage.layers[0].kind,'phenomenon');
  assert.equal(job.stage.layers[0].streamlines.length,1);
});

test('rejects phenomenon layers that attempt to render without valid field geometry',()=>{
  assert.throws(()=>sanitizeRenderJob({
    ...base,
    stage:{
      ...base.stage,
      layers:[{
        id:'phenomenon-field',
        kind:'phenomenon',
        z:1,x:0,y:0,width:640,height:360,
        title:'Broken',
        motionLabel:'flow',
        sourceLabel:'test',
        bounds:{north:1,south:2,west:0,east:1},
        streamlines:[{id:'s',points:[{lat:0,lon:0},{lat:1,lon:1}]}],
        evidenceState:'modeled',
        sourceRefs:['model:test']
      }]
    }
  }),/phenomenon_bounds_invalid/);
});
