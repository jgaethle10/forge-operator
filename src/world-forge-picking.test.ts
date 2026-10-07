import assert from 'node:assert/strict';
import test from 'node:test';

import {
  orthographicPickRay,
  perspectivePickRay,
  pickNearestNativeMesh,
  rayTriangleDistance,
  transformPickPoint,
} from './world-forge-picking.js';

const identity={
  position:{x:0,y:0,z:0},
  rotationDeg:{x:0,y:0,z:0},
  scale:{x:1,y:1,z:1},
};

test('ray triangle intersection returns nearest positive surface distance',()=>{
  const ray={
    origin:{x:0,y:0,z:3},
    direction:{x:0,y:0,z:-1},
  };
  const distance=rayTriangleDistance(
    ray,
    {x:-1,y:-1,z:0},
    {x:1,y:-1,z:0},
    {x:0,y:1,z:0},
  );
  assert.equal(distance,3);
});

test('native picking chooses the closest actual mesh surface',()=>{
  const ray={
    origin:{x:0,y:0,z:5},
    direction:{x:0,y:0,z:-1},
  };
  const hit=pickNearestNativeMesh(ray,[
    {
      id:'far',
      transform:{...identity,position:{x:0,y:0,z:0}},
      geometry:{kind:'primitive',primitive:'cube'},
    },
    {
      id:'near',
      transform:{...identity,position:{x:0,y:0,z:2}},
      geometry:{kind:'primitive',primitive:'cube'},
    },
  ]);
  assert.equal(hit?.nodeId,'near');
  assert.ok(hit);
  assert.ok(hit!.distance<3);
});

test('native picking respects translated rotated and scaled transforms',()=>{
  const transformed=transformPickPoint(
    {x:.5,y:0,z:0},
    {
      position:{x:2,y:1,z:0},
      rotationDeg:{x:0,y:0,z:90},
      scale:{x:2,y:1,z:1},
    },
  );
  assert.ok(Math.abs(transformed.x-2)<1e-8);
  assert.ok(Math.abs(transformed.y-2)<1e-8);

  const ray={
    origin:{x:2,y:2,z:5},
    direction:{x:0,y:0,z:-1},
  };
  const hit=pickNearestNativeMesh(ray,[{
    id:'rotated',
    transform:{
      position:{x:2,y:2,z:0},
      rotationDeg:{x:0,y:0,z:37},
      scale:{x:2,y:.5,z:1},
    },
    geometry:{kind:'primitive',primitive:'cube'},
  }]);
  assert.equal(hit?.nodeId,'rotated');
});

test('perspective ray points through the center of the authored camera target',()=>{
  const ray=perspectivePickRay({
    clientX:400,
    clientY:300,
    left:0,
    top:0,
    width:800,
    height:600,
    eye:{x:0,y:-10,z:2},
    target:{x:0,y:0,z:2},
    verticalFovRad:Math.PI/3,
  });
  assert.ok(Math.abs(ray.direction.x)<1e-9);
  assert.ok(Math.abs(ray.direction.y-1)<1e-9);
  assert.ok(Math.abs(ray.direction.z)<1e-9);
});

test('orthographic rays share direction but shift origin across viewport',()=>{
  const center=orthographicPickRay({
    clientX:400,
    clientY:300,
    left:0,
    top:0,
    width:800,
    height:600,
    eye:{x:0,y:-10,z:2},
    target:{x:0,y:0,z:2},
    orthoHeight:6,
  });
  const right=orthographicPickRay({
    clientX:800,
    clientY:300,
    left:0,
    top:0,
    width:800,
    height:600,
    eye:{x:0,y:-10,z:2},
    target:{x:0,y:0,z:2},
    orthoHeight:6,
  });
  assert.deepEqual(center.direction,right.direction);
  assert.ok(right.origin.x>center.origin.x);
});

test('plane picking uses a plane rather than cube fallback geometry',()=>{
  const hit=pickNearestNativeMesh({
    origin:{x:0,y:0,z:2},
    direction:{x:0,y:0,z:-1},
  },[{
    id:'plane',
    transform:identity,
    geometry:{kind:'primitive',primitive:'plane'},
  }]);
  assert.equal(hit?.nodeId,'plane');
  assert.ok(Math.abs((hit?.distance??0)-2)<1e-8);
});
