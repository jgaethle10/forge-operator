import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditCatalog,HELD_KEYS} from '../scripts/brand/audit-public-discovery-exposures.mjs';
import {loadSource,assertRoster,compileReview} from '../scripts/brand/compile-review-wall.mjs';

test('read-only legacy exposure audit identifies restricted keys without mutating inputs',()=>{
 const sample=[
  {path:'registry/catalog.json',content:'{"product":"skyops-parking","text":"AliEV"}'},
  {path:'public/clean.json',content:'{"product":"humanfilter"}'}
 ];
 const original=JSON.stringify(sample);
 const report=auditCatalog(sample);
 assert.equal(report.read_only,true);
 assert.equal(report.surfaces_with_restricted_references,1);
 assert.deepEqual(report.findings[0].restricted_references.map(x=>x.key),['skyops-parking','aliev']);
 assert.equal(JSON.stringify(sample),original);
 assert.deepEqual(HELD_KEYS,['skyops-parking','rivet','aliev']);
});

test('restricted project cannot sneak into description or alias',()=>{
 const {workstreams,identity}=loadSource();
 const updated=structuredClone(workstreams);
 updated.workstreams[0].description='Promotional variant of SkyOps Parking';
 assert.throws(()=>assertRoster(updated,identity),/Restricted project/);
 const alias=structuredClone(workstreams);
 alias.workstreams[0].aliases=['AliEV'];
 assert.throws(()=>assertRoster(alias,identity),/Restricted project/);
});

test('unverified parent logo must not be disguised as an E-logo',()=>{
 const {workstreams,identity}=loadSource();
 const html=compileReview(workstreams,identity);
 assert.doesNotMatch(html,/<span class="parentmark">E<\/span>/);
 assert.match(html,/Evercraft<\/span>/);
 const parent=identity.brands.find(x=>x.key==='evercraft');
 assert.equal(parent.asset.status,'parent_master_vector_missing');
 assert.equal(parent.asset.source,null);
});

test('institutional policy uses June manual palette without forcing subbrand colors',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../docs/brand/design-governance.v1.json',import.meta.url),'utf8'));
 assert.equal(source.source_custody.copy_into_public,false);
 assert.equal(source.source_custody.master_vector_verified,false);
 assert.equal(source.parent_identity.institutional_palette.core_black,'#0B0B0B');
 assert.equal(source.parent_identity.institutional_palette.titanium,'#B7BDC5');
 assert.equal(source.parent_identity.institutional_palette.champagne_gold,'#B79A56');
 assert.equal(source.parent_identity.technology_only_accent.electric_ice_blue,'#4FB8FF');
 assert.equal(source.public_release.status,'not_authorized');
});
