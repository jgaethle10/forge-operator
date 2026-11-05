import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../public/the-window/world.mjs';
import {createMystery,revealNext,accuse} from '../public/the-window/mystery.mjs';
import {initialWorld,canWalk} from '../public/worlds/world-core.mjs';
import {toEngineWorld} from '../public/worlds/world-bridge.mjs';
import {EVIDENCE_STATIONS,activeEvidenceStation,nearbyEvidenceStation,evidenceWorldEntities,evidenceGuidance} from '../public/worlds/mystery-bridge.mjs';
const world=createWorld(0,818);
test('all evidence stations are accessible in the existing physical scene',()=>{
  assert.equal(EVIDENCE_STATIONS.length,4);
  for(const s of EVIDENCE_STATIONS){
    assert.equal(canWalk(s.x,s.z),true,s.label+' inaccessible');
    assert.ok(Math.abs(s.x)<17&&Math.abs(s.z)<17);
  }
});
test('pure projection adds evidence to authoritative schema without mutating the world',()=>{
  const scene=initialWorld();
  const before=JSON.stringify(scene);
  const caseFile=createMystery(world,0);
  const sceneWorld=toEngineWorld(scene);
  const entities=evidenceWorldEntities(caseFile);
  assert.equal(sceneWorld.schema,'evercraft.world-engine.world.v1');
  assert.equal(entities.length,4);
  assert.ok(entities.every(x=>x.tags.includes('local_rule_scenario')&&x.properties.source==='fictional_local_projection'));
  assert.equal(JSON.stringify(scene),before);
  assert.equal(sceneWorld.entities.some(x=>x.id.startsWith('mystery:')),false);
});
test('only next unrevealed clue is interactable',()=>{
  let caseFile=createMystery(world,2);
  for(let i=0;i<4;i++){
    const station=activeEvidenceStation(caseFile);
    assert.equal(station.clueId,EVIDENCE_STATIONS[i].clueId);
    assert.equal(nearbyEvidenceStation(caseFile,station.x,station.z)?.clueId,station.clueId);
    assert.equal(nearbyEvidenceStation(caseFile,station.x+4,station.z),null);
    const projected=evidenceWorldEntities(caseFile);
    assert.equal(projected.filter(e=>e.properties.active).length,1);
    assert.equal(projected.filter(e=>e.properties.revealed).length,i);
    caseFile=revealNext(caseFile);
  }
  assert.equal(activeEvidenceStation(caseFile),null);
  assert.equal(evidenceWorldEntities(caseFile).filter(e=>e.properties.active).length,0);
});
test('resolved cases no longer expose active evidence',()=>{
  let caseFile=createMystery(world,3);
  for(let i=0;i<3;i++)caseFile=revealNext(caseFile);
  caseFile=accuse(caseFile,caseFile.answerId);
  assert.equal(activeEvidenceStation(caseFile),null);
});
test('reject mismatched scenario and invalid proximity values',()=>{
  const caseFile=createMystery(world,9);
  assert.throws(()=>activeEvidenceStation({}),/Unsupported fictional/);
  assert.throws(()=>evidenceWorldEntities({...caseFile,clues:[...caseFile.clues].reverse()}),/Unsupported fictional/);
  assert.equal(nearbyEvidenceStation(caseFile,NaN,1),null);
  assert.equal(nearbyEvidenceStation(caseFile,1,1,Infinity),null);
});


test('relative clue tracker uses camera heading, world units, and no shared mutation',()=>{
  const caseFile=createMystery(world,0);
  const frozen=JSON.stringify(caseFile);
  const station=activeEvidenceStation(caseFile);
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+4,0).direction,'Ahead');
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+4,Math.PI/2).direction,'Left');
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+4,-Math.PI/2).direction,'Right');
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+4,Math.PI).direction,'Behind');
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+2,0).direction,'Within reach');
  assert.equal(evidenceGuidance(caseFile,station.x,station.z+4,0).distance,4);
  assert.equal(evidenceGuidance(caseFile,Infinity,0,0),null);
  assert.equal(evidenceGuidance(caseFile,0,0,NaN),null);
  let complete=caseFile;for(let i=0;i<4;i++)complete=revealNext(complete);
  assert.equal(evidenceGuidance(complete,0,0,0),null);
  assert.equal(JSON.stringify(caseFile),frozen);
});
