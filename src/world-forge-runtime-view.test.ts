import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runtimeTransformsByForgeNodeId,
  worldEngineEulerToWorldForge,
  worldEnginePositionToWorldForge,
  worldEngineScaleToWorldForge,
  worldEngineTransformToWorldForge,
} from './world-forge-runtime-view.js';
import {
  worldForgeEulerToWorldEngine,
  worldForgeVectorToWorldEngine,
} from '../systemia/media-studio/world-forge-world-engine.js';

function near(a:number,b:number,epsilon=1e-7){
  assert.ok(Math.abs(a-b)<=epsilon,`${a} !~= ${b}`);
}

test('runtime position mapping round-trips Forge Z-up through World Engine Y-up',()=>{
  const forge={x:2.5,y:-3.25,z:4.75};
  const engine=worldForgeVectorToWorldEngine(forge);
  assert.deepEqual(worldEnginePositionToWorldForge(engine),forge);
});

test('runtime scale mapping restores Forge axis order',()=>{
  assert.deepEqual(
    worldEngineScaleToWorldForge({x:2,y:4,z:3}),
    {x:2,y:3,z:4},
  );
});

test('runtime rotation mapping round-trips authored Euler orientation',()=>{
  for(const forge of [
    {x:0,y:0,z:90},
    {x:20,y:30,z:40},
    {x:-15,y:25,z:-70},
  ]){
    const engine=worldForgeEulerToWorldEngine(forge);
    const recovered=worldEngineEulerToWorldForge(engine);
    near(recovered.x,forge.x);
    near(recovered.y,forge.y);
    near(recovered.z,forge.z);
  }
});

test('runtime snapshot transforms are keyed by canonical World Forge node ID',()=>{
  const transforms=runtimeTransformsByForgeNodeId({
    entities:[
      {
        id:'wfnode:hero-core',
        properties:{worldForgeNodeId:'hero-core'},
        transform:{
          position:{x:1,y:2,z:-3},
          rotationDeg:{x:0,y:0,z:0},
          scale:{x:1,y:4,z:2},
        },
      },
      {
        id:'runtime-only',
        properties:{},
        transform:{
          position:{x:0,y:0,z:0},
        },
      },
    ],
  });

  assert.deepEqual(
    transforms['hero-core'],
    worldEngineTransformToWorldForge({
      position:{x:1,y:2,z:-3},
      rotationDeg:{x:0,y:0,z:0},
      scale:{x:1,y:4,z:2},
    }),
  );
  assert.equal(Object.keys(transforms).length,1);
});
