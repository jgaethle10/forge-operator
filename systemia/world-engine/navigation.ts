import crypto from 'node:crypto';
import type { Vec3 } from './engine.js';
import {
  buildNavigationCorridor,
  computeNavigationSteering,
  validateNavigationPortals,
  type NavigationAvoidanceContext,
  type NavigationCorridorPortal,
  type NavigationSteeringReceipt
} from './navigation-corridor.js';

export interface NavigationPolygon {
  id:string;
  vertices:Vec3[];
  neighbors:string[];
  traversalCost?:number;
  tags?:string[];
}

export interface NavigationMesh {
  schema:'evercraft.world-engine.navmesh.v1';
  id:string;
  polygons:NavigationPolygon[];
}

export interface NavigationPath {
  schema:'evercraft.world-engine.navpath.v1';
  meshId:string;
  start:Vec3;
  goal:Vec3;
  polygonIds:string[];
  corridorPortals:NavigationCorridorPortal[];
  waypoints:Vec3[];
  smoothing:'funnel_v1';
  cost:number;
  geometricLength:number;
  digest:string;
}

export interface NavigationAgentComponent {
  meshId:string;
  maxSpeed:number;
  stoppingDistance?:number;
  initialTarget?:Vec3;
  animationMovingParameter?:string;
  avoidanceEnabled?:boolean;
  avoidanceTimeHorizonSec?:number;
  avoidanceClearance?:number;
  avoidanceNeighborDistance?:number;
  avoidanceStrength?:number;
}

export interface NavigationAgentRuntime {
  target:Vec3|null;
  path:NavigationPath|null;
  waypointIndex:number;
  state:'idle'|'moving'|'arrived'|'blocked';
  preferredVelocity:Vec3;
  avoidanceVelocity:Vec3;
  desiredVelocity:Vec3;
  avoidanceNeighborIds:string[];
  corridorConstrained:boolean;
  steeringReceipt:NavigationSteeringReceipt|null;
  replanCount:number;
}

const ZERO:Vec3={x:0,y:0,z:0};
const EPS=1e-9;

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
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

function finiteVec3(value:Vec3,label:string){
  for(const axis of ['x','y','z'] as const){
    if(!Number.isFinite(value?.[axis])) throw new Error(`navigation_invalid_${label}_${axis}`);
  }
}

function centroid(polygon:NavigationPolygon):Vec3{
  const total=polygon.vertices.reduce(
    (sum,vertex)=>({x:sum.x+vertex.x,y:sum.y+vertex.y,z:sum.z+vertex.z}),
    clone(ZERO)
  );
  const n=polygon.vertices.length;
  return {x:total.x/n,y:total.y/n,z:total.z/n};
}

function distance(a:Vec3,b:Vec3){
  const dx=a.x-b.x;
  const dy=a.y-b.y;
  const dz=a.z-b.z;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

function normalizeXZ(vector:Vec3){
  const length=Math.sqrt(vector.x*vector.x+vector.z*vector.z);
  if(length<=EPS) return clone(ZERO);
  return {x:vector.x/length,y:0,z:vector.z/length};
}

function pointInPolygonXZ(point:Vec3,vertices:Vec3[]){
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const xi=vertices[i].x;
    const zi=vertices[i].z;
    const xj=vertices[j].x;
    const zj=vertices[j].z;
    const intersects=((zi>point.z)!==(zj>point.z))
      && point.x < ((xj-xi)*(point.z-zi))/((zj-zi)||Number.EPSILON)+xi;
    if(intersects) inside=!inside;
  }
  return inside;
}

function polygonAreaXZ(vertices:Vec3[]){
  let area=0;
  for(let i=0;i<vertices.length;i++){
    const current=vertices[i];
    const next=vertices[(i+1)%vertices.length];
    area+=current.x*next.z-next.x*current.z;
  }
  return Math.abs(area)/2;
}

export function validateNavigationMesh(mesh:NavigationMesh){
  if(mesh?.schema!=='evercraft.world-engine.navmesh.v1') throw new Error('navigation_mesh_schema_invalid');
  if(!mesh.id) throw new Error('navigation_mesh_id_missing');
  if(!Array.isArray(mesh.polygons) || !mesh.polygons.length) throw new Error(`navigation_mesh_polygons_missing:${mesh.id}`);

  const ids=new Set<string>();
  for(const polygon of mesh.polygons){
    if(!polygon.id) throw new Error(`navigation_polygon_id_missing:${mesh.id}`);
    if(ids.has(polygon.id)) throw new Error(`navigation_polygon_duplicate:${mesh.id}:${polygon.id}`);
    ids.add(polygon.id);
    if(!Array.isArray(polygon.vertices) || polygon.vertices.length<3){
      throw new Error(`navigation_polygon_vertices_invalid:${mesh.id}:${polygon.id}`);
    }
    polygon.vertices.forEach((vertex,index)=>finiteVec3(vertex,`${mesh.id}_${polygon.id}_vertex_${index}`));
    if(polygonAreaXZ(polygon.vertices)<=EPS){
      throw new Error(`navigation_polygon_area_invalid:${mesh.id}:${polygon.id}`);
    }
    if(polygon.traversalCost!==undefined && (!Number.isFinite(polygon.traversalCost) || polygon.traversalCost<=0)){
      throw new Error(`navigation_polygon_cost_invalid:${mesh.id}:${polygon.id}`);
    }
  }

  const byId=new Map(mesh.polygons.map(polygon=>[polygon.id,polygon]));
  for(const polygon of mesh.polygons){
    const unique=[...new Set(polygon.neighbors || [])].sort();
    for(const neighborId of unique){
      if(neighborId===polygon.id) throw new Error(`navigation_polygon_self_neighbor:${mesh.id}:${polygon.id}`);
      const neighbor=byId.get(neighborId);
      if(!neighbor) throw new Error(`navigation_polygon_neighbor_missing:${mesh.id}:${polygon.id}:${neighborId}`);
      if(!(neighbor.neighbors || []).includes(polygon.id)){
        throw new Error(`navigation_polygon_neighbor_asymmetric:${mesh.id}:${polygon.id}:${neighborId}`);
      }
    }
  }

  validateNavigationPortals(mesh);
  return true;
}

export function validateNavigationAgent(component:NavigationAgentComponent,meshes:NavigationMesh[]){
  if(!component?.meshId) throw new Error('navigation_agent_mesh_id_missing');
  if(!meshes.some(mesh=>mesh.id===component.meshId)){
    throw new Error(`navigation_agent_mesh_missing:${component.meshId}`);
  }
  if(!Number.isFinite(component.maxSpeed) || component.maxSpeed<=0){
    throw new Error('navigation_agent_speed_invalid');
  }
  if(component.stoppingDistance!==undefined && (!Number.isFinite(component.stoppingDistance) || component.stoppingDistance<0)){
    throw new Error('navigation_agent_stopping_distance_invalid');
  }
  if(component.initialTarget) finiteVec3(component.initialTarget,'agent_initial_target');
  if(
    component.avoidanceTimeHorizonSec!==undefined &&
    (!Number.isFinite(component.avoidanceTimeHorizonSec) ||
      component.avoidanceTimeHorizonSec<=0 ||
      component.avoidanceTimeHorizonSec>10)
  ){
    throw new Error('navigation_agent_avoidance_horizon_invalid');
  }
  if(
    component.avoidanceClearance!==undefined &&
    (!Number.isFinite(component.avoidanceClearance) ||
      component.avoidanceClearance<0)
  ){
    throw new Error('navigation_agent_avoidance_clearance_invalid');
  }
  if(
    component.avoidanceNeighborDistance!==undefined &&
    (!Number.isFinite(component.avoidanceNeighborDistance) ||
      component.avoidanceNeighborDistance<=0)
  ){
    throw new Error('navigation_agent_avoidance_neighbor_distance_invalid');
  }
  if(
    component.avoidanceStrength!==undefined &&
    (!Number.isFinite(component.avoidanceStrength) ||
      component.avoidanceStrength<0 ||
      component.avoidanceStrength>4)
  ){
    throw new Error('navigation_agent_avoidance_strength_invalid');
  }
  return true;
}

function locatePolygon(mesh:NavigationMesh,point:Vec3){
  const containing=[...mesh.polygons]
    .filter(polygon=>pointInPolygonXZ(point,polygon.vertices))
    .sort((a,b)=>a.id.localeCompare(b.id));
  if(containing.length) return containing[0];

  return [...mesh.polygons]
    .map(polygon=>({polygon,distance:distance(point,centroid(polygon))}))
    .sort((a,b)=>a.distance-b.distance || a.polygon.id.localeCompare(b.polygon.id))[0]?.polygon || null;
}

function heuristic(a:NavigationPolygon,b:NavigationPolygon){
  return distance(centroid(a),centroid(b));
}

function edgeCost(a:NavigationPolygon,b:NavigationPolygon){
  const base=distance(centroid(a),centroid(b));
  return base*((a.traversalCost || 1)+(b.traversalCost || 1))/2;
}

export function findNavigationPath(mesh:NavigationMesh,start:Vec3,goal:Vec3):NavigationPath{
  validateNavigationMesh(mesh);
  finiteVec3(start,'path_start');
  finiteVec3(goal,'path_goal');

  const startPolygon=locatePolygon(mesh,start);
  const goalPolygon=locatePolygon(mesh,goal);
  if(!startPolygon || !goalPolygon) throw new Error(`navigation_path_mesh_empty:${mesh.id}`);

  const byId=new Map(mesh.polygons.map(polygon=>[polygon.id,polygon]));
  const open=new Set<string>([startPolygon.id]);
  const cameFrom=new Map<string,string>();
  const gScore=new Map<string,number>([[startPolygon.id,0]]);
  const fScore=new Map<string,number>([[startPolygon.id,heuristic(startPolygon,goalPolygon)]]);

  while(open.size){
    const currentId=[...open].sort((a,b)=>
      (fScore.get(a) ?? Infinity)-(fScore.get(b) ?? Infinity)
      || (gScore.get(a) ?? Infinity)-(gScore.get(b) ?? Infinity)
      || a.localeCompare(b)
    )[0];

    if(currentId===goalPolygon.id){
      const polygonIds=[currentId];
      let cursor=currentId;
      while(cameFrom.has(cursor)){
        cursor=cameFrom.get(cursor)!;
        polygonIds.push(cursor);
      }
      polygonIds.reverse();

      const corridor=buildNavigationCorridor(
        mesh,
        polygonIds,
        start,
        goal
      );
      let geometricLength=0;
      let cursorPoint=clone(start);
      for(const waypoint of corridor.waypoints){
        geometricLength+=distance(cursorPoint,waypoint);
        cursorPoint=waypoint;
      }
      const core={
        schema:'evercraft.world-engine.navpath.v1' as const,
        meshId:mesh.id,
        start:clone(start),
        goal:clone(goal),
        polygonIds,
        corridorPortals:corridor.portals,
        waypoints:corridor.waypoints,
        smoothing:'funnel_v1' as const,
        cost:Number((gScore.get(currentId) || 0).toFixed(9)),
        geometricLength:Number(geometricLength.toFixed(9))
      };
      return {...core,digest:digest(core)};
    }

    open.delete(currentId);
    const current=byId.get(currentId)!;
    for(const neighborId of [...new Set(current.neighbors || [])].sort()){
      const neighbor=byId.get(neighborId)!;
      const tentative=(gScore.get(currentId) || 0)+edgeCost(current,neighbor);
      const existing=gScore.get(neighborId);
      if(existing!==undefined && tentative>=existing-EPS) continue;
      cameFrom.set(neighborId,currentId);
      gScore.set(neighborId,tentative);
      fScore.set(neighborId,tentative+heuristic(neighbor,goalPolygon));
      open.add(neighborId);
    }
  }

  const core={
    schema:'evercraft.world-engine.navpath.v1' as const,
    meshId:mesh.id,
    start:clone(start),
    goal:clone(goal),
    polygonIds:[],
    corridorPortals:[],
    waypoints:[],
    smoothing:'funnel_v1' as const,
    cost:Infinity,
    geometricLength:Infinity
  };
  return {...core,digest:digest({...core,cost:'unreachable'})};
}

export function initializeNavigationAgent(
  component:NavigationAgentComponent,
  mesh:NavigationMesh,
  position:Vec3
):NavigationAgentRuntime{
  validateNavigationAgent(component,[mesh]);
  const runtime:NavigationAgentRuntime={
    target:null,
    path:null,
    waypointIndex:0,
    state:'idle',
    preferredVelocity:clone(ZERO),
    avoidanceVelocity:clone(ZERO),
    desiredVelocity:clone(ZERO),
    avoidanceNeighborIds:[],
    corridorConstrained:false,
    steeringReceipt:null,
    replanCount:0
  };
  if(component.initialTarget){
    return setNavigationTarget(component,runtime,mesh,position,component.initialTarget);
  }
  return runtime;
}

export function setNavigationTarget(
  component:NavigationAgentComponent,
  runtime:NavigationAgentRuntime,
  mesh:NavigationMesh,
  position:Vec3,
  target:Vec3
):NavigationAgentRuntime{
  finiteVec3(target,'target');
  const path=findNavigationPath(mesh,position,target);
  const next=clone(runtime);
  next.target=clone(target);
  next.path=path;
  next.waypointIndex=0;
  next.replanCount+=1;
  next.preferredVelocity=clone(ZERO);
  next.avoidanceVelocity=clone(ZERO);
  next.desiredVelocity=clone(ZERO);
  next.avoidanceNeighborIds=[];
  next.corridorConstrained=false;
  next.steeringReceipt=null;
  next.state=path.polygonIds.length?'moving':'blocked';
  return next;
}

export function clearNavigationTarget(runtime:NavigationAgentRuntime):NavigationAgentRuntime{
  const next=clone(runtime);
  next.target=null;
  next.path=null;
  next.waypointIndex=0;
  next.state='idle';
  next.preferredVelocity=clone(ZERO);
  next.avoidanceVelocity=clone(ZERO);
  next.desiredVelocity=clone(ZERO);
  next.avoidanceNeighborIds=[];
  next.corridorConstrained=false;
  next.steeringReceipt=null;
  return next;
}

export function stepNavigationAgent(
  component:NavigationAgentComponent,
  runtime:NavigationAgentRuntime,
  position:Vec3,
  dt:number,
  mesh?:NavigationMesh,
  avoidanceContext?:NavigationAvoidanceContext
):NavigationAgentRuntime{
  if(!Number.isFinite(dt) || dt<0) throw new Error('navigation_dt_invalid');
  const next=clone(runtime);
  next.preferredVelocity=clone(ZERO);
  next.avoidanceVelocity=clone(ZERO);
  next.desiredVelocity=clone(ZERO);
  next.avoidanceNeighborIds=[];
  next.corridorConstrained=false;
  next.steeringReceipt=null;

  if(next.state!=='moving' || !next.path || !next.target) return next;

  const stoppingDistance=component.stoppingDistance ?? .05;
  while(next.waypointIndex<next.path.waypoints.length){
    const waypoint=next.path.waypoints[next.waypointIndex];
    const remaining=distance(position,waypoint);
    if(remaining>stoppingDistance) break;
    next.waypointIndex+=1;
  }

  if(next.waypointIndex>=next.path.waypoints.length){
    next.state='arrived';
    return next;
  }

  const waypoint=next.path.waypoints[next.waypointIndex];
  const direction=normalizeXZ({
    x:waypoint.x-position.x,
    y:0,
    z:waypoint.z-position.z
  });
  const remaining=distance(position,waypoint);
  const speed=dt<=EPS?0:Math.min(component.maxSpeed,remaining/dt);
  const preferredVelocity={
    x:direction.x*speed,
    y:0,
    z:direction.z*speed
  };

  const steering=computeNavigationSteering({
    component,
    path:next.path,
    position,
    preferredVelocity,
    dt,
    mesh,
    context:avoidanceContext
  });

  next.preferredVelocity=steering.preferredVelocity;
  next.avoidanceVelocity=steering.avoidanceVelocity;
  next.desiredVelocity=steering.desiredVelocity;
  next.avoidanceNeighborIds=steering.neighborIds;
  next.corridorConstrained=steering.corridorConstrained;
  next.steeringReceipt=steering.receipt;
  return next;
}
