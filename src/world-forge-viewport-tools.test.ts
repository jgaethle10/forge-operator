import assert from 'node:assert/strict';
import test from 'node:test';

import {
  axisDragWorldDelta,
  frameDistanceForScale,
  invertViewportMatrix,
  perspectiveVerticalFovRad,
  pickClosestRayHit,
  rayTriangleDistance,
  snapWorldDelta,
  viewportRayFromNdc,
} from './world-forge-viewport-tools.js';

test('viewport snapping is deterministic and removes negative zero',()=>{
  assert.equal(snapWorldDelta(.37,.25),.25);
  assert.equal(snapWorldDelta(.39,.25),.5);
  assert.equal(snapWorldDelta(-.08,.25),0);
  assert.throws(()=>snapWorldDelta(1,0),/world_forge_snap_step_invalid/);
});

test('viewport camera fov derives from authored focal length and sensor',()=>{
  const fov=perspectiveVerticalFovRad({
    focalLengthMm:50,
    sensorWidthMm:36,
    aspect:16/9,
  });
  assert.ok(fov>0);
  assert.ok(fov<Math.PI/2);

  const wide=perspectiveVerticalFovRad({
    focalLengthMm:24,
    sensorWidthMm:36,
    aspect:16/9,
  });
  assert.ok(wide>fov);
});

test('frame distance grows with object scale',()=>{
  const fov=perspectiveVerticalFovRad({
    focalLengthMm:50,
    sensorWidthMm:36,
    aspect:16/9,
  });
  const small=frameDistanceForScale({
    scale:{x:1,y:1,z:1},
    verticalFovRad:fov,
  });
  const large=frameDistanceForScale({
    scale:{x:4,y:2,z:1},
    verticalFovRad:fov,
  });
  assert.ok(large>small);
});

test('screen-axis drag maps back to snapped world movement',()=>{
  const delta=axisDragWorldDelta({
    pointerDx:48,
    pointerDy:0,
    axisScreenDx:96,
    axisScreenDy:0,
    axisWorldLength:2,
    snapStep:.25,
  });
  assert.equal(delta,1);

  const opposite=axisDragWorldDelta({
    pointerDx:-24,
    pointerDy:0,
    axisScreenDx:96,
    axisScreenDy:0,
    axisWorldLength:2,
    snapStep:.25,
  });
  assert.equal(opposite,-.5);
});


test('viewport inverse matrix and NDC ray are deterministic',()=>{
  const identity=[
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1,
  ];
  assert.deepEqual(invertViewportMatrix(identity),identity);
  assert.deepEqual(
    viewportRayFromNdc({
      ndcX:0,
      ndcY:0,
      inverseViewProjection:identity,
    }),
    {
      origin:{x:0,y:0,z:-1},
      direction:{x:0,y:0,z:1},
    },
  );
});

test('ray picking hits actual triangles and chooses the nearest geometry',()=>{
  const ray={
    origin:{x:0,y:0,z:-2},
    direction:{x:0,y:0,z:1},
  };
  const near=[
    {x:-1,y:-1,z:0},
    {x:1,y:-1,z:0},
    {x:0,y:1,z:0},
  ] as const;
  const far=[
    {x:-1,y:-1,z:3},
    {x:1,y:-1,z:3},
    {x:0,y:1,z:3},
  ] as const;

  assert.equal(
    rayTriangleDistance(ray,near[0],near[1],near[2]),
    2,
  );
  assert.deepEqual(
    pickClosestRayHit(ray,[
      {id:'far',triangles:[[far[0],far[1],far[2]]]},
      {id:'near',triangles:[[near[0],near[1],near[2]]]},
    ]),
    {id:'near',distance:2},
  );
});
