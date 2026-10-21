import { createFleetController, makeDemoFleet } from '../earthworks-autonomy/fleet-controller.mjs';
import {
  EvercraftWorldRuntime,
  type WorldDefinition,
  type WorldInput,
  type Vec3,
} from '../world-engine/engine.js';
import { compileRenderFrame } from '../world-engine/bridges.js';
import { buildEixWorldReplay } from './world-frame-eix-adapter.mjs';

/**
 * EIX-001 EarthWorks adapter.
 * FleetController is the only authority for simulated machine state.
 * World Engine owns the deterministic visual-world position samples.
 * These zone coordinates are an authored FICTIONAL site layout, not survey data.
 * No generated position authorizes real equipment actuation.
 */
type FleetMachine = {
  id: string;
  kind: string;
  zone: string;
  state: string;
  progress?: number;
  payloadTons?: number;
  commandedSpeedMps?: number;
  hold?: boolean;
};

const DIG:Vec3 = {x:0,y:0,z:0};
const DUMP:Vec3 = {x:100,y:0,z:0};
const STOCKPILE:Vec3 = {x:108,y:0,z:26};

function clamp(value:number){
  return Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 0;
}
function lerp(from:Vec3,to:Vec3,progress:number):Vec3{
  const p=clamp(progress);
  return {x:from.x+(to.x-from.x)*p,y:0,z:from.z+(to.z-from.z)*p};
}
function queuePosition(machine:FleetMachine,ordinal:number):Vec3{
  const id = /^HT-(\d+)$/.exec(machine.id);
  const n = id ? Number(id[1])-1 : ordinal;
  return {x:-35,y:0,z:9+n*9};
}
function machinePosition(machine:FleetMachine,ordinal:number):Vec3{
  if(machine.kind==='excavator')return {x:-7,y:0,z:-8};
  if(machine.kind==='front_loader')return STOCKPILE;
  const queue=queuePosition(machine,ordinal);
  switch(machine.state){
    case 'approach':return lerp(queue,DIG,machine.progress??0);
    case 'loading':return DIG;
    case 'haul':return lerp(DIG,DUMP,machine.progress??0);
    case 'dump':return DUMP;
    case 'return':return lerp({x:DUMP.x,y:0,z:18},{x:queue.x,y:0,z:queue.z},machine.progress??0);
    case 'queue':return queue;
    default:return machine.zone==='dump-pad'?DUMP:machine.zone==='stockpile'?STOCKPILE:queue;
  }
}

export interface EarthworksExperienceOptions {
  ticks?:number;
  emergencyStopTick?:number|null;
}

export function buildEarthworksWorldReplay({
  ticks=90,
  emergencyStopTick=null,
}:EarthworksExperienceOptions = {}){
  if(!Number.isInteger(ticks)||ticks<1||ticks>600)throw new Error('eix_earthworks_tick_budget_invalid');
  if(emergencyStopTick!==null&&(!Number.isInteger(emergencyStopTick)||emergencyStopTick<1||emergencyStopTick>ticks)){
    throw new Error('eix_earthworks_stop_tick_invalid');
  }

  const controller=createFleetController();
  const initial=makeDemoFleet() as FleetMachine[];
  const world:WorldDefinition={
    schema:'evercraft.world-engine.world.v1',
    id:'earthworks-toy-yard-experience-001',
    version:1,
    tickRateHz:1,
    gravity:{x:0,y:0,z:0},
    entities:initial.map((machine,index)=>({
      id:machine.id,
      name:machine.id,
      transform:{position:machinePosition(machine,index)},
      tags:['earthworks','simulation',machine.kind],
      properties:{
        display_name:machine.id,
        evidence_state:'modeled',
        source_refs:['earthworks:fleet-controller:toy-yard-001'],
        machine_state:machine.state,
        zone:machine.zone,
        payload_tons:machine.payloadTons||0,
        commanded_speed_mps:0,
        controller_hold:false,
      }
    })),
    metadata:{
      adapter:'evercraft.experience.earthworks-world-replay.v1',
      origin:'earthworks-autonomy:fleet-controller',
      site_layout:'authored_synthetic',
      authority:'simulation_only',
      physical_equipment_actuation:false,
      real_site_measurements:false,
      publication_authority:false,
    },
  };

  const runtime=new EvercraftWorldRuntime(world);
  const frames=[compileRenderFrame(runtime.snapshot(),'toy-yard-overview',world)];
  for(let tick=1;tick<=ticks;tick++){
    const state=emergencyStopTick===tick
      ? controller.stopAll('EIX simulated emergency stop')
      : controller.step();
    const inputs:WorldInput[]=[];
    state.fleet.forEach((machine:FleetMachine,index:number)=>{
      const position=machinePosition(machine,index);
      inputs.push(
        {id:`eix:${tick}:${machine.id}:position`,tick,entityId:machine.id,kind:'teleport',value:position},
        {id:`eix:${tick}:${machine.id}:state`,tick,entityId:machine.id,kind:'set_property',key:'machine_state',value:machine.state},
        {id:`eix:${tick}:${machine.id}:zone`,tick,entityId:machine.id,kind:'set_property',key:'zone',value:machine.zone},
        {id:`eix:${tick}:${machine.id}:payload`,tick,entityId:machine.id,kind:'set_property',key:'payload_tons',value:machine.payloadTons||0},
        {id:`eix:${tick}:${machine.id}:speed`,tick,entityId:machine.id,kind:'set_property',key:'commanded_speed_mps',value:machine.commandedSpeedMps||0},
        {id:`eix:${tick}:${machine.id}:hold`,tick,entityId:machine.id,kind:'set_property',key:'controller_hold',value:Boolean(machine.hold)}
      );
    });
    runtime.step(inputs);
    frames.push(compileRenderFrame(runtime.snapshot(),'toy-yard-overview',world));
  }
  const teaching_cues=[
    {tick:0,text:'Synthetic EarthWorks fleet scenario. Positions are modeled, not measured machinery movements.',evidence_state:'modeled'},
    ...(emergencyStopTick===null?[]:[{
      tick:emergencyStopTick,
      text:'Simulation-only emergency stop. This is not a demonstration of physical machine braking.',
      evidence_state:'modeled'
    }]),
  ];
  return buildEixWorldReplay({
    world_id:world.id,
    frames,
    teaching_cues,
    title:'EarthWorks Toy Yard: fleet and material flow'
  });
}
