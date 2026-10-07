import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGraphicsCommand, assessScrollStop } from './director.mjs';

const story={
  schema:'evercraft.visual-story.v1',
  slug:'washington-active-volcanoes',
  title:'Washington’s five active volcanoes form one north–south spine',
  subtitle:'Cascade volcanoes',
  callout:'Five volcanoes. Roughly 179 miles.',
  evidenceState:'reported',
  sourceRefs:['https://www.usgs.gov/volcanoes/mount-rainier'],
  digest:'a'.repeat(64),
  visual:{
    eyebrow:'WASHINGTON • CASCADE RANGE',
    hook:'5 ACTIVE VOLCANOES',
    subhook:'4 carry Very High threat potential',
    treatment:'geo_spine',
    boundaryId:'us-wa-state-outline-cc0-v1',
    terrainId:'usgs-wa-shaded-relief-3dep-v1',
    metrics:[
      {id:'active',label:'ACTIVE VOLCANOES',value:5},
      {id:'very-high',label:'VERY HIGH THREAT',value:4},
    ],
  },
  points:[
    {id:'a',label:'A',lat:48.7,lon:-121.8},
    {id:'b',label:'B',lat:47.2,lon:-121.2},
    {id:'c',label:'C',lat:46.2,lon:-122.1},
  ],
  lines:[{from:'a',to:'b'},{from:'b',to:'c'}],
};

test('Graphics Command compiles a Visual Story into a Fallen-compatible hero-first plan',()=>{
  const plan=compileGraphicsCommand(story);
  assert.equal(plan.schema,'evercraft.graphics-command.plan.v1');
  assert.equal(plan.treatment,'geo_spine');
  assert.equal(plan.hero.hook,'5 ACTIVE VOLCANOES');
  assert.equal(plan.hero.visualPriority,'hero_first');
  assert.ok(plan.hero.mapRatio>.6);
  assert.equal(plan.formats.length,3);
  assert.equal(plan.motion.exactFrame,true);
  assert.equal(plan.fallenStageInput.aspectRatio,'9:16');
  assert.equal(plan.fallenStageInput.map.points.length,3);
  assert.equal(plan.fallenStageInput.map.routes.length,2);
  assert.equal(plan.fallenStageInput.map.projection,'equirectangular');
  assert.equal(plan.fallenStageInput.map.terrains.length,1);
  assert.equal(plan.fallenStageInput.map.terrains[0].id,'usgs-wa-shaded-relief-3dep-v1');
  assert.equal(plan.fallenStageInput.map.terrains[0].rightsState,'public_domain');
  assert.match(plan.fallenStageInput.map.terrains[0].sourceSha256,/^[a-f0-9]{64}$/);
  assert.ok(plan.fallenStageInput.map.routes.every(route=>route.evidenceState==='synthetic_visualization'));
  assert.equal(plan.fallenStageInput.map.points[0].evidenceState,'public_source');
  assert.equal(plan.geography.boundaryName,'Washington');
  assert.equal(plan.geography.boundaryLicense,'CC0-1.0');
  assert.equal(plan.geography.boundaryRightsState,'public_domain');
  assert.match(plan.geography.boundarySourceRef,/unitedstates\/districts/);
  assert.equal(plan.geography.terrain.id,'usgs-wa-shaded-relief-3dep-v1');
  assert.equal(plan.geography.terrain.rightsState,'public_domain');
  assert.equal(plan.geography.terrain.license,'US-PD');
  assert.match(plan.geography.terrain.sourceRef,/USGSShadedReliefOnly/);
  assert.equal(plan.publicationAuthority,false);
});

test('Scroll-stop gate passes the directed volcano composition',()=>{
  const report=assessScrollStop(compileGraphicsCommand(story));
  assert.equal(report.status,'pass');
  assert.equal(report.score,1);
  assert.equal(report.checks.metadata_deferred,true);
  assert.equal(report.checks.text_not_primary,true);
  assert.equal(report.publicationAuthority,false);
});

test('Scroll-stop gate rejects a report-first visual',()=>{
  const plan=compileGraphicsCommand(story);
  plan.hero.visualPriority='copy_first';
  plan.hero.mapRatio=.42;
  plan.hero.maxTextCoverage=.58;
  plan.hero.metadataPlacement='above_fold';
  const report=assessScrollStop(plan);
  assert.equal(report.status,'reject');
  assert.ok(report.score<.89);
});
