export function snapWorldDelta(value:number,step:number){
  if(!Number.isFinite(value)) throw new Error('world_forge_snap_value_invalid');
  if(!Number.isFinite(step)||step<=0) throw new Error('world_forge_snap_step_invalid');
  const snapped=Math.round(value/step)*step;
  if(Math.abs(snapped)<1e-12) return 0;
  return Number(snapped.toFixed(9));
}

export function perspectiveVerticalFovRad(input:{
  focalLengthMm:number;
  sensorWidthMm:number;
  aspect:number;
}){
  if(!Number.isFinite(input.focalLengthMm)||input.focalLengthMm<=0){
    throw new Error('world_forge_camera_focal_length_invalid');
  }
  if(!Number.isFinite(input.sensorWidthMm)||input.sensorWidthMm<=0){
    throw new Error('world_forge_camera_sensor_width_invalid');
  }
  if(!Number.isFinite(input.aspect)||input.aspect<=0){
    throw new Error('world_forge_camera_aspect_invalid');
  }
  const sensorHeight=input.sensorWidthMm/input.aspect;
  return 2*Math.atan(sensorHeight/(2*input.focalLengthMm));
}

export function frameDistanceForScale(input:{
  scale:{x:number;y:number;z:number};
  verticalFovRad:number;
  padding?:number;
}){
  const maxScale=Math.max(
    Math.abs(input.scale.x),
    Math.abs(input.scale.y),
    Math.abs(input.scale.z),
    .01,
  );
  const radius=maxScale*Math.sqrt(3)/2;
  const padding=Math.max(1,input.padding??1.45);
  const halfFov=Math.max(.01,Math.min(Math.PI/2-.01,input.verticalFovRad/2));
  return Math.max(1,radius/Math.tan(halfFov)*padding);
}

export function axisDragWorldDelta(input:{
  pointerDx:number;
  pointerDy:number;
  axisScreenDx:number;
  axisScreenDy:number;
  axisWorldLength:number;
  snapStep:number;
}){
  const screenLength=Math.hypot(input.axisScreenDx,input.axisScreenDy);
  if(screenLength<4) throw new Error('world_forge_gizmo_axis_screen_degenerate');
  if(!Number.isFinite(input.axisWorldLength)||input.axisWorldLength<=0){
    throw new Error('world_forge_gizmo_axis_world_length_invalid');
  }
  const ux=input.axisScreenDx/screenLength;
  const uy=input.axisScreenDy/screenLength;
  const directionalPixels=input.pointerDx*ux+input.pointerDy*uy;
  const pixelsPerWorldUnit=screenLength/input.axisWorldLength;
  return snapWorldDelta(directionalPixels/pixelsPerWorldUnit,input.snapStep);
}

export type ViewportVec3={x:number;y:number;z:number};
export type ViewportRay={origin:ViewportVec3;direction:ViewportVec3};
export type RayPickCandidate={
  id:string;
  triangles:Array<[ViewportVec3,ViewportVec3,ViewportVec3]>;
};

export function invertViewportMatrix(matrix:ArrayLike<number>){
  if(matrix.length!==16) throw new Error('world_forge_view_matrix_invalid');
  const a00=matrix[0],a01=matrix[1],a02=matrix[2],a03=matrix[3];
  const a10=matrix[4],a11=matrix[5],a12=matrix[6],a13=matrix[7];
  const a20=matrix[8],a21=matrix[9],a22=matrix[10],a23=matrix[11];
  const a30=matrix[12],a31=matrix[13],a32=matrix[14],a33=matrix[15];

  const b00=a00*a11-a01*a10;
  const b01=a00*a12-a02*a10;
  const b02=a00*a13-a03*a10;
  const b03=a01*a12-a02*a11;
  const b04=a01*a13-a03*a11;
  const b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30;
  const b07=a20*a32-a22*a30;
  const b08=a20*a33-a23*a30;
  const b09=a21*a32-a22*a31;
  const b10=a21*a33-a23*a31;
  const b11=a22*a33-a23*a32;

  const det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!Number.isFinite(det)||Math.abs(det)<1e-12){
    throw new Error('world_forge_view_matrix_singular');
  }
  const invDet=1/det;
  return [
    (a11*b11-a12*b10+a13*b09)*invDet,
    (a02*b10-a01*b11-a03*b09)*invDet,
    (a31*b05-a32*b04+a33*b03)*invDet,
    (a22*b04-a21*b05-a23*b03)*invDet,
    (a12*b08-a10*b11-a13*b07)*invDet,
    (a00*b11-a02*b08+a03*b07)*invDet,
    (a32*b02-a30*b05-a33*b01)*invDet,
    (a20*b05-a22*b02+a23*b01)*invDet,
    (a10*b10-a11*b08+a13*b06)*invDet,
    (a01*b08-a00*b10-a03*b06)*invDet,
    (a30*b04-a31*b02+a33*b00)*invDet,
    (a21*b02-a20*b04-a23*b00)*invDet,
    (a11*b07-a10*b09-a12*b06)*invDet,
    (a00*b09-a01*b07+a02*b06)*invDet,
    (a31*b01-a30*b03-a32*b00)*invDet,
    (a20*b03-a21*b01+a22*b00)*invDet,
  ];
}

function transformClipPoint(
  matrix:ArrayLike<number>,
  x:number,
  y:number,
  z:number,
):ViewportVec3{
  const tx=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
  const ty=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
  const tz=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
  const tw=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
  if(!Number.isFinite(tw)||Math.abs(tw)<1e-12){
    throw new Error('world_forge_view_unproject_invalid');
  }
  return {x:tx/tw,y:ty/tw,z:tz/tw};
}

export function viewportRayFromNdc(input:{
  ndcX:number;
  ndcY:number;
  inverseViewProjection:ArrayLike<number>;
}):ViewportRay{
  if(!Number.isFinite(input.ndcX)||!Number.isFinite(input.ndcY)){
    throw new Error('world_forge_view_ndc_invalid');
  }
  const near=transformClipPoint(input.inverseViewProjection,input.ndcX,input.ndcY,-1);
  const far=transformClipPoint(input.inverseViewProjection,input.ndcX,input.ndcY,1);
  const dx=far.x-near.x;
  const dy=far.y-near.y;
  const dz=far.z-near.z;
  const length=Math.hypot(dx,dy,dz);
  if(!Number.isFinite(length)||length<1e-12){
    throw new Error('world_forge_view_ray_degenerate');
  }
  return {
    origin:near,
    direction:{x:dx/length,y:dy/length,z:dz/length},
  };
}

export function rayTriangleDistance(
  ray:ViewportRay,
  a:ViewportVec3,
  b:ViewportVec3,
  c:ViewportVec3,
){
  const edge1={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  const edge2={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  const p={
    x:ray.direction.y*edge2.z-ray.direction.z*edge2.y,
    y:ray.direction.z*edge2.x-ray.direction.x*edge2.z,
    z:ray.direction.x*edge2.y-ray.direction.y*edge2.x,
  };
  const det=edge1.x*p.x+edge1.y*p.y+edge1.z*p.z;
  if(Math.abs(det)<1e-9) return null;
  const invDet=1/det;
  const tvec={
    x:ray.origin.x-a.x,
    y:ray.origin.y-a.y,
    z:ray.origin.z-a.z,
  };
  const u=(tvec.x*p.x+tvec.y*p.y+tvec.z*p.z)*invDet;
  if(u<0||u>1) return null;
  const q={
    x:tvec.y*edge1.z-tvec.z*edge1.y,
    y:tvec.z*edge1.x-tvec.x*edge1.z,
    z:tvec.x*edge1.y-tvec.y*edge1.x,
  };
  const v=(ray.direction.x*q.x+ray.direction.y*q.y+ray.direction.z*q.z)*invDet;
  if(v<0||u+v>1) return null;
  const distance=(edge2.x*q.x+edge2.y*q.y+edge2.z*q.z)*invDet;
  return distance>=0?distance:null;
}

export function pickClosestRayHit(ray:ViewportRay,candidates:RayPickCandidate[]){
  let best:{id:string;distance:number}|null=null;
  for(const candidate of candidates){
    for(const triangle of candidate.triangles){
      const distance=rayTriangleDistance(ray,triangle[0],triangle[1],triangle[2]);
      if(distance===null) continue;
      if(!best||distance<best.distance){
        best={id:candidate.id,distance};
      }
    }
  }
  return best;
}

