/**
 * RC05F adversarial synthetic world fixtures, intentionally distinct from RC02's
 * three-static-one-crossing-generator. These are not independently sourced scenes,
 * physical measurements, calibrated sensors or safe robot instructions.
 */
import {makeRng} from './rover-lab.mjs';

export const FAMILY_SCHEMA='evercraft.sim-to-real.synthetic-hazard-family.rc05f';
export const FAMILY_NAMES=['crossing-lanes','offset-slalom'];
const valid=(v)=>typeof v==='number'&&Number.isFinite(v);
const assert=(p,m)=>{if(!p)throw Error(m)};
const round=v=>Number(v.toFixed(5));

function entity(o){
  return {id:o.id,transform:{position:{x:o.x,y:0,z:o.y}},
    collider:{type:'sphere',radius:o.radius},
    ...(o.moving?{rigidBody:{mass:1e8,gravityScale:0,linearDamping:0,restitution:0}}:{}),
    tags:['modeled','obstacle',o.moving?'moving-hazard':'static-hazard'],
    properties:{synthetic:true,moving:!!o.moving}};
}
export function createFamilyScenario(seed,family){
  assert(Number.isSafeInteger(seed)&&seed>0,'rc05f_invalid_seed');
  assert(FAMILY_NAMES.includes(family),'rc05f_invalid_family');
  // Separate RNG and obstacle generation, not a re-seeding of the old fixture.
  const rng=makeRng((seed^0x71faced1)>>>0);
  const jitter=(amount)=>round((rng()-.5)*amount*2);
  const params={
    traction:round(.78+rng()*.25),
    steeringGain:1,steeringBias:0,initialHeading:0,
    commandDelaySteps:2+Math.floor(rng()*5),
    acceleration:round(.32+rng()*.23),braking:round(.34+rng()*.28),
    sensorNoiseMeters:round(.035+rng()*.08),
    dropProbability:round(.05+rng()*.17),
    sensorBlackoutStart:22+Math.floor(rng()*95),
    sensorBlackoutLength:5+Math.floor(rng()*16),
    movingSpeed:round(.22+rng()*.23)
  };
  const specs=family==='crossing-lanes'?
    [{id:'island-west',x:2.4,y:1.05,radius:.57},
     {id:'island-east',x:5.45,y:-1.0,radius:.57},
     {id:'island-final',x:8.05,y:1.12,radius:.5},
     {id:'crossing-north',x:3.75,y:-2.12,radius:.36,moving:true,dir:1},
     {id:'crossing-south',x:7.2,y:2.13,radius:.39,moving:true,dir:-1}]:
    [{id:'offset-1',x:2.0,y:-.88,radius:.58},
     {id:'offset-2',x:3.75,y:.9,radius:.63},
     {id:'offset-3',x:5.5,y:-.95,radius:.55},
     {id:'offset-4',x:7.35,y:.88,radius:.58},
     {id:'offset-5',x:9.0,y:-.9,radius:.46},
     {id:'sweeper-east',x:6.25,y:-2.0,radius:.38,moving:true,dir:1}];
  const obstacles=specs.map(o=>({...o,x:round(o.x+jitter(.13)),y:round(o.y+jitter(.13)),
    radius:round(o.radius+jitter(.045))}));
  const course={schema:FAMILY_SCHEMA,seed,family,dt:.1,params,obstacles,
    bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},
    robotRadius:.22,goal:{x:10,y:0},goalRadius:.35,maxSpeed:1,maxYaw:1.7};
  const world={schema:'evercraft.world-engine.world.v1',id:'sim-to-real-rc05f-'+family+'-'+seed,
    version:1,tickRateHz:10,gravity:{x:0,y:0,z:0},ground:{enabled:false,height:0},
    entities:[{id:'rover',transform:{position:{x:0,y:0,z:0}},
      collider:{type:'sphere',radius:course.robotRadius},
      rigidBody:{mass:1,gravityScale:0,linearDamping:0,restitution:0},
      tags:['modeled','controlled-by-tick-input'],properties:{source:'rc05f',hardware_execution:false}},
      ...obstacles.map(entity)],
    metadata:{evidence_state:'modeled',scenarioFamily:family,hardwareAuthority:false,
      worldGeometry:'distinct synthetic static and moving hazard arrangements'}};
  return {course,world,family};
}

/** Only obstacle motion is prescribed; rover movement remains native set_velocity.
 * The crossing is a back-and-forth planar sweep, not an observed real-world path.
 */
export function familyMovingInputs({course,obstaclesBefore,tick}){
  assert(course?.schema===FAMILY_SCHEMA&&FAMILY_NAMES.includes(course.family),'rc05f_invalid_course');
  assert(Array.isArray(obstaclesBefore)&&Number.isInteger(tick)&&tick>0,'rc05f_invalid_motion_tick');
  const inputs=[];
  for(const o of course.obstacles.filter(x=>x.moving)){
    const entity=obstaclesBefore.find(e=>e.id===o.id);
    assert(entity,'rc05f_moving_entity_missing');
    const current=entity.transform.position.z;
    assert(valid(current),'rc05f_moving_position_invalid');
    // Reflect at synthetic world bounds rather than walking indefinitely.
    let direction=o.dir;
    const extent=2.23;
    if(direction>0&&current>=extent)direction=-1;
    if(direction<0&&current<=-extent)direction=1;
    // Position-based reversal is deterministic from ledger replay, no hidden state.
    // Sinusoidal velocity changes sign at the crossing's extrema.
    const angular=.1+course.params.movingSpeed*.35;
    const phase=tick*.1*angular+((o.dir<0)?Math.PI:0);
    const dz=2.02*angular*Math.cos(phase);
    inputs.push({id:'rc05f-'+o.id+'-'+tick,tick,entityId:o.id,kind:'set_velocity',
      value:{x:0,y:0,z:dz}});
  }
  return inputs;
}
