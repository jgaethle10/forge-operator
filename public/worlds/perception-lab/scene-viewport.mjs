/**
 * Evercraft Spatial Perception: point-cloud preview, not a reconstructed mesh.
 * View is local to the camera coordinate frame. No geolocation is implied.
 */
import {SPATIAL_SCHEMA} from '../spatial-perception.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function pointCloudFromDepth(depth,{maxPoints=4500,maxRangeM=60}={}){
 if(depth?.schema!==SPATIAL_SCHEMA||!Array.isArray(depth.points)||
   !finite(depth.calibration?.fxPx)||depth.calibration.fxPx<=0)
   throw Error('spatial_view_invalid_depth');
 if(!Number.isInteger(maxPoints)||maxPoints<1||maxPoints>10000||
   !finite(maxRangeM)||maxRangeM<=0||maxRangeM>10000)
   throw Error('spatial_view_invalid_limits');
 const samples=depth.points,skip=Math.max(1,Math.ceil(samples.length/maxPoints));
 const fx=depth.calibration.fxPx,cx=(depth.width-1)/2,cy=(depth.height-1)/2;
 const result=[];
 for(let i=0;i<samples.length;i+=skip){
  const p=samples[i],z=p.depthM;
  if(!finite(z)||z<=0||z>maxRangeM)continue;
  result.push({
   x:((p.x-cx)*z)/fx,
   y:((cy-p.y)*z)/fx,
   z,confidence:finite(p.matchConfidence)?clamp(p.matchConfidence,0,1):null
  });
 }
 return result;
}
export function projectCameraPoint(point,{width=760,height=380,yawDeg=0,pitchDeg=27,
 scalePxPerM=16}={}){
 if(![point.x,point.y,point.z,width,height,yawDeg,pitchDeg,scalePxPerM].every(finite))
   throw Error('spatial_view_nonfinite');
 if(width<=0||height<=0||scalePxPerM<=0)throw Error('spatial_view_dimensions');
 const yaw=yawDeg*Math.PI/180,pitch=pitchDeg*Math.PI/180;
 const x=point.x*Math.cos(yaw)-point.z*Math.sin(yaw);
 const z=point.x*Math.sin(yaw)+point.z*Math.cos(yaw);
 const up=point.y*Math.cos(pitch)+z*Math.sin(pitch);
 return {x:width/2+x*scalePxPerM,y:height*.78-up*scalePxPerM};
}
export function drawPointCloud(canvas,depth,{yawDeg=0}={}){
 const context=canvas.getContext('2d');
 if(!context)throw Error('spatial_view_context_unavailable');
 const w=canvas.width,h=canvas.height;
 context.clearRect(0,0,w,h);
 context.fillStyle='#0c1525';context.fillRect(0,0,w,h);
 const points=pointCloudFromDepth(depth);
 const zValues=points.map(p=>p.z).sort((a,b)=>a-b);
 const p95=zValues.length?zValues[Math.floor((zValues.length-1)*.95)]:5;
 const range=Math.max(5,Math.min(60,p95*1.8));
 const scale=Math.min(w/Math.max(12,range*1.6),h/Math.max(8,range*.95));
 const settings={width:w,height:h,yawDeg,pitchDeg:27,scalePxPerM:scale};
 context.lineWidth=1;context.strokeStyle='#283851';
 // Reference grid represents camera-local coordinates, NOT inferred terrain.
 for(let x=-10;x<=10;x+=2){
  const a=projectCameraPoint({x,y:0,z:0},settings);
  const b=projectCameraPoint({x,y:0,z:Math.min(30,range)},settings);
  context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
 }
 for(let z=0;z<=Math.min(30,range);z+=2){
  const a=projectCameraPoint({x:-10,y:0,z},settings);
  const b=projectCameraPoint({x:10,y:0,z},settings);
  context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
 }
 points.sort((a,b)=>b.z-a.z);
 for(const p of points){
  const v=projectCameraPoint(p,settings);
  if(v.x<-3||v.x>w+3||v.y<-3||v.y>h+3)continue;
  const hue=Math.round(195-clamp(p.z/range,0,1)*180);
  context.fillStyle='hsl('+hue+',86%,66%)';
  context.fillRect(v.x-1.3,v.y-1.3,2.6,2.6);
 }
 context.fillStyle='#bad1e8';context.font='12px system-ui';
 context.fillText('CAMERA-RELATIVE / UNVERIFIED',14,20);
 context.fillText(points.length+' provisional points',14,h-16);
 return {points:points.length,rangeShownM:range};
}
