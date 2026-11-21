import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKssWorldHandoff, KSS_SPATIAL_INGRESS_SCHEMA} from './kss-spatial-ingress.mjs';

function fixture(){
  return {
    schema:KSS_SPATIAL_INGRESS_SCHEMA,
    projectId:'championship-demo-001',
    units:'meters',
    coordinateSystem:'local_x_east_z_north_y_up',
    provenance:{
      rightsState:'owned',license:'evercraft-owned-synthetic',
      sourceRef:'synthetic:evercraft-championship-demo-001',
      evidenceState:'synthetic'
    },
    parcel:{x:0,z:0,width:75,depth:60},
    objects:[
      {id:'warehouse',kind:'building',x:7,z:7,width:19,depth:13,height:9},
      {id:'parking',kind:'pavement',x:30,z:4,width:39,depth:40,height:0.1},
      {id:'equipment',kind:'equipment',x:49,z:15,width:3,depth:2,height:3}
    ]
  };
}
test('compiles real per-face triangle geometry for existing World Engine importer',()=>{
 const x=compileKssWorldHandoff(fixture());
 assert.equal(x.geometryAssets.length,3);
 assert.equal(x.geometryAssets[0].schema,'evercraft.fallen.geometry.v1');
 assert.equal(x.geometryAssets[0].positions.length,72);
 assert.equal(x.geometryAssets[0].normals.length,72);
 assert.equal(x.geometryAssets[0].uvs.length,48);
 assert.equal(x.geometryAssets[0].indices.length,36);
 assert.equal(x.geometryAssets[0].coordinateSystem,'right_handed_y_up');
 assert.equal(x.geometryAssets[0].units,'meters');
 assert.equal(x.publicationAuthority,false);
 assert.equal(x.qa.codeComplianceVerified,false);
});
test('deterministic digest and stable object identities',()=>{
 assert.equal(compileKssWorldHandoff(fixture()).digest,compileKssWorldHandoff(fixture()).digest);
});
test('rejects missing or restricted rights',()=>{
 const f=fixture();f.provenance.rightsState='restricted';
 assert.throws(()=>compileKssWorldHandoff(f),/rights_unresolved/);
});
test('requires proof of permitted derivative use for licensed inputs',()=>{
 const f=fixture();f.provenance.rightsState='licensed';
 assert.throws(()=>compileKssWorldHandoff(f),/license_derivative_approval_missing/);
});
test('rejects source model leaving the parcel',()=>{
 const f=fixture();f.objects[0].x=-10;
 assert.throws(()=>compileKssWorldHandoff(f),/object_exits_parcel/);
});
test('rejects proposed equipment colliding with a building',()=>{
 const f=fixture();f.objects[2].x=10;f.objects[2].z=10;
 assert.throws(()=>compileKssWorldHandoff(f),/equipment_building_collision/);
});
test('rejects incorrect units or projection',()=>{
 const f=fixture();f.units='feet';
 assert.throws(()=>compileKssWorldHandoff(f),/coordinate_contract_invalid/);
});
test('rejects unsupported or duplicate objects',()=>{
 const f=fixture();f.objects[1].id='warehouse';
 assert.throws(()=>compileKssWorldHandoff(f),/duplicate_object_id/);
});
test('rejects invalid geometry or fabricated evidence state',()=>{
 const f=fixture();f.objects[0].height=NaN;
 assert.throws(()=>compileKssWorldHandoff(f),/object_height_invalid/);
 const g=fixture();g.provenance.evidenceState='surveyed_and_sealed';
 assert.throws(()=>compileKssWorldHandoff(g),/evidence_state_invalid/);
});
