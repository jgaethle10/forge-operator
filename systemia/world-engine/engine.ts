import crypto from 'node:crypto';

export type Vec3 = { x:number; y:number; z:number };

export interface TransformComponent {
  position:Vec3;
  rotationDeg?:Vec3;
  scale?:Vec3;
}

export interface RigidBodyComponent {
  mass:number;
  velocity?:Vec3;
  acceleration?:Vec3;
  gravityScale?:number;
  linearDamping?:number;
  restitution?:number;
  kinematic?:boolean;
}

export type ColliderComponent =
  | { type:'box'; halfExtents:Vec3; ground?:boolean }
  | { type:'sphere'; radius:number; ground?:boolean };

export type WorldBehavior =
  | { kind:'spin'; degreesPerSecond:Vec3 }
  | { kind:'constant_force'; force:Vec3 }
  | { kind:'oscillate_y'; amplitude:number; frequencyHz:number; phaseRad?:number };

export interface WorldEntity {
  id:string;
  name?:string;
  transform:TransformComponent;
  rigidBody?:RigidBodyComponent;
  collider?:ColliderComponent;
  behaviors?:WorldBehavior[];
  assetRefs?:string[];
  tags?:string[];
  properties?:Record<string,unknown>;
}

export interface WorldDefinition {
  schema:'evercraft.world-engine.world.v1';
  id:string;
  version:number;
  tickRateHz:number;
  gravity:Vec3;
  ground?:{ enabled:boolean; height:number };
  entities:WorldEntity[];
  metadata?:Record<string,unknown>;
}

export type WorldInput =
  | { id:string; tick:number; entityId:string; kind:'impulse'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'set_velocity'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'teleport'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'set_property'; key:string; value:unknown };

export interface RuntimeEntity extends WorldEntity {
  transform:TransformComponent;
  rigidBody?:RigidBodyComponent & {
    velocity:Vec3;
    acceleration:Vec3;
  };
}

export interface WorldSnapshot {
  schema:'evercraft.world-engine.snapshot.v1';
  worldId:string;
  worldVersion:number;
  definitionDigest:string;
  tick:number;
  timeSec:number;
  entities:RuntimeEntity[];
  digest:string;
}

export interface ReplayReceipt {
  schema:'evercraft.world-engine.replay-receipt.v1';
  worldId:string;
  requestedTicks:number;
  finalTick:number;
  inputCount:number;
  definitionDigest:string;
  finalSnapshotDigest:string;
  deterministic:boolean;
}

const ZERO:Vec3={x:0,y:0,z:0};

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value === 'object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}

function scale(a:Vec3,n:number):Vec3{
  return {x:a.x*n,y:a.y*n,z:a.z*n};
}

function finiteVec3(value:Vec3,label:string){
  for(const axis of ['x','y','z'] as const){
    if(!Number.isFinite(value[axis])) throw new Error(`world_invalid_${label}_${axis}`);
  }
}

export function worldDefinitionDigest(world:WorldDefinition){
  return digest(world);
}

export function validateWorldDefinition(world:WorldDefinition){
  if(world?.schema !== 'evercraft.world-engine.world.v1') throw new Error('world_schema_invalid');
  if(!world.id) throw new Error('world_id_missing');
  if(!Number.isInteger(world.version) || world.version < 1) throw new Error('world_version_invalid');
  if(!Number.isFinite(world.tickRateHz) || world.tickRateHz <= 0 || world.tickRateHz > 240){
    throw new Error('world_tick_rate_invalid');
  }
  finiteVec3(world.gravity,'gravity');
  const ids = new Set<string>();
  for(const entity of world.entities || []){
    if(!entity.id) throw new Error('world_entity_id_missing');
    if(ids.has(entity.id)) throw new Error(`world_entity_duplicate:${entity.id}`);
    ids.add(entity.id);
    finiteVec3(entity.transform?.position,`entity_position_${entity.id}`);
    if(entity.rigidBody){
      if(!Number.isFinite(entity.rigidBody.mass) || entity.rigidBody.mass <= 0){
        throw new Error(`world_entity_mass_invalid:${entity.id}`);
      }
      if(entity.rigidBody.velocity) finiteVec3(entity.rigidBody.velocity,`entity_velocity_${entity.id}`);
      if(entity.rigidBody.acceleration) finiteVec3(entity.rigidBody.acceleration,`entity_acceleration_${entity.id}`);
    }
  }
  return true;
}

function runtimeEntity(source:WorldEntity):RuntimeEntity{
  const entity=clone(source) as RuntimeEntity;
  entity.transform.rotationDeg ||= clone(ZERO);
  entity.transform.scale ||= {x:1,y:1,z:1};
  if(entity.rigidBody){
    entity.rigidBody.velocity ||= clone(ZERO);
    entity.rigidBody.acceleration ||= clone(ZERO);
  }
  return entity;
}

function colliderBottom(entity:RuntimeEntity){
  const collider=entity.collider;
  if(!collider) return entity.transform.position.y;
  if(collider.type==='sphere') return entity.transform.position.y-collider.radius;
  return entity.transform.position.y-collider.halfExtents.y;
}

function colliderVerticalExtent(entity:RuntimeEntity){
  const collider=entity.collider;
  if(!collider) return 0;
  return collider.type==='sphere'?collider.radius:collider.halfExtents.y;
}

export class EvercraftWorldRuntime {
  readonly definition:WorldDefinition;
  readonly definitionDigest:string;
  readonly dt:number;
  private state:Map<string,RuntimeEntity>;
  private _tick=0;

  constructor(definition:WorldDefinition){
    validateWorldDefinition(definition);
    this.definition=clone(definition);
    this.definitionDigest=worldDefinitionDigest(this.definition);
    this.dt=1/this.definition.tickRateHz;
    this.state=new Map(
      [...this.definition.entities]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(entity=>[entity.id,runtimeEntity(entity)])
    );
  }

  get tick(){
    return this._tick;
  }

  get timeSec(){
    return this._tick*this.dt;
  }

  entity(id:string){
    const found=this.state.get(id);
    return found?clone(found):null;
  }

  private mutateEntity(id:string){
    const found=this.state.get(id);
    if(!found) throw new Error(`world_entity_missing:${id}`);
    return found;
  }

  private applyInput(input:WorldInput){
    const entity=this.mutateEntity(input.entityId);
    if(input.kind==='teleport'){
      finiteVec3(input.value,'teleport');
      entity.transform.position=clone(input.value);
      return;
    }
    if(input.kind==='set_property'){
      entity.properties ||= {};
      entity.properties[input.key]=clone(input.value);
      return;
    }
    if(!entity.rigidBody) throw new Error(`world_entity_not_dynamic:${entity.id}`);
    if(input.kind==='set_velocity'){
      finiteVec3(input.value,'set_velocity');
      entity.rigidBody.velocity=clone(input.value);
      return;
    }
    finiteVec3(input.value,'impulse');
    const invMass=1/entity.rigidBody.mass;
    entity.rigidBody.velocity=add(entity.rigidBody.velocity,scale(input.value,invMass));
  }

  private applyBehaviors(entity:RuntimeEntity,nextTime:number){
    for(const behavior of entity.behaviors || []){
      if(behavior.kind==='spin'){
        const rot=entity.transform.rotationDeg || clone(ZERO);
        entity.transform.rotationDeg=add(rot,scale(behavior.degreesPerSecond,this.dt));
      }else if(behavior.kind==='constant_force' && entity.rigidBody && !entity.rigidBody.kinematic){
        entity.rigidBody.acceleration=add(
          entity.rigidBody.acceleration,
          scale(behavior.force,1/entity.rigidBody.mass)
        );
      }else if(behavior.kind==='oscillate_y'){
        const base=Number(entity.properties?.oscillationBaseY ?? entity.transform.position.y);
        entity.properties ||= {};
        if(entity.properties.oscillationBaseY === undefined) entity.properties.oscillationBaseY=base;
        entity.transform.position.y=base + behavior.amplitude*Math.sin(
          Math.PI*2*behavior.frequencyHz*nextTime + (behavior.phaseRad || 0)
        );
      }
    }
  }

  private integrate(entity:RuntimeEntity){
    const body=entity.rigidBody;
    if(!body || body.kinematic) return;
    const gravity=scale(this.definition.gravity,body.gravityScale ?? 1);
    const acceleration=add(body.acceleration,gravity);
    body.velocity=add(body.velocity,scale(acceleration,this.dt));
    const damping=Math.max(0,Math.min(1,body.linearDamping ?? 0));
    body.velocity=scale(body.velocity,Math.max(0,1-damping*this.dt));
    entity.transform.position=add(entity.transform.position,scale(body.velocity,this.dt));
    body.acceleration=clone(ZERO);

    if(this.definition.ground?.enabled && colliderBottom(entity) < this.definition.ground.height){
      const extent=colliderVerticalExtent(entity);
      entity.transform.position.y=this.definition.ground.height+extent;
      if(body.velocity.y < 0){
        body.velocity.y=-body.velocity.y*Math.max(0,Math.min(1,body.restitution ?? 0));
        if(Math.abs(body.velocity.y) < 1e-10) body.velocity.y=0;
      }
    }
  }

  step(inputs:WorldInput[]=[]){
    const targetTick=this._tick+1;
    for(const input of [...inputs]
      .filter(item=>item.tick===targetTick)
      .sort((a,b)=>a.id.localeCompare(b.id))){
      this.applyInput(input);
    }

    const nextTime=targetTick*this.dt;
    for(const entity of [...this.state.values()].sort((a,b)=>a.id.localeCompare(b.id))){
      this.applyBehaviors(entity,nextTime);
      this.integrate(entity);
    }
    this._tick=targetTick;
    return this.snapshot();
  }

  run(ticks:number,inputs:WorldInput[]=[]){
    if(!Number.isInteger(ticks) || ticks<0) throw new Error('world_run_ticks_invalid');
    let snapshot=this.snapshot();
    for(let i=0;i<ticks;i++) snapshot=this.step(inputs);
    return snapshot;
  }

  snapshot():WorldSnapshot{
    const core={
      schema:'evercraft.world-engine.snapshot.v1' as const,
      worldId:this.definition.id,
      worldVersion:this.definition.version,
      definitionDigest:this.definitionDigest,
      tick:this._tick,
      timeSec:Number(this.timeSec.toFixed(9)),
      entities:[...this.state.values()]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(entity=>clone(entity))
    };
    return {...core,digest:digest(core)};
  }
}

export function replayWorld(definition:WorldDefinition,ticks:number,inputs:WorldInput[]=[]):ReplayReceipt{
  const first=new EvercraftWorldRuntime(definition).run(ticks,inputs);
  const second=new EvercraftWorldRuntime(definition).run(ticks,inputs);
  return {
    schema:'evercraft.world-engine.replay-receipt.v1',
    worldId:definition.id,
    requestedTicks:ticks,
    finalTick:first.tick,
    inputCount:inputs.length,
    definitionDigest:first.definitionDigest,
    finalSnapshotDigest:first.digest,
    deterministic:first.digest===second.digest
  };
}
