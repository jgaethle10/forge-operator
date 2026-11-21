// Becoming Worlds: private, deterministic indoor spaces for user-owned facilities.
// No player check-ins, recovery status, network calls, or cloud publication.
export const ROOM_SCHEMA='evercraft.becoming.facility-interior.v1';
const TYPE_BY_KIND=Object.freeze({
  stadium:'clubhouse',arena:'clubhouse',grandstand:'clubhouse',amphitheater:'performance',
  'practice-field':'training','training-gym':'training','locker-room':'clubhouse',
  'recovery-center':'reflection',academy:'training','trophy-hall':'legacy',
  'second-campus':'training',
  'rehearsal-room':'performance','strings-hall':'performance','percussion-house':'performance',
  'light-studio':'performance','concert-hall':'performance','orchestra-school':'performance',
  'opera-house':'performance','recording-campus':'performance','second-venue':'performance',
  garden:'reflection',bridge:'reflection',cabin:'reflection',pond:'reflection',
  greenhouse:'reflection',grove:'reflection',library:'legacy',
  observatory:'legacy',village:'reflection','second-valley':'reflection'
});
export function roomForFacility(scene,facilityId){
  if(!scene||!Array.isArray(scene.buildings)||typeof facilityId!=='string')throw Error('Invalid campus selection');
  const b=scene.buildings.find(item=>item.id===facilityId);
  if(!b)throw Error('Facility not owned in this world');
  const type=TYPE_BY_KIND[b.kind]||'reflection';
  const halfWidth=Math.max(6,Math.min(14,b.halfWidth-.25));
  const halfDepth=Math.max(7,Math.min(16,b.halfDepth+2));
  const level=Math.max(1,Math.min(10000,Number(b.level)||1));
  const x=Math.max(3,halfWidth-2.3);
  const stations=type==='training'?
    [{kind:'training-rig',name:'Training stations',x:-x,z:-1.5},{kind:'recovery-bench',name:'Rest and recovery',x,z:-1.5},{kind:'progress-board',name:'Your journey',x:0,z:-halfDepth+1.6}]:
    type==='performance'?
    [{kind:'instrument-platform',name:'Rehearsal stage',x:0,z:-halfDepth+2.4},
     {kind:'mixing-console',name:'Sound and light desk',x:-x,z:0},
     {kind:'listening-nook',name:'Listening area',x,z:0}]:
    type==='legacy'?
    [{kind:'legacy-display',name:'Legacy gallery',x:0,z:-halfDepth+1.4},
     {kind:'memory-shelf',name:'Things worth keeping',x:-x,z:0},
     {kind:'reflection-chair',name:'Reflection corner',x,z:0}]:
    type==='clubhouse'?
    [{kind:'team-table',name:'Clubhouse table',x:0,z:-halfDepth+2.7},
     {kind:'locker-bank',name:'Team lockers',x:-x,z:0},
     {kind:'legacy-display',name:'Your history',x,z:0}]:
    [{kind:'garden-bed',name:'Indoor garden',x:-x,z:-1.5},
     {kind:'reflection-chair',name:'Quiet place',x,z:-1.5},
     {kind:'memory-shelf',name:'Memory wall',x:0,z:-halfDepth+1.6}];
  return {schema:ROOM_SCHEMA,facilityId:b.id,name:b.name,type,level,mode:scene.mode,
    halfWidth,halfDepth,ceiling:7.8,
    stations,entrance:{x:0,z:halfDepth-2.2},
    // A room is a view of one *owned* structure, not a separate reward/entitlement.
    noProgressWrite:true};
}
export function spawnInterior(room){
  if(!room||room.schema!==ROOM_SCHEMA)throw Error('Unknown room');
  return {x:room.entrance.x,y:1.75,z:room.entrance.z,yaw:0,pitch:-.04};
}
export function canWalkInterior(room,x,z){
  if(!room||room.schema!==ROOM_SCHEMA||!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(Math.abs(x)>room.halfWidth-1||Math.abs(z)>room.halfDepth-1)return false;
  // Preserve a central aisle and give furniture sensible clearance.
  return !room.stations.some(s=>{
    const halfX=s.kind==='instrument-platform'||s.kind==='team-table'?2.8:1.2;
    const halfZ=s.kind==='instrument-platform'||s.kind==='team-table'?1.4:.95;
    // Wall-mounted displays are not floor obstacles.
    if(['legacy-display','memory-shelf','progress-board'].includes(s.kind))return false;
    return Math.abs(x-s.x)<halfX+.6&&Math.abs(z-s.z)<halfZ+.6;
  });
}
export function stepInterior(room,position,controls={},dt=0){
  const p={...position},time=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  p.yaw=(Number.isFinite(p.yaw)?p.yaw:0)+clamp(Number.isFinite(controls.turn)?controls.turn:0,-50,50);
  p.pitch=clamp((Number.isFinite(p.pitch)?p.pitch:0)+clamp(Number.isFinite(controls.tilt)?controls.tilt:0,-50,50),-1.3,1.3);
  p.y=1.75;
  const forward=clamp(Number.isFinite(controls.forward)?controls.forward:0,-1,1);
  const strafe=clamp(Number.isFinite(controls.strafe)?controls.strafe:0,-1,1);
  const length=Math.max(1,Math.hypot(forward,strafe));
  const speed=controls.run?7.2:4.6;
  const dx=(Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)*speed*time/length;
  const dz=(-Math.cos(p.yaw)*forward+Math.sin(p.yaw)*strafe)*speed*time/length;
  if(canWalkInterior(room,p.x+dx,p.z))p.x+=dx;
  if(canWalkInterior(room,p.x,p.z+dz))p.z+=dz;
  return p;
}
