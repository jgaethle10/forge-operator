import type { RuntimeEntity, Vec3 } from './engine.js';

export interface CollisionContact {
  aId:string;
  bId:string;
  normal:Vec3;
  penetration:number;
  kind:'sphere_sphere'|'box_box'|'sphere_box';
}

interface Aabb {
  min:Vec3;
  max:Vec3;
}

const EPS=1e-12;

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}

function sub(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function scale(a:Vec3,n:number):Vec3{
  return {x:a.x*n,y:a.y*n,z:a.z*n};
}

function dot(a:Vec3,b:Vec3){
  return a.x*b.x+a.y*b.y+a.z*b.z;
}

function length(a:Vec3){
  return Math.sqrt(dot(a,a));
}

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function scale3(entity:RuntimeEntity){
  const s=entity.transform.scale || {x:1,y:1,z:1};
  return {x:Math.abs(s.x),y:Math.abs(s.y),z:Math.abs(s.z)};
}

function sphereRadius(entity:RuntimeEntity){
  if(entity.collider?.type!=='sphere') return 0;
  const s=scale3(entity);
  return entity.collider.radius*Math.max(s.x,s.y,s.z);
}

function boxHalfExtents(entity:RuntimeEntity){
  if(entity.collider?.type!=='box') return {x:0,y:0,z:0};
  const s=scale3(entity);
  return {
    x:entity.collider.halfExtents.x*s.x,
    y:entity.collider.halfExtents.y*s.y,
    z:entity.collider.halfExtents.z*s.z
  };
}

function aabbFor(entity:RuntimeEntity):Aabb|null{
  if(!entity.collider) return null;
  const p=entity.transform.position;
  if(entity.collider.type==='sphere'){
    const r=sphereRadius(entity);
    return {
      min:{x:p.x-r,y:p.y-r,z:p.z-r},
      max:{x:p.x+r,y:p.y+r,z:p.z+r}
    };
  }
  const h=boxHalfExtents(entity);
  return {
    min:{x:p.x-h.x,y:p.y-h.y,z:p.z-h.z},
    max:{x:p.x+h.x,y:p.y+h.y,z:p.z+h.z}
  };
}

function overlaps(a:Aabb,b:Aabb){
  return a.min.x<=b.max.x && a.max.x>=b.min.x
    && a.min.y<=b.max.y && a.max.y>=b.min.y
    && a.min.z<=b.max.z && a.max.z>=b.min.z;
}

function inverseMass(entity:RuntimeEntity){
  const body=entity.rigidBody;
  if(!body || body.kinematic) return 0;
  return 1/body.mass;
}

function restitution(entity:RuntimeEntity){
  return clamp(entity.rigidBody?.restitution ?? 0,0,1);
}

function sphereSphere(a:RuntimeEntity,b:RuntimeEntity):CollisionContact|null{
  const delta=sub(b.transform.position,a.transform.position);
  const distance=length(delta);
  const radiusSum=sphereRadius(a)+sphereRadius(b);
  if(distance>=radiusSum) return null;
  const normal=distance>EPS
    ? scale(delta,1/distance)
    : (a.id.localeCompare(b.id)<=0?{x:1,y:0,z:0}:{x:-1,y:0,z:0});
  return {
    aId:a.id,
    bId:b.id,
    normal,
    penetration:radiusSum-distance,
    kind:'sphere_sphere'
  };
}

function boxBox(a:RuntimeEntity,b:RuntimeEntity):CollisionContact|null{
  const ap=a.transform.position;
  const bp=b.transform.position;
  const ah=boxHalfExtents(a);
  const bh=boxHalfExtents(b);
  const dx=(ah.x+bh.x)-Math.abs(bp.x-ap.x);
  const dy=(ah.y+bh.y)-Math.abs(bp.y-ap.y);
  const dz=(ah.z+bh.z)-Math.abs(bp.z-ap.z);
  if(dx<=0 || dy<=0 || dz<=0) return null;

  let penetration=dx;
  let normal:Vec3={x:bp.x>=ap.x?1:-1,y:0,z:0};
  if(dy<penetration){
    penetration=dy;
    normal={x:0,y:bp.y>=ap.y?1:-1,z:0};
  }
  if(dz<penetration){
    penetration=dz;
    normal={x:0,y:0,z:bp.z>=ap.z?1:-1};
  }

  return {aId:a.id,bId:b.id,normal,penetration,kind:'box_box'};
}

function sphereBox(sphere:RuntimeEntity,box:RuntimeEntity):CollisionContact|null{
  const center=sphere.transform.position;
  const bp=box.transform.position;
  const bh=boxHalfExtents(box);
  const min={x:bp.x-bh.x,y:bp.y-bh.y,z:bp.z-bh.z};
  const max={x:bp.x+bh.x,y:bp.y+bh.y,z:bp.z+bh.z};
  const closest={
    x:clamp(center.x,min.x,max.x),
    y:clamp(center.y,min.y,max.y),
    z:clamp(center.z,min.z,max.z)
  };
  const towardBox=sub(closest,center);
  const distance=length(towardBox);
  const radius=sphereRadius(sphere);

  if(distance>EPS){
    if(distance>=radius) return null;
    return {
      aId:sphere.id,
      bId:box.id,
      normal:scale(towardBox,1/distance),
      penetration:radius-distance,
      kind:'sphere_box'
    };
  }

  const faces=[
    {distance:center.x-min.x,normal:{x:1,y:0,z:0} as Vec3},
    {distance:max.x-center.x,normal:{x:-1,y:0,z:0} as Vec3},
    {distance:center.y-min.y,normal:{x:0,y:1,z:0} as Vec3},
    {distance:max.y-center.y,normal:{x:0,y:-1,z:0} as Vec3},
    {distance:center.z-min.z,normal:{x:0,y:0,z:1} as Vec3},
    {distance:max.z-center.z,normal:{x:0,y:0,z:-1} as Vec3}
  ].sort((a,b)=>a.distance-b.distance);

  return {
    aId:sphere.id,
    bId:box.id,
    normal:faces[0].normal,
    penetration:radius+faces[0].distance,
    kind:'sphere_box'
  };
}

function narrowPhase(a:RuntimeEntity,b:RuntimeEntity):CollisionContact|null{
  if(!a.collider || !b.collider) return null;
  if(a.collider.type==='sphere' && b.collider.type==='sphere') return sphereSphere(a,b);
  if(a.collider.type==='box' && b.collider.type==='box') return boxBox(a,b);
  if(a.collider.type==='sphere' && b.collider.type==='box') return sphereBox(a,b);

  const reversed=sphereBox(b,a);
  if(!reversed) return null;
  return {
    aId:a.id,
    bId:b.id,
    normal:scale(reversed.normal,-1),
    penetration:reversed.penetration,
    kind:'sphere_box'
  };
}

export function broadPhasePairs(entities:RuntimeEntity[]){
  const rows=entities
    .map(entity=>({entity,aabb:aabbFor(entity)}))
    .filter((row):row is {entity:RuntimeEntity;aabb:Aabb}=>Boolean(row.aabb))
    .sort((a,b)=>a.aabb.min.x-b.aabb.min.x || a.entity.id.localeCompare(b.entity.id));

  const pairs:Array<[RuntimeEntity,RuntimeEntity]>=[];
  for(let i=0;i<rows.length;i++){
    for(let j=i+1;j<rows.length;j++){
      if(rows[j].aabb.min.x>rows[i].aabb.max.x) break;
      if(!overlaps(rows[i].aabb,rows[j].aabb)) continue;
      const a=rows[i].entity.id.localeCompare(rows[j].entity.id)<=0?rows[i].entity:rows[j].entity;
      const b=a===rows[i].entity?rows[j].entity:rows[i].entity;
      pairs.push([a,b]);
    }
  }
  return pairs.sort(([a1,b1],[a2,b2])=>
    a1.id.localeCompare(a2.id) || b1.id.localeCompare(b2.id)
  );
}

function resolveContact(a:RuntimeEntity,b:RuntimeEntity,contact:CollisionContact){
  const invA=inverseMass(a);
  const invB=inverseMass(b);
  const invTotal=invA+invB;
  if(invTotal<=0) return;

  const correction=scale(contact.normal,contact.penetration/invTotal);
  if(invA>0){
    a.transform.position=sub(a.transform.position,scale(correction,invA));
  }
  if(invB>0){
    b.transform.position=add(b.transform.position,scale(correction,invB));
  }

  const va=a.rigidBody?.velocity || {x:0,y:0,z:0};
  const vb=b.rigidBody?.velocity || {x:0,y:0,z:0};
  const relativeVelocity=sub(vb,va);
  const velocityAlongNormal=dot(relativeVelocity,contact.normal);
  if(velocityAlongNormal>=0) return;

  const e=Math.min(restitution(a),restitution(b));
  const impulseMagnitude=-(1+e)*velocityAlongNormal/invTotal;
  const impulse=scale(contact.normal,impulseMagnitude);

  if(a.rigidBody && invA>0){
    a.rigidBody.velocity=sub(a.rigidBody.velocity,scale(impulse,invA));
  }
  if(b.rigidBody && invB>0){
    b.rigidBody.velocity=add(b.rigidBody.velocity,scale(impulse,invB));
  }
}

export function resolveEntityCollisions(entities:RuntimeEntity[]){
  const contacts:CollisionContact[]=[];
  for(const [a,b] of broadPhasePairs(entities)){
    const contact=narrowPhase(a,b);
    if(!contact) continue;
    contacts.push({
      ...contact,
      penetration:Number(contact.penetration.toFixed(12)),
      normal:{
        x:Number(contact.normal.x.toFixed(12)),
        y:Number(contact.normal.y.toFixed(12)),
        z:Number(contact.normal.z.toFixed(12))
      }
    });
    resolveContact(a,b,contact);
  }
  return contacts;
}
