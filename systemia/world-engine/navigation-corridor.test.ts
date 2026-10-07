import test from 'node:test';
import assert from 'node:assert/strict';
import { findNavigationPath, type NavigationAgentComponent, type NavigationMesh } from './navigation.js';
import {
  computeNavigationSteering,
  verifyNavigationSteeringReceipt
} from './navigation-corridor.js';

const wideMesh:NavigationMesh={
  schema:'evercraft.world-engine.navmesh.v1',
  id:'avoidance-wide',
  polygons:[{
    id:'floor',
    vertices:[
      {x:-10,y:0,z:-5},
      {x:10,y:0,z:-5},
      {x:10,y:0,z:5},
      {x:-10,y:0,z:5}
    ],
    neighbors:[]
  }]
};

const component:NavigationAgentComponent={
  meshId:'avoidance-wide',
  maxSpeed:2,
  stoppingDistance:.05,
  avoidanceEnabled:true,
  avoidanceTimeHorizonSec:2,
  avoidanceClearance:.1,
  avoidanceNeighborDistance:8,
  avoidanceStrength:1
};

test('reciprocal head-on agents choose opposite deterministic avoidance sides',()=>{
  const aPosition={x:-1,y:0,z:0};
  const bPosition={x:1,y:0,z:0};
  const aPath=findNavigationPath(wideMesh,aPosition,{x:5,y:0,z:0});
  const bPath=findNavigationPath(wideMesh,bPosition,{x:-5,y:0,z:0});

  const a=computeNavigationSteering({
    component,
    path:aPath,
    position:aPosition,
    preferredVelocity:{x:2,y:0,z:0},
    dt:.1,
    mesh:wideMesh,
    context:{
      selfId:'agent-a',
      selfRadius:.25,
      selfVerticalRadius:.25,
      obstacles:[
        {
          id:'agent-a',
          position:aPosition,
          velocity:{x:2,y:0,z:0},
          radius:.25,
          verticalRadius:.25
        },
        {
          id:'agent-b',
          position:bPosition,
          velocity:{x:-2,y:0,z:0},
          radius:.25,
          verticalRadius:.25
        }
      ]
    }
  });

  const b=computeNavigationSteering({
    component,
    path:bPath,
    position:bPosition,
    preferredVelocity:{x:-2,y:0,z:0},
    dt:.1,
    mesh:wideMesh,
    context:{
      selfId:'agent-b',
      selfRadius:.25,
      selfVerticalRadius:.25,
      obstacles:[
        {
          id:'agent-a',
          position:aPosition,
          velocity:{x:2,y:0,z:0},
          radius:.25,
          verticalRadius:.25
        },
        {
          id:'agent-b',
          position:bPosition,
          velocity:{x:-2,y:0,z:0},
          radius:.25,
          verticalRadius:.25
        }
      ]
    }
  });

  assert.deepEqual(a.neighborIds,['agent-b']);
  assert.deepEqual(b.neighborIds,['agent-a']);
  assert.ok(a.desiredVelocity.z>0);
  assert.ok(b.desiredVelocity.z<0);
  assert.equal(verifyNavigationSteeringReceipt(a.receipt),true);
  assert.equal(verifyNavigationSteeringReceipt(b.receipt),true);
});

test('avoidance receipt is independent of obstacle input order',()=>{
  const position={x:-1,y:0,z:0};
  const path=findNavigationPath(wideMesh,position,{x:5,y:0,z:0});
  const obstacles=[
    {
      id:'near',
      position:{x:1,y:0,z:0},
      velocity:{x:-1,y:0,z:0},
      radius:.3,
      verticalRadius:.3
    },
    {
      id:'far',
      position:{x:20,y:0,z:0},
      velocity:{x:0,y:0,z:0},
      radius:.3,
      verticalRadius:.3
    }
  ];

  const base={
    component,
    path,
    position,
    preferredVelocity:{x:2,y:0,z:0},
    dt:.1,
    mesh:wideMesh,
    context:{
      selfId:'self',
      selfRadius:.25,
      selfVerticalRadius:.25,
      obstacles
    }
  };

  const first=computeNavigationSteering(base);
  const second=computeNavigationSteering({
    ...base,
    context:{...base.context,obstacles:[...obstacles].reverse()}
  });

  assert.equal(first.receipt.digest,second.receipt.digest);
  assert.deepEqual(first.desiredVelocity,second.desiredVelocity);
});

test('vertical separation suppresses false local avoidance',()=>{
  const position={x:-1,y:0,z:0};
  const path=findNavigationPath(wideMesh,position,{x:5,y:0,z:0});

  const result=computeNavigationSteering({
    component,
    path,
    position,
    preferredVelocity:{x:2,y:0,z:0},
    dt:.1,
    mesh:wideMesh,
    context:{
      selfId:'ground',
      selfRadius:.25,
      selfVerticalRadius:.25,
      obstacles:[{
        id:'upper-floor',
        position:{x:1,y:5,z:0},
        velocity:{x:-2,y:0,z:0},
        radius:.25,
        verticalRadius:.25
      }]
    }
  });

  assert.deepEqual(result.neighborIds,[]);
  assert.deepEqual(result.avoidanceVelocity,{x:0,y:0,z:0});
  assert.deepEqual(result.desiredVelocity,{x:2,y:0,z:0});
});

test('avoidance steering is constrained back into the path corridor',()=>{
  const narrowMesh:NavigationMesh={
    schema:'evercraft.world-engine.navmesh.v1',
    id:'narrow',
    polygons:[{
      id:'lane',
      vertices:[
        {x:-4,y:0,z:-.5},
        {x:4,y:0,z:-.5},
        {x:4,y:0,z:.5},
        {x:-4,y:0,z:.5}
      ],
      neighbors:[]
    }]
  };
  const narrowComponent:NavigationAgentComponent={
    ...component,
    meshId:'narrow',
    avoidanceClearance:.25,
    avoidanceStrength:2
  };
  const position={x:-1,y:0,z:.45};
  const path=findNavigationPath(narrowMesh,position,{x:3,y:0,z:.45});

  const result=computeNavigationSteering({
    component:narrowComponent,
    path,
    position,
    preferredVelocity:{x:2,y:0,z:0},
    dt:.5,
    mesh:narrowMesh,
    context:{
      selfId:'lane-agent',
      selfRadius:.2,
      selfVerticalRadius:.2,
      obstacles:[{
        id:'blocker',
        position:{x:.25,y:0,z:.45},
        velocity:{x:0,y:0,z:0},
        radius:.35,
        verticalRadius:.35
      }]
    }
  });

  const candidate={
    x:position.x+result.desiredVelocity.x*.5,
    y:0,
    z:position.z+result.desiredVelocity.z*.5
  };
  assert.equal(result.corridorConstrained,true);
  assert.ok(candidate.z<=.5+1e-9);
  assert.ok(candidate.z>=-.5-1e-9);
  assert.deepEqual(result.neighborIds,['blocker']);
});

test('navigation steering receipts fail verification after tampering',()=>{
  const position={x:-1,y:0,z:0};
  const path=findNavigationPath(wideMesh,position,{x:5,y:0,z:0});
  const result=computeNavigationSteering({
    component,
    path,
    position,
    preferredVelocity:{x:2,y:0,z:0},
    dt:.1,
    mesh:wideMesh
  });

  assert.equal(verifyNavigationSteeringReceipt(result.receipt),true);
  const tampered=structuredClone(result.receipt);
  tampered.desiredVelocity.x=999;
  assert.equal(verifyNavigationSteeringReceipt(tampered),false);
});
