import crypto from 'node:crypto';
import type { Vec3 } from './engine.js';
import type {
  NavigationAgentComponent,
  NavigationMesh,
  NavigationPath,
  NavigationPolygon
} from './navigation.js';

export interface NavigationCorridorPortal {
  fromPolygonId:string;
  toPolygonId:string;
  left:Vec3;
  right:Vec3;
}

export interface NavigationObstacleObservation {
  id:string;
  position:Vec3;
  velocity:Vec3;
  radius:number;
  verticalRadius:number;
}

export interface NavigationAvoidanceContext {
  selfId:string;
  selfRadius:number;
  selfVerticalRadius:number;
  obstacles:NavigationObstacleObservation[];
}

export interface NavigationSteeringReceipt {
  schema:'evercraft.world-engine.navigation-steering.v1';
  preferredVelocity:Vec3;
  avoidanceVelocity:Vec3;
  desiredVelocity:Vec3;
  neighborIds:string[];
  corridorConstrained:boolean;
  digest:string;
}

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
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function round(value:number){
  return Number(value.toFixed(12));
}

function roundVec(value:Vec3):Vec3{
  return {
    x:round(value.x),
    y:round(value.y),
    z:round(value.z)
  };
}

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}

function sub(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function scale(a:Vec3,n:number):Vec3{
  return {x:a.x*n,y:a.y*n,z:a.z*n};
}

function dotXZ(a:Vec3,b:Vec3){
  return a.x*b.x+a.z*b.z;
}

function lengthXZ(value:Vec3){
  return Math.sqrt(value.x*value.x+value.z*value.z);
}

function normalizeXZ(value:Vec3){
  const length=lengthXZ(value);
  if(length<=EPS) return {x:0,y:0,z:0};
  return {x:value.x/length,y:0,z:value.z/length};
}

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function clampMagnitudeXZ(value:Vec3,max:number){
  const length=lengthXZ(value);
  if(length<=max || length<=EPS) return {x:value.x,y:0,z:value.z};
  return {x:value.x*max/length,y:0,z:value.z*max/length};
}

function samePoint(a:Vec3,b:Vec3){
  return Math.abs(a.x-b.x)<=EPS
    && Math.abs(a.y-b.y)<=EPS
    && Math.abs(a.z-b.z)<=EPS;
}

function pointKey(point:Vec3){
  return [point.x,point.y,point.z]
    .map(value=>Number(value.toFixed(9)))
    .join(',');
}

function edgeKey(a:Vec3,b:Vec3){
  return [pointKey(a),pointKey(b)].sort().join('|');
}

function centroid(polygon:NavigationPolygon):Vec3{
  const n=polygon.vertices.length;
  const total=polygon.vertices.reduce(
    (sum,vertex)=>({
      x:sum.x+vertex.x,
      y:sum.y+vertex.y,
      z:sum.z+vertex.z
    }),
    {x:0,y:0,z:0}
  );
  return {x:total.x/n,y:total.y/n,z:total.z/n};
}

function sharedEdges(a:NavigationPolygon,b:NavigationPolygon){
  const edges:Array<[Vec3,Vec3]>=[];

  for(let ai=0;ai<a.vertices.length;ai++){
    const a0=a.vertices[ai];
    const a1=a.vertices[(ai+1)%a.vertices.length];
    for(let bi=0;bi<b.vertices.length;bi++){
      const b0=b.vertices[bi];
      const b1=b.vertices[(bi+1)%b.vertices.length];
      const sameDirection=samePoint(a0,b0)&&samePoint(a1,b1);
      const reverseDirection=samePoint(a0,b1)&&samePoint(a1,b0);
      if(sameDirection||reverseDirection){
        edges.push([clone(a0),clone(a1)]);
      }
    }
  }

  const unique=new Map<string,[Vec3,Vec3]>();
  for(const edge of edges){
    unique.set(edgeKey(edge[0],edge[1]),edge);
  }
  return [...unique.values()]
    .sort((left,right)=>edgeKey(left[0],left[1]).localeCompare(edgeKey(right[0],right[1])));
}

function orientPortal(
  from:NavigationPolygon,
  to:NavigationPolygon,
  edge:[Vec3,Vec3]
):{left:Vec3;right:Vec3}{
  const fromCenter=centroid(from);
  const toCenter=centroid(to);
  const direction=sub(toCenter,fromCenter);
  const midpoint=scale(add(edge[0],edge[1]),.5);

  const side=(point:Vec3)=>
    direction.x*(point.z-midpoint.z)
    - direction.z*(point.x-midpoint.x);

  const firstSide=side(edge[0]);
  const secondSide=side(edge[1]);

  if(Math.abs(firstSide-secondSide)<=EPS){
    const ordered=[clone(edge[0]),clone(edge[1])]
      .sort((a,b)=>pointKey(a).localeCompare(pointKey(b)));
    return {left:ordered[0],right:ordered[1]};
  }

  // Funnel signed-area convention on the XZ plane treats the
  // lower side value as the left portal endpoint.
  return firstSide<secondSide
    ? {left:clone(edge[0]),right:clone(edge[1])}
    : {left:clone(edge[1]),right:clone(edge[0])};
}

export function portalBetweenPolygons(
  from:NavigationPolygon,
  to:NavigationPolygon
):NavigationCorridorPortal{
  const edges=sharedEdges(from,to);
  if(!edges.length){
    throw new Error(
      `navigation_polygon_neighbor_portal_missing:${from.id}:${to.id}`
    );
  }
  if(edges.length>1){
    throw new Error(
      `navigation_polygon_neighbor_portal_ambiguous:${from.id}:${to.id}`
    );
  }
  const oriented=orientPortal(from,to,edges[0]);
  return {
    fromPolygonId:from.id,
    toPolygonId:to.id,
    left:oriented.left,
    right:oriented.right
  };
}

export function validateNavigationPortals(mesh:NavigationMesh){
  const byId=new Map(mesh.polygons.map(polygon=>[polygon.id,polygon]));
  const pairs=new Set<string>();

  for(const polygon of [...mesh.polygons].sort((a,b)=>a.id.localeCompare(b.id))){
    for(const neighborId of [...new Set(polygon.neighbors||[])].sort()){
      const pair=[polygon.id,neighborId].sort().join('|');
      if(pairs.has(pair)) continue;
      pairs.add(pair);
      const neighbor=byId.get(neighborId);
      if(!neighbor) continue;
      portalBetweenPolygons(polygon,neighbor);
    }
  }
  return true;
}

function triArea2(a:Vec3,b:Vec3,c:Vec3){
  return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
}

function funnelWaypoints(
  start:Vec3,
  goal:Vec3,
  corridor:NavigationCorridorPortal[]
){
  if(!corridor.length) return [clone(goal)];

  const portals=[
    {left:clone(start),right:clone(start)},
    ...corridor.map(portal=>({
      left:clone(portal.left),
      right:clone(portal.right)
    })),
    {left:clone(goal),right:clone(goal)}
  ];

  const points:Vec3[]=[];
  let apex=clone(start);
  let left=clone(start);
  let right=clone(start);
  let apexIndex=0;
  let leftIndex=0;
  let rightIndex=0;

  for(let index=1;index<portals.length;index++){
    const nextLeft=portals[index].left;
    const nextRight=portals[index].right;

    if(triArea2(apex,right,nextRight)<=EPS){
      if(samePoint(apex,right) || triArea2(apex,left,nextRight)>EPS){
        right=clone(nextRight);
        rightIndex=index;
      }else{
        points.push(clone(left));
        apex=clone(left);
        apexIndex=leftIndex;
        left=clone(apex);
        right=clone(apex);
        leftIndex=apexIndex;
        rightIndex=apexIndex;
        index=apexIndex;
        continue;
      }
    }

    if(triArea2(apex,left,nextLeft)>=-EPS){
      if(samePoint(apex,left) || triArea2(apex,right,nextLeft)<-EPS){
        left=clone(nextLeft);
        leftIndex=index;
      }else{
        points.push(clone(right));
        apex=clone(right);
        apexIndex=rightIndex;
        left=clone(apex);
        right=clone(apex);
        leftIndex=apexIndex;
        rightIndex=apexIndex;
        index=apexIndex;
        continue;
      }
    }
  }

  if(!points.length || !samePoint(points[points.length-1],goal)){
    points.push(clone(goal));
  }

  return points;
}

export function buildNavigationCorridor(
  mesh:NavigationMesh,
  polygonIds:string[],
  start:Vec3,
  goal:Vec3
){
  const byId=new Map(mesh.polygons.map(polygon=>[polygon.id,polygon]));
  const corridor:NavigationCorridorPortal[]=[];

  for(let index=0;index<polygonIds.length-1;index++){
    const from=byId.get(polygonIds[index]);
    const to=byId.get(polygonIds[index+1]);
    if(!from || !to){
      throw new Error(
        `navigation_corridor_polygon_missing:${polygonIds[index]}:${polygonIds[index+1]}`
      );
    }
    corridor.push(portalBetweenPolygons(from,to));
  }

  return {
    portals:corridor,
    waypoints:funnelWaypoints(start,goal,corridor)
  };
}

function pointOnSegmentXZ(point:Vec3,a:Vec3,b:Vec3){
  const ab={x:b.x-a.x,y:0,z:b.z-a.z};
  const ap={x:point.x-a.x,y:0,z:point.z-a.z};
  const cross=ab.x*ap.z-ab.z*ap.x;
  if(Math.abs(cross)>1e-8) return false;
  const projection=dotXZ(ap,ab);
  if(projection<-EPS) return false;
  const lengthSq=dotXZ(ab,ab);
  return projection<=lengthSq+EPS;
}

function pointInOrOnPolygonXZ(point:Vec3,vertices:Vec3[]){
  for(let index=0;index<vertices.length;index++){
    if(pointOnSegmentXZ(
      point,
      vertices[index],
      vertices[(index+1)%vertices.length]
    )) return true;
  }

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

function candidateInsideCorridor(
  mesh:NavigationMesh|undefined,
  path:NavigationPath,
  candidate:Vec3
){
  if(!mesh) return true;
  const allowed=new Set(path.polygonIds);
  return mesh.polygons
    .filter(polygon=>allowed.has(polygon.id))
    .some(polygon=>pointInOrOnPolygonXZ(candidate,polygon.vertices));
}

export function computeNavigationSteering(input:{
  component:NavigationAgentComponent;
  path:NavigationPath;
  position:Vec3;
  preferredVelocity:Vec3;
  dt:number;
  mesh?:NavigationMesh;
  context?:NavigationAvoidanceContext;
}){
  const {
    component,
    path,
    position,
    dt,
    mesh,
    context
  }=input;
  const preferred=clampMagnitudeXZ(
    input.preferredVelocity,
    component.maxSpeed
  );
  const enabled=component.avoidanceEnabled!==false;
  const lookahead=component.avoidanceTimeHorizonSec ?? 1.5;
  const clearance=component.avoidanceClearance ?? .1;
  const neighborDistance=component.avoidanceNeighborDistance ?? 4;
  const strength=component.avoidanceStrength ?? 1;

  let correction={x:0,y:0,z:0};
  const neighborIds:string[]=[];

  if(enabled && context && lengthXZ(preferred)>EPS){
    const selfRadius=Math.max(0,context.selfRadius);
    const selfVertical=Math.max(0,context.selfVerticalRadius);

    for(const obstacle of [...context.obstacles]
      .filter(obstacle=>obstacle.id!==context.selfId)
      .sort((a,b)=>a.id.localeCompare(b.id))){
      const relative=sub(obstacle.position,position);
      const verticalDistance=Math.abs(relative.y);
      if(
        verticalDistance >
        selfVertical+Math.max(0,obstacle.verticalRadius)+clearance
      ) continue;

      const currentDistance=lengthXZ(relative);
      const combinedRadius=
        selfRadius+Math.max(0,obstacle.radius)+clearance;
      if(currentDistance>neighborDistance+combinedRadius) continue;

      const relativeVelocity={
        x:obstacle.velocity.x-preferred.x,
        y:0,
        z:obstacle.velocity.z-preferred.z
      };
      const relativeSpeedSq=dotXZ(relativeVelocity,relativeVelocity);
      const closestTime=relativeSpeedSq>EPS
        ? clamp(
            -dotXZ(relative,relativeVelocity)/relativeSpeedSq,
            0,
            lookahead
          )
        : 0;
      const closest={
        x:relative.x+relativeVelocity.x*closestTime,
        y:0,
        z:relative.z+relativeVelocity.z*closestTime
      };
      const closestDistance=lengthXZ(closest);

      if(
        currentDistance>combinedRadius &&
        closestDistance>=combinedRadius
      ) continue;

      let away:Vec3;
      if(closestDistance>EPS){
        away=scale(normalizeXZ(closest),-1);
      }else if(currentDistance>EPS){
        const lateral=normalizeXZ({
          x:-relative.z,
          y:0,
          z:relative.x
        });
        away=lengthXZ(lateral)>EPS
          ? lateral
          : {x:1,y:0,z:0};
      }else{
        away=context.selfId.localeCompare(obstacle.id)<=0
          ? {x:1,y:0,z:0}
          : {x:-1,y:0,z:0};
      }

      const overlapUrgency=1-clamp(
        closestDistance/Math.max(combinedRadius,EPS),
        0,
        1
      );
      const timeUrgency=1-.5*clamp(
        closestTime/Math.max(lookahead,EPS),
        0,
        1
      );
      const magnitude=
        component.maxSpeed*strength*overlapUrgency*timeUrgency;
      correction=add(correction,scale(away,magnitude));
      neighborIds.push(obstacle.id);
    }
  }

  const unconstrained=clampMagnitudeXZ(
    add(preferred,correction),
    component.maxSpeed
  );

  let desired=unconstrained;
  let corridorConstrained=false;

  if(mesh && dt>EPS && path.polygonIds.length){
    const delta=sub(unconstrained,preferred);
    const scales=[1,.75,.5,.25,0];
    let chosen:Vec3|null=null;
    for(const factor of scales){
      const candidateVelocity=clampMagnitudeXZ(
        add(preferred,scale(delta,factor)),
        component.maxSpeed
      );
      const candidatePosition=add(
        position,
        scale(candidateVelocity,dt)
      );
      if(candidateInsideCorridor(mesh,path,candidatePosition)){
        chosen=candidateVelocity;
        corridorConstrained=factor<1;
        break;
      }
    }
    desired=chosen || preferred;
    if(!chosen) corridorConstrained=true;
  }

  const avoidance=sub(desired,preferred);
  const core={
    schema:'evercraft.world-engine.navigation-steering.v1' as const,
    preferredVelocity:roundVec(preferred),
    avoidanceVelocity:roundVec(avoidance),
    desiredVelocity:roundVec(desired),
    neighborIds:[...new Set(neighborIds)].sort(),
    corridorConstrained
  };

  return {
    preferredVelocity:core.preferredVelocity,
    avoidanceVelocity:core.avoidanceVelocity,
    desiredVelocity:core.desiredVelocity,
    neighborIds:core.neighborIds,
    corridorConstrained,
    receipt:{...core,digest:digest(core)} as NavigationSteeringReceipt
  };
}

export function verifyNavigationSteeringReceipt(
  receipt:NavigationSteeringReceipt
){
  if(receipt?.schema!=='evercraft.world-engine.navigation-steering.v1'){
    return false;
  }
  const {digest:claimed,...core}=receipt;
  return typeof claimed==='string' && claimed===digest(core);
}
