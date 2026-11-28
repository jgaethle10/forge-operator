// Spatial perception continuation: fuse supplied local poses and metric camera points.
// No pose estimation, model inference, persistent asset writes or physical authority.
export function fuseSpatialViews(views,{voxelSize=0.05,maxPoints=50000}={}){
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const vector=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const fail=reason=>{throw Error('spatial_fusion_'+reason);};
 if(!Array.isArray(views)||views.length<2||views.length>16)fail('view_budget');
 if(!finite(voxelSize)||voxelSize<0.005||voxelSize>5||!Number.isInteger(maxPoints)||maxPoints<1||maxPoints>50000)fail('invalid_limits');
 const ids=new Set(),cells=new Map();let inputCount=0;
 for(const view of views){
  if(!view||typeof view.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(view.id)||ids.has(view.id))fail('view_id');
  ids.add(view.id);
  if(view.schema!=='evercraft.spatial-perception.posed-points.v1'||view.depthKind!=='metric_camera_z'||view.coordinateFrame!=='camera_x_right_y_up_z_forward')fail('input_contract');
  if(!['synthetic','unverified_reference'].includes(view.evidenceKind)||view.georegistered!==false||view.poseVerified!==false||view.persistenceAuthorized!==false)fail('authority');
  if(view.sourceSha256!==null&&(typeof view.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(view.sourceSha256)))fail('source_digest');
  const r=view.pose?.rotation,t=view.pose?.translationM;
  if(!Array.isArray(r)||r.length!==3||!r.every(vector)||!vector(t)||t.some(x=>Math.abs(x)>10000))fail('invalid_pose');
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(dot(r[i],r[j])-(i===j?1:0))>1e-6)fail('nonrigid_pose');
  if(Math.abs(dot(r[0],cross(r[1],r[2]))-1)>1e-6)fail('reflected_pose');
  if(!Array.isArray(view.points)||view.points.length===0||inputCount+view.points.length>maxPoints)fail('point_budget');
  inputCount+=view.points.length;
  for(const p of view.points){
   if(!vector(p)||p[2]<=0||p.some(x=>Math.abs(x)>10000))fail('invalid_point');
   const q=r.map((row,i)=>dot(row,p)+t[i]);
   const k=q.map(x=>Math.floor(x/voxelSize)).join(',');
   let cell=cells.get(k);if(!cell){cell=new Map();cells.set(k,cell);}
   let v=cell.get(view.id);if(!v){v={sum:[0,0,0],count:0};cell.set(view.id,v);}
   for(let i=0;i<3;i++)v.sum[i]+=q[i];v.count++;
  }
 }
 const points=[...cells.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([voxel,perView])=>{
  const entries=[...perView.entries()].sort(([a],[b])=>a.localeCompare(b));
  const xyz=[0,0,0];let samples=0;
  for(const [,v] of entries){for(let i=0;i<3;i++)xyz[i]+=v.sum[i]/v.count/entries.length;samples+=v.count;}
  return {voxel,positionM:xyz,sourceViewIds:entries.map(([id])=>id),supportViews:entries.length,samples};
 });
 return {schema:'evercraft.spatial-perception.fusion-preview.v1',coordinateFrame:'supplied_local_pose_frame',voxelSizeM:voxelSize,inputCount,viewCount:views.length,pointCount:points.length,multiViewVoxelCount:points.filter(p=>p.supportViews>1).length,points,
  sourceViews:views.map(v=>({id:v.id,sourceSha256:v.sourceSha256,evidenceKind:v.evidenceKind})).sort((a,b)=>a.id.localeCompare(b.id)),
  poseVerified:false,sourceMediaVerified:false,metricAccuracyVerified:false,geometryReconstructed:false,georegistered:false,collisionAuthority:false,persistenceAuthorized:false,reviewRequired:true};
}
