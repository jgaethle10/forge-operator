import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeterministicTangents,
  geometryFromFallenAsset,
  verifyFallenGeometryImportReceipt,
  type FallenGeometryAsset
} from './fallen-geometry.js';

function baseAsset():FallenGeometryAsset{
  return {
    schema:'evercraft.fallen.geometry.v1',
    id:'geometry:fallen-panel',
    primitive:'triangles',
    coordinateSystem:'right_handed_y_up',
    units:'meters',
    positions:[
      -1,-1,0,
      1,-1,0,
      -1,1,0
    ],
    normals:[
      0,0,1,
      0,0,1,
      0,0,1
    ],
    uvs:[
      0,0,
      1,0,
      0,1
    ],
    provenance:{
      sourceRef:'fallen:studio:panel',
      rightsState:'owned',
      license:'Evercraft-owned'
    }
  };
}

test('Fallen triangle imports into deterministic tangent-space geometry',()=>{
  const source=baseAsset();
  const first=geometryFromFallenAsset(source);
  const second=geometryFromFallenAsset(structuredClone(source));

  assert.deepEqual(first.geometry.tangents,[
    1,0,0,1,
    1,0,0,1,
    1,0,0,1
  ]);
  assert.equal(first.receipt.digest,second.receipt.digest);
  assert.equal(first.receipt.geometryDigest,second.receipt.geometryDigest);
  assert.equal(first.receipt.sourceDigest,second.receipt.sourceDigest);
  assert.equal(first.receipt.tangentSource,'generated');
  assert.equal(first.receipt.generatedTangents,true);
  assert.equal(first.receipt.coordinateSystem,'right_handed_y_up');
  assert.equal(first.receipt.units,'meters');
  assert.equal(first.receipt.sourceRef,'fallen:studio:panel');
  assert.equal(first.receipt.rightsState,'owned');
  assert.equal(first.receipt.license,'Evercraft-owned');
  assert.equal(verifyFallenGeometryImportReceipt(first.receipt),true);
});

test('indexed Fallen geometry accumulates one canonical tangent frame per vertex',()=>{
  const source=baseAsset();
  source.id='geometry:fallen-quad';
  source.positions=[
    -1,-1,0,
    1,-1,0,
    1,1,0,
    -1,1,0
  ];
  source.normals=[
    0,0,1,
    0,0,1,
    0,0,1,
    0,0,1
  ];
  source.uvs=[
    0,0,
    1,0,
    1,1,
    0,1
  ];
  source.indices=[0,1,2,0,2,3];

  const result=geometryFromFallenAsset(source);

  assert.equal(result.geometry.tangents?.length,16);
  for(let vertex=0;vertex<4;vertex++){
    const tangent=result.geometry.tangents!.slice(vertex*4,vertex*4+4);
    assert.ok(Math.abs(tangent[0]-1)<1e-12);
    assert.ok(Math.abs(tangent[1])<1e-12);
    assert.ok(Math.abs(tangent[2])<1e-12);
    assert.equal(tangent[3],1);
  }
  assert.equal(result.receipt.triangleCount,2);
});

test('mirrored UVs deterministically produce negative tangent handedness',()=>{
  const source=baseAsset();
  source.id='geometry:mirrored';
  source.positions=[
    0,0,0,
    1,0,0,
    0,1,0
  ];
  source.uvs=[
    0,0,
    0,1,
    1,0
  ];

  const result=geometryFromFallenAsset(source);
  assert.deepEqual(result.geometry.tangents,[
    0,1,0,-1,
    0,1,0,-1,
    0,1,0,-1
  ]);
});

test('authored canonical tangents are preserved instead of regenerated',()=>{
  const source=baseAsset();
  source.tangents=[
    1,0,0,1,
    1,0,0,1,
    1,0,0,1
  ];

  const result=geometryFromFallenAsset(source);

  assert.deepEqual(result.geometry.tangents,source.tangents);
  assert.equal(result.receipt.tangentSource,'authored');
  assert.equal(result.receipt.tangentGeneration,'authored');
  assert.equal(result.receipt.generatedTangents,false);
});

test('authored tangents must be normalized orthogonal vectors with explicit handedness',()=>{
  const notOrthogonal=baseAsset();
  notOrthogonal.tangents=[
    0,0,1,1,
    1,0,0,1,
    1,0,0,1
  ];
  assert.throws(
    ()=>geometryFromFallenAsset(notOrthogonal),
    /fallen_geometry_tangent_not_orthogonal:0/
  );

  const notNormalized=baseAsset();
  notNormalized.tangents=[
    2,0,0,1,
    1,0,0,1,
    1,0,0,1
  ];
  assert.throws(
    ()=>geometryFromFallenAsset(notNormalized),
    /fallen_geometry_tangent_not_normalized:0/
  );

  const badHandedness=baseAsset();
  badHandedness.tangents=[
    1,0,0,0,
    1,0,0,1,
    1,0,0,1
  ];
  assert.throws(
    ()=>geometryFromFallenAsset(badHandedness),
    /fallen_geometry_tangent_handedness_invalid:0/
  );
});

test('degenerate UV or position triangles fail closed',()=>{
  const badUv=baseAsset();
  badUv.uvs=[0,0,0,0,0,0];
  assert.throws(
    ()=>geometryFromFallenAsset(badUv),
    /fallen_geometry_uv_triangle_degenerate:0/
  );

  const badPosition=baseAsset();
  badPosition.positions=[
    0,0,0,
    0,0,0,
    0,0,0
  ];
  assert.throws(
    ()=>geometryFromFallenAsset(badPosition),
    /fallen_geometry_position_triangle_degenerate:0/
  );
});

test('Fallen geometry import refuses implicit coordinate or unit conversion',()=>{
  const badCoordinate={...baseAsset(),coordinateSystem:'left_handed_y_up' as any};
  assert.throws(
    ()=>geometryFromFallenAsset(badCoordinate),
    /fallen_geometry_coordinate_system_unsupported/
  );

  const badUnits={...baseAsset(),units:'centimeters' as any};
  assert.throws(
    ()=>geometryFromFallenAsset(badUnits),
    /fallen_geometry_units_unsupported/
  );
});

test('geometry import preserves explicit provenance and refuses missing licensing state',()=>{
  const licensed=baseAsset();
  licensed.provenance={
    sourceRef:'library:licensed-mesh:42',
    rightsState:'licensed',
    license:'Commercial Mesh License 2026',
    attribution:'Asset Studio'
  };
  const result=geometryFromFallenAsset(licensed);

  assert.equal(result.receipt.sourceRef,'library:licensed-mesh:42');
  assert.equal(result.receipt.rightsState,'licensed');
  assert.equal(result.receipt.license,'Commercial Mesh License 2026');
  assert.match(result.receipt.provenanceDigest,/^[a-f0-9]{64}$/);

  const missingLicense=baseAsset();
  missingLicense.provenance.license='';
  assert.throws(
    ()=>geometryFromFallenAsset(missingLicense),
    /fallen_geometry_provenance_license_missing/
  );
});

test('import receipts detect lineage tampering',()=>{
  const receipt=geometryFromFallenAsset(baseAsset()).receipt;
  assert.equal(verifyFallenGeometryImportReceipt(receipt),true);

  const tampered=structuredClone(receipt);
  tampered.sourceRef='fallen:tampered';
  assert.equal(verifyFallenGeometryImportReceipt(tampered),false);
});

test('standalone tangent generator is deterministic for identical source arrays',()=>{
  const source=baseAsset();
  const first=generateDeterministicTangents(
    source.positions,
    source.normals,
    source.uvs
  );
  const second=generateDeterministicTangents(
    [...source.positions],
    [...source.normals],
    [...source.uvs]
  );
  assert.deepEqual(first,second);
});
