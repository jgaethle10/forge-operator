import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeViewportTriangleData } from './world-forge-viewport-mesh.js';

const identity={
  position:{x:0,y:0,z:0},
  rotationDeg:{x:0,y:0,z:0},
  scale:{x:1,y:1,z:1},
};

test('viewport cube produces 12 flat-shaded triangles',()=>{
  const data=nativeViewportTriangleData({
    id:'cube',
    transform:identity,
    geometry:{kind:'primitive',primitive:'cube'},
  });
  assert.ok(data);
  assert.equal(data!.triangleCount,12);
  assert.equal(data!.positions.length,108);
  assert.equal(data!.normals.length,108);
  for(let i=0;i<data!.normals.length;i+=3){
    const length=Math.hypot(
      data!.normals[i],
      data!.normals[i+1],
      data!.normals[i+2],
    );
    assert.ok(Math.abs(length-1)<1e-6);
  }
});

test('viewport plane produces exactly two coplanar triangles',()=>{
  const data=nativeViewportTriangleData({
    id:'plane',
    transform:identity,
    geometry:{kind:'primitive',primitive:'plane'},
  });
  assert.ok(data);
  assert.equal(data!.triangleCount,2);
  assert.equal(data!.positions.length,18);
  assert.ok(
    Array.from(data!.positions)
      .filter((_,index)=>index%3===2)
      .every(value=>value===0),
  );
});

test('viewport editable n-gons triangulate deterministically as a fan',()=>{
  const data=nativeViewportTriangleData({
    id:'pentagon',
    transform:identity,
    geometry:{
      kind:'editable_mesh',
      mesh:{
        vertices:[
          {x:0,y:1,z:0},
          {x:.95,y:.31,z:0},
          {x:.59,y:-.81,z:0},
          {x:-.59,y:-.81,z:0},
          {x:-.95,y:.31,z:0},
        ],
        faces:[[0,1,2,3,4]],
      },
    },
  });
  assert.ok(data);
  assert.equal(data!.triangleCount,3);
  assert.equal(data!.positions.length,27);
});
