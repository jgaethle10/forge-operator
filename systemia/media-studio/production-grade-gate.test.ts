import assert from 'node:assert/strict';
import test from 'node:test';
import { assessProductionGrade } from './production-grade-gate.js';

test('rejects the kind of geometry-only canary that should never ship as a real episode',()=>{
  const report=assessProductionGrade([{
    id:'lobby',
    durationSec:4,
    hostVisible:true,
    textCoveragePct:.5,
    visuals:[
      {id:'mannequin',kind:'test_fixture',sourceRefs:['ci:fixture']},
      {id:'headline',kind:'text',sourceRefs:['episode:script']}
    ]
  }]);
  assert.equal(report.status,'rejected');
  assert.ok(report.beatReports[0].reasons.includes('test_fixture_present'));
  assert.ok(report.beatReports[0].reasons.includes('hero_media_missing'));
  assert.ok(report.beatReports[0].reasons.includes('text_is_primary_visual'));
});

test('accepts a host-led cinematic beat with real product evidence',()=>{
  const report=assessProductionGrade([{
    id:'global-ops',
    durationSec:7,
    hostVisible:true,
    textCoveragePct:.12,
    visuals:[
      {
        id:'host',
        kind:'verified_capture',
        sourceRefs:['user:approved-host'],
        identityBound:true,
        evidenceState:'observed'
      },
      {
        id:'systemia',
        kind:'verified_capture',
        sourceRefs:['product:systemia-capture'],
        evidenceState:'observed'
      },
      {
        id:'environment',
        kind:'generated_cinematic',
        sourceRefs:['fallen:model-fabric-candidate'],
        continuityBound:true,
        evidenceState:'synthetic_visualization'
      }
    ]
  }]);
  assert.equal(report.status,'accepted');
});
