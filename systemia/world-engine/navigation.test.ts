import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld, type WorldDefinition } from './engine.js';
import {
  findNavigationPath,
  validateNavigationMesh,
  type NavigationMesh
} from './navigation.js';
import { compileRenderFrame } from './bridges.js';
import { WorldEntityStore } from './entity-store.js';

const mesh:NavigationMesh={
  schema:'evercraft.world-engine.navmesh.v1',
  id:'test-nav',
  polygons:[
    {
      id:'a',
      vertices:[
        {x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}
      ],
      neighbors:['b']
    },
    {
      id:'b',
      vertices:[
        {x:4,y:0,z:0},{x:8,y:0,z:0},{x:8,y:0,z:4},{x:4,y:0,z:4}
      ],
      neighbors:['a','c']
    },
    {
      id:'c',
      vertices:[
        {x:4,y:0,z:4},{x:8,y:0,z:4},{x:8,y:0,z:8},{x:4,y:0,z:8}
      ],
      neighbors:['b']
    }
  ]
};

const animation={
  schema:'evercraft.world-engine.animation.v1' as const,
  rig:{
    id:'agent-rig',
    bones:[{
      id:'root',
      bind:{
        translation:{x:0,y:0,z:0},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:1,y:1,z:1}
      }
    }]
  },
  clips:[
    {id:'idle-clip',durationSec:1,loop:true,tracks:[]},
    {id:'move-clip',durationSec:1,loop:true,tracks:[]}
  ],
  states:[
    {id:'idle',clipId:'idle-clip'},
    {id:'move',clipId:'move-clip'}
  ],
  initialState:'idle',
  transitions:[
    {
      id:'idle-to-move',
      from:'idle',
      to:'move',
      conditions:[{parameter:'moving',operator:'truthy' as const}],
      blendSec:0
    },
    {
      id:'move-to-idle',
      from:'move',
      to:'idle',
      conditions:[{parameter:'moving',operator:'falsy' as const}],
      blendSec:0
    }
  ],
  parameters:{moving:false}
};

function navigationWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'navigation-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    navigationMeshes:[mesh],
    entities:[
      {
        id:'agent',
        transform:{position:{x:1,y:0,z:1}},
        rigidBody:{mass:1,velocity:{x:0,y:0,z:0},linearDamping:0},
        collider:{type:'sphere',radius:.2},
        animation,
        navigationAgent:{
          meshId:'test-nav',
          maxSpeed:5,
          stoppingDistance:.05,
          animationMovingParameter:'moving'
        },
        tags:['agent','animated']
      }
    ]
  };
}

test('navmesh validates symmetric polygon adjacency',()=>{
  assert.equal(validateNavigationMesh(mesh),true);
  const invalid=structuredClone(mesh);
  invalid.polygons.find(polygon=>polygon.id==='b')!.neighbors=['c'];
  assert.throws(
    ()=>validateNavigationMesh(invalid),
    /navigation_polygon_neighbor_asymmetric/
  );
});

test('deterministic A* preserves corridor polygons and funnel-smooths waypoints',()=>{
  const path=findNavigationPath(mesh,{x:1,y:0,z:1},{x:7,y:0,z:7});
  assert.deepEqual(path.polygonIds,['a','b','c']);
  assert.equal(path.smoothing,'funnel_v1');
  assert.deepEqual(path.corridorPortals.map(portal=>[
    portal.fromPolygonId,
    portal.toPolygonId
  ]),[
    ['a','b'],
    ['b','c']
  ]);
  assert.deepEqual(path.waypoints,[{x:7,y:0,z:7}]);
  assert.equal(path.geometricLength,8.485281374);

  const second=findNavigationPath(mesh,{x:1,y:0,z:1},{x:7,y:0,z:7});
  assert.equal(path.digest,second.digest);
});

test('navmesh neighbors must share one canonical portal edge',()=>{
  const invalid:NavigationMesh={
    schema:'evercraft.world-engine.navmesh.v1',
    id:'broken-portals',
    polygons:[
      {
        id:'left',
        vertices:[
          {x:0,y:0,z:0},
          {x:2,y:0,z:0},
          {x:2,y:0,z:2},
          {x:0,y:0,z:2}
        ],
        neighbors:['right']
      },
      {
        id:'right',
        vertices:[
          {x:3,y:0,z:0},
          {x:5,y:0,z:0},
          {x:5,y:0,z:2},
          {x:3,y:0,z:2}
        ],
        neighbors:['left']
      }
    ]
  };

  assert.throws(
    ()=>validateNavigationMesh(invalid),
    /navigation_polygon_neighbor_portal_missing/
  );
});

test('tick-bound navigation target drives physics locomotion and animation state',()=>{
  const runtime=new EvercraftWorldRuntime(navigationWorld());
  runtime.step([{
    id:'go',
    tick:1,
    entityId:'agent',
    kind:'set_navigation_target',
    value:{x:7,y:0,z:7}
  }]);

  const afterOne=runtime.entity('agent')!;
  assert.equal(afterOne.navigationRuntime!.state,'moving');
  assert.equal(afterOne.animationRuntime!.stateId,'move');
  assert.ok(afterOne.transform.position.x>1);

  runtime.run(35);
  const arrived=runtime.entity('agent')!;
  assert.equal(arrived.navigationRuntime!.state,'arrived');
  assert.ok(Math.abs(arrived.transform.position.x-7)<.06);
  assert.ok(Math.abs(arrived.transform.position.z-7)<.06);
  assert.equal(arrived.animationRuntime!.stateId,'idle');
  assert.equal(arrived.rigidBody!.velocity.x,0);
  assert.equal(arrived.rigidBody!.velocity.z,0);
});

test('navigation freezes with scene residency and resumes from preserved path state',()=>{
  const runtime=new EvercraftWorldRuntime(navigationWorld());
  runtime.step([{
    id:'go',
    tick:1,
    entityId:'agent',
    kind:'set_navigation_target',
    value:{x:7,y:0,z:7}
  }]);
  runtime.run(4);

  const before=runtime.entity('agent')!;
  runtime.setActiveEntityIds([]);
  runtime.run(10);
  const frozen=runtime.entity('agent')!;

  assert.deepEqual(frozen.transform.position,before.transform.position);
  assert.equal(frozen.navigationRuntime!.waypointIndex,before.navigationRuntime!.waypointIndex);

  runtime.setActiveEntityIds(['agent']);
  runtime.step();
  const resumed=runtime.entity('agent')!;
  assert.notDeepEqual(resumed.transform.position,frozen.transform.position);
});

test('clear target stops horizontal locomotion deterministically',()=>{
  const runtime=new EvercraftWorldRuntime(navigationWorld());
  runtime.step([{
    id:'go',
    tick:1,
    entityId:'agent',
    kind:'set_navigation_target',
    value:{x:7,y:0,z:7}
  }]);
  runtime.step([{
    id:'stop',
    tick:2,
    entityId:'agent',
    kind:'clear_navigation_target'
  }]);

  const stopped=runtime.entity('agent')!;
  assert.equal(stopped.navigationRuntime!.state,'idle');
  assert.equal(stopped.rigidBody!.velocity.x,0);
  assert.equal(stopped.rigidBody!.velocity.z,0);
  assert.equal(stopped.animationRuntime!.stateId,'idle');
});

test('navigation inputs replay to identical world snapshots',()=>{
  const inputs=[
    {
      id:'go',
      tick:1,
      entityId:'agent',
      kind:'set_navigation_target' as const,
      value:{x:7,y:0,z:7}
    }
  ];
  const receipt=replayWorld(navigationWorld(),40,inputs);
  assert.equal(receipt.deterministic,true);
});

test('render frames expose navigation plan as read-only runtime state',()=>{
  const runtime=new EvercraftWorldRuntime(navigationWorld());
  runtime.step([{
    id:'go',
    tick:1,
    entityId:'agent',
    kind:'set_navigation_target',
    value:{x:7,y:0,z:7}
  }]);
  const frame=compileRenderFrame(runtime.snapshot(),'nav-camera');
  const agent=frame.entities.find(entity=>entity.id==='agent');
  assert.ok(agent?.navigation);
  assert.equal(agent!.navigation!.state,'moving');
  assert.deepEqual((agent!.navigation!.path as any).polygonIds,['a','b','c']);
});

test('entity store indexes navigation agents',()=>{
  const store=new WorldEntityStore(navigationWorld().entities);
  assert.deepEqual(store.idsForComponent('navigationAgent'),['agent']);
});

test('navigation agents require dynamic physics and collision authority',()=>{
  const invalid=navigationWorld();
  delete invalid.entities[0].rigidBody;
  assert.throws(
    ()=>new EvercraftWorldRuntime(invalid),
    /world_navigation_agent_requires_dynamic_rigid_body/
  );
});
