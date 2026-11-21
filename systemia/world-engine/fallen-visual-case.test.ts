import test from 'node:test';
import assert from 'node:assert/strict';
import {importFallenVisualCase,verifyFallenVisualHandoff,FALLEN_RC13_VISUAL_CASE_CONTRACT} from './fallen-visual-case.mjs';

const response=()=>({
  schema:'fallen.visual-case.v1',sector:'response',title:'River District - Synthetic',
  source:{reference:'Evercraft synthetic tabletop',timestamp:'',evidence:'synthetic'},
  assets:[{id:'H1',name:'Hospital',kind:'care',x:183,y:216,source:'sample',priority:'high'},{id:'B1',name:'Bridge',kind:'bridge',x:444,y:193,source:'sample',priority:'medium'}],
  viewer:{percentage:45,overlay:true,selected:null}
});
const sports=()=>({
  schema:'fallen.visual-case.v1',sector:'sports',title:'Original Concept',
  source:{reference:'Evercraft original schematic',timestamp:'',evidence:'synthetic'},
  players:[{id:'X',side:'offense',color:'#f2ce86',route:[[190,176],[330,172],[445,244],[620,252]]},{id:'QB',side:'offense',color:'#fff0b0',route:[[164,283],[217,288]]}],
  defense:[{id:'C1',x:410,y:183}],viewer:{percentage:33,overlay:true,selected:'X'}
});

test('response handoff is deterministic, sealed and never georeferenced',()=>{
  const a=importFallenVisualCase(response()),b=importFallenVisualCase(JSON.stringify(response()));
  assert.deepEqual(a,b);
  assert.equal(a.nodes.length,2);
  assert.equal(a.coordinate_space,'rc13_schematic_screen_v1');
  assert.equal(a.claims.georeferenced,false);
  assert.equal(a.claims.decision_authority,false);
  assert.equal(a.release_state,'human_review_required');
  assert.equal(a.source_rights_state,'unverified');
  assert.equal(verifyFallenVisualHandoff(a),true);
  assert.ok(a.nodes[0].position.u>=0&&a.nodes[0].position.u<=1);
});

test('sports handoff retains editable route geometry but claims no player tracking',()=>{
  const a=importFallenVisualCase(sports());
  assert.equal(a.nodes.length,3);
  assert.equal(a.nodes[0].route.length,4);
  assert.equal(a.nodes[0].screen_route[3].x,620);
  assert.equal(a.claims.observed_tracking,false);
  assert.equal(verifyFallenVisualHandoff(a),true);
});

test('source classification is preserved but does not grant publication authority',()=>{
  const c=response();c.source.evidence='observed';
  const a=importFallenVisualCase(c);
  assert.equal(a.source.evidence,'observed');
  assert.equal(a.nodes[0].evidence_state,'observed');
  assert.equal(a.claims.publication_authority,false);
  assert.equal(a.release_state,'human_review_required');
});

test('reject invalid coordinates, duplicate identifiers, malformed routes and oversized JSON',()=>{
  const invalid=response();invalid.assets[0].x=9000;
  assert.throws(()=>importFallenVisualCase(invalid),/asset_invalid/);
  const dup=response();dup.assets[1].id='H1';
  assert.throws(()=>importFallenVisualCase(dup),/asset_id_duplicate/);
  const bad=sports();bad.players[0].route[0]=[Infinity,200];
  assert.throws(()=>importFallenVisualCase(bad),/route_invalid/);
  assert.throws(()=>importFallenVisualCase('x'.repeat(160_001)),/too_large/);
});

test('reject attempts to promote provenance by modifying sealed handoff',()=>{
  const a=importFallenVisualCase(response());
  a.claims.georeferenced=true;
  assert.equal(verifyFallenVisualHandoff(a),false);
  const b=importFallenVisualCase(response());
  b.nodes[0].label='Edited';
  assert.equal(verifyFallenVisualHandoff(b),false);
  const c=importFallenVisualCase(response());
  c.release_state='approved';
  assert.equal(verifyFallenVisualHandoff(c),false);
});

test('contract never implies operational field authority',()=>{
  assert.equal(FALLEN_RC13_VISUAL_CASE_CONTRACT.decisionAuthority,false);
  assert.equal(FALLEN_RC13_VISUAL_CASE_CONTRACT.publicationAuthority,false);
});
