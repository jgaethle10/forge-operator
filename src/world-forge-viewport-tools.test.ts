import assert from 'node:assert/strict';
import test from 'node:test';

import {
  axisDragScaleValue,
  axisDragWorldDelta,
  frameDistanceForScale,
  perspectiveVerticalFovRad,
  screenRotationDeltaDeg,
  snapWorldAngle,
  snapWorldDelta,
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


test('rotation gizmo snaps screen-space angular movement deterministically',()=>{
  const delta=screenRotationDeltaDeg({
    startX:100,
    startY:50,
    currentX:50,
    currentY:100,
    centerX:50,
    centerY:50,
    snapDeg:15,
  });
  assert.equal(delta,90);
  assert.equal(snapWorldAngle(22,15),15);
  assert.equal(snapWorldAngle(188,15),-165);
});

test('scale gizmo maps projected axis drag into snapped positive scale',()=>{
  const larger=axisDragScaleValue({
    pointerDx:50,
    pointerDy:0,
    axisScreenDx:100,
    axisScreenDy:0,
    startScale:1,
    snapStep:.1,
  });
  assert.equal(larger,1.5);

  const clamped=axisDragScaleValue({
    pointerDx:-300,
    pointerDy:0,
    axisScreenDx:100,
    axisScreenDy:0,
    startScale:1,
    snapStep:.1,
  });
  assert.equal(clamped,.01);
});
