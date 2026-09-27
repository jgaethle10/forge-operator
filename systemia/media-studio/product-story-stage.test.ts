
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProductStoryStage } from './product-story-stage.js';
import { evaluateStage, validateStage } from './visual-stage.js';

test('product story keeps verified real UI as the visual source of truth',()=>{
  const stage=compileProductStoryStage({
    id:'rivet-product-story',
    productName:'RIVET',
    headline:'An address becomes an EV decision package',
    promise:'Property, competition, power, incentives and economics in one flow.',
    durationSec:18,
    capture:{
      sourcePath:'asset://rivet-capture',mediaKind:'video',
      evidenceState:'observed',sourceRefs:['capture:rivet-e2e-001'],fit:'contain'
    },
    steps:[
      {id:'address',label:'Enter the address',startSec:1,endSec:4,focus:{x:.04,y:.06,width:.42,height:.09}},
      {id:'market',label:'Read the charging landscape',startSec:4,endSec:8,focus:{x:.48,y:.16,width:.47,height:.5}},
      {id:'economics',label:'Model the economics',startSec:8,endSec:13,focus:{x:.08,y:.62,width:.84,height:.28}}
    ],
    results:[{
      id:'report',label:'DECISION PACKAGE',value:1,
      evidenceState:'observed',sourceRefs:['capture:rivet-e2e-001']
    }]
  });

  assert.equal(validateStage(stage).status,'accepted');
  const capture=stage.layers.find(layer=>layer.id==='product-capture');
  assert.equal(capture?.kind,'media');
  assert.equal(capture?.evidenceState,'observed');
  assert.equal(stage.layers.filter(layer=>layer.kind==='shape').length,3);

  const frame=evaluateStage(stage,5);
  const market=frame.layers.find(layer=>layer.id==='focus-market');
  const address=frame.layers.find(layer=>layer.id==='focus-address');
  assert.ok((market?.opacity??0)>.9);
  assert.ok(!address || address.opacity<.1);
});

test('product story refuses synthetic imagery pretending to be product capture',()=>{
  assert.throws(()=>compileProductStoryStage({
    id:'fake-ui',productName:'RIVET',headline:'fake',
    capture:{
      sourcePath:'asset://fake',mediaKind:'image',
      evidenceState:'synthetic_visualization' as any,sourceRefs:['gen:fake']
    },
    steps:[{id:'one',label:'one',startSec:1,endSec:2}]
  }),/must_be_verified_capture/);
});

test('focus coordinates fail closed outside the UI bounds',()=>{
  assert.throws(()=>compileProductStoryStage({
    id:'bad-focus',productName:'ForensiScope',headline:'Media to evidence',
    capture:{
      sourcePath:'asset://capture',mediaKind:'video',
      evidenceState:'observed',sourceRefs:['capture:forensiscope']
    },
    steps:[{
      id:'bad',label:'bad',startSec:1,endSec:3,
      focus:{x:.8,y:.2,width:.4,height:.2}
    }]
  }),/focus_bounds_invalid/);
});
