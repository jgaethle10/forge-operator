// Pure Evercraft-owned walking camera and scene projection for Becoming Worlds.
// No private check-in dates/goals, networking, tracking, or model inference.
import {worldSummary,WORLD_CATALOG} from './world-engine.mjs';
export const WALK_SCHEMA='evercraft.becoming.walkable-campus.v1';
export const UNIT=36;
const MODE_SET=new Set(Object.keys(WORLD_CATALOG));
const SIZE=Object.freeze({
  stadium:[18,14],arena:[15,13],'practice-field':[17,10],
  grandstand:[12,9],'training-gym':[8,7],'locker-room':[8,6],
  'recovery-center':[9,8],academy:[10,8],'trophy-hall':[10,8],
  'second-campus':[14,12],'concert-hall':[14,12],'opera-house':[17,13],
  amphitheater:[15,12],'rehearsal-room':[7,6],'light-studio':[8,7],
  'strings-hall':[8,7],'percussion-house':[8,7],
  'recording-campus':[12,10],'orchestra-school':[10,8],
  'second-venue':[15,13],default:[7,6]
});
const safeNum=n=>Number.isFinite(n)?n:0;
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function footprint(kind){return SIZE[kind]||SIZE.default;}
export function walkableScene(state,goal,mode){
  if(!MODE_SET.has(mode))throw Error('Unknown world mode');
  const s=worldSummary(state,goal,mode);
  return {
    schema:WALK_SCHEMA,mode,
    radius:Math.max(100,Math.min(s.radius*UNIT+18,12000)),
    buildings:s.buildings.map(b=>({
      id:b.id,kind:b.kind,level:b.level,
      name:WORLD_CATALOG[mode].find(k=>k.kind===b.kind)?.name||'Facility',
      x:b.x*UNIT,z:b.y*UNIT,
      halfWidth:footprint(b.kind)[0],halfDepth:footprint(b.kind)[1]
    }))
  };
}
export function spawnExplorer(scene=null){
  const first=scene?.buildings?.[0];
  if(first){
    const x=first.x-first.halfWidth-18;
    const z=first.z+first.halfDepth+27;
    if(canEnter(scene,x,z)){
      return {x,y:1.75,z,yaw:Math.atan2(first.x-x,z-first.z),pitch:-.09};
    }
  }
  return {x:0,y:1.75,z:18,yaw:0,pitch:-.06};
}
export function canEnter(scene,x,z){
  if(!scene||!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(Math.abs(x)>scene.radius||Math.abs(z)>scene.radius)return false;
  const margin=1.25;
  return !scene.buildings.some(b=>Math.abs(x-b.x)<b.halfWidth+margin&&Math.abs(z-b.z)<b.halfDepth+margin);
}
export function updateExplorer(scene,position,control,dt){
  const p={...position};
  const time=clamp(safeNum(dt),0,.1);
  const turn=clamp(safeNum(control.turn),-50,50);
  const tilt=clamp(safeNum(control.tilt),-50,50);
  p.yaw=safeNum(p.yaw)+turn;
  p.pitch=clamp(safeNum(p.pitch)+tilt,-1.34,1.34);
  p.y=1.75;
  const forward=clamp(safeNum(control.forward),-1,1);
  const strafe=clamp(safeNum(control.strafe),-1,1);
  const length=Math.max(1,Math.hypot(forward,strafe));
  const speed=control.run?11.5:7.2;
  const dx=(Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)/length*speed*time;
  const dz=(-Math.cos(p.yaw)*forward+Math.sin(p.yaw)*strafe)/length*speed*time;
  if(canEnter(scene,p.x+dx,p.z))p.x+=dx;
  if(canEnter(scene,p.x,p.z+dz))p.z+=dz;
  return p;
}
export function nearestFacility(scene,x,z,maxDistance=25){
  let best=null,dist=maxDistance;
  for(const b of scene.buildings){
    const edgeX=Math.max(0,Math.abs(b.x-x)-b.halfWidth);
    const edgeZ=Math.max(0,Math.abs(b.z-z)-b.halfDepth);
    const d=Math.hypot(edgeX,edgeZ);
    if(d<dist){best=b;dist=d;}
  }
  return best?{id:best.id,name:best.name,kind:best.kind,level:best.level,distance:Math.round(dist)}:null;
}
