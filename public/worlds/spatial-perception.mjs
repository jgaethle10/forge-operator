/**
 * Evercraft Spatial Perception V0. Deterministic stereo block matching.
 * Requires synchronized, rectified grayscale stereo; not monocular depth.
 * Camera coordinates: +X right, +Y up, +Z forward, in meters.
 */
export const SPATIAL_SCHEMA = 'evercraft.spatial-perception.frame.v0';
const finite = n => typeof n === 'number' && Number.isFinite(n);
const requireNumber = (n, lo, hi, key) => {
  if (!finite(n) || n < lo || n > hi) throw Error('spatial_invalid_' + key);
};
const median = a => {
  const v = [...a].sort((x,y) => x-y), m = Math.floor(v.length/2);
  return v.length%2 ? v[m] : (v[m-1]+v[m])/2;
};
const round = x => Math.round(x*1000)/1000;
const validPixels = (a, size, label) => {
  if (!a || a.length !== size) throw Error('spatial_invalid_' + label + '_pixels');
  for (let i=0; i<size; i++)
    if (!finite(a[i]) || a[i]<0 || a[i]>255) throw Error('spatial_invalid_' + label + '_sample');
};
export function estimateStereoDepth({
  left, right, width, height, fxPx, baselineM, minDisparity=1,
  maxDisparity=16, radius=2, stride=2, minUniqueness=0.12,
  minTexture=12, maxDepthM=250
}={}) {
  requireNumber(width,16,1024,'width');
  requireNumber(height,12,768,'height');
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw Error('spatial_integer_dimensions');
  validPixels(left,width*height,'left');
  validPixels(right,width*height,'right');
  requireNumber(fxPx,1,10000,'focal_length');
  requireNumber(baselineM,0.001,10,'baseline');
  requireNumber(minDisparity,1,256,'minimum_disparity');
  requireNumber(maxDisparity,minDisparity,256,'maximum_disparity');
  requireNumber(radius,1,5,'radius');
  requireNumber(stride,1,32,'stride');
  requireNumber(minUniqueness,0,1,'uniqueness');
  requireNumber(minTexture,0,255,'texture');
  requireNumber(maxDepthM,0.01,10000,'depth_ceiling');
  if (![minDisparity,maxDisparity,radius,stride].every(Number.isInteger))
    throw Error('spatial_integer_configuration');
  if (maxDisparity+radius>=width-radius) throw Error('spatial_disparity_exceeds_frame');
  const points=[];
  for (let y=radius; y<height-radius; y+=stride) {
    for (let x=maxDisparity+radius; x<width-radius; x+=stride) {
      const n=(2*radius+1)**2;
      let avg=0, variation=0;
      for (let dy=-radius; dy<=radius; dy++) for(let dx=-radius;dx<=radius;dx++)
        avg+=left[(y+dy)*width+x+dx];
      avg/=n;
      for (let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++)
        variation+=Math.abs(left[(y+dy)*width+x+dx]-avg);
      if (variation/n<minTexture) continue;
      let best=Infinity, next=Infinity, disparity=0;
      for (let d=minDisparity;d<=maxDisparity;d++) {
        let sad=0;
        for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius;dx<=radius;dx++)
          sad+=Math.abs(left[(y+dy)*width+x+dx]-right[(y+dy)*width+x+dx-d]);
        if (sad<best) {next=best;best=sad;disparity=d;}
        else if (sad<next) next=sad;
      }
      if (!finite(next) || next<=0) continue;
      const confidence=Math.max(0,(next-best)/next);
      if (confidence<minUniqueness) continue;
      const depth=fxPx*baselineM/disparity;
      if (depth>maxDepthM) continue;
      points.push({x,y,disparityPx:disparity,depthM:round(depth),matchConfidence:round(confidence)});
    }
  }
  return {schema:SPATIAL_SCHEMA,width,height,unit:'meters',
    input:'rectified_stereo_required',depthStatus:'estimated_not_verified',
    calibration:{fxPx,baselineM},points,sampleCount:points.length};
}
/* Detector boxes must be supplied by a separate, named model or human. */
export function fuseDetections(depth,{detections=[],frameId,timestampMs=0,
  sourceSha256=null,detector='unverified_external_detector'}={}) {
  if (depth?.schema!==SPATIAL_SCHEMA || !Array.isArray(depth.points))
    throw Error('spatial_invalid_depth');
  if (typeof frameId!=='string' || !frameId || frameId.length>128)
    throw Error('spatial_invalid_frame_id');
  requireNumber(timestampMs,0,1e15,'timestamp');
  if (!Array.isArray(detections) || detections.length>200)
    throw Error('spatial_invalid_detections');
  if (sourceSha256!==null && !/^[0-9a-f]{64}$/.test(sourceSha256))
    throw Error('spatial_invalid_source_digest');
  if (typeof detector!=='string' || !detector || detector.length>128)
    throw Error('spatial_invalid_detector');
  return detections.map((d,i)=>{
    const b=d?.box;
    if (!b || !['x','y','width','height'].every(k=>finite(b[k])))
      throw Error('spatial_invalid_box');
    if (b.x<0 || b.y<0 || b.width<=0 || b.height<=0 ||
      b.x+b.width>depth.width || b.y+b.height>depth.height)
      throw Error('spatial_box_out_of_bounds');
    if (typeof d.label!=='string' || !d.label.trim() || d.label.length>80)
      throw Error('spatial_invalid_label');
    requireNumber(d.confidence,0,1,'detector_confidence');
    const matches=depth.points.filter(p=>p.x>=b.x && p.x<b.x+b.width &&
      p.y>=b.y && p.y<b.y+b.height);
    const z=matches.length ? round(median(matches.map(p=>p.depthM))) : null;
    const u=b.x+b.width/2, v=b.y+b.height/2, fx=depth.calibration.fxPx;
    return {schema:'evercraft.spatial-perception.observation.v0',
      id:frameId+':'+i,frameId,timestampMs,sourceSha256,detector,
      label:d.label,detectorConfidence:d.confidence,box:{...b},
      sampleCount:matches.length,depthEstimateM:z,
      depthStatus:z===null?'unknown':'estimated_not_verified',
      matchConfidence:matches.length?round(median(matches.map(p=>p.matchConfidence))):null,
      cameraPositionM:z===null?null:{
        x:round((u-(depth.width-1)/2)*z/fx),
        y:round(((depth.height-1)/2-v)*z/fx),z
      },coordinateFrame:'camera_relative',georegistered:false,
      evidenceType:'inferred_from_stereo_matching',safetyCriticalApproved:false};
  });
}
export function worldsProjection(observations,{worldId='spatial-lab-v0'}={}) {
  if (!Array.isArray(observations) || typeof worldId!=='string' || !worldId)
    throw Error('spatial_invalid_observations');
  return {schema:'evercraft.world-engine.world.v1',id:worldId,version:1,
    tickRateHz:60,gravity:{x:0,y:-9.81,z:0},ground:{enabled:false,height:0},
    entities:observations.filter(o=>o.cameraPositionM).map(o=>({
      id:'perception:'+o.id,name:o.label,transform:{position:o.cameraPositionM},
      tags:['spatial_perception','camera_relative','non_colliding','unverified'],
      properties:{sourceFrame:o.frameId,sourceSha256:o.sourceSha256,
        timestampMs:o.timestampMs,depthStatus:o.depthStatus,
        rangeEstimateM:o.depthEstimateM,georegistered:false}
    })),metadata:{source:'evercraft.spatial-perception.v0',
      cameraRelativeOnly:true,productionAuthoritative:false,
      reviewRequired:true,persistenceAuthorized:false,collisionAuthority:false}};
}
export function forensiScopeTimeline(observations) {
  if (!Array.isArray(observations)) throw Error('spatial_invalid_observations');
  return observations.map(o=>({
    schema:'evercraft.forensiscope.spatial-event.v0',frameId:o.frameId,
    timestampMs:o.timestampMs,label:o.label,box:o.box,
    detectorConfidence:o.detectorConfidence,depthEstimateM:o.depthEstimateM,
    depthStatus:o.depthStatus,sourceSha256:o.sourceSha256,
    coordinateFrame:o.coordinateFrame,reviewStatus:'requires_human_review'
  }));
}
export function mappingDraft(observations) {
  if (!Array.isArray(observations)) throw Error('spatial_invalid_observations');
  return observations.map(o=>({
    schema:'evercraft.evermaps.spatial-draft.v0',observationId:o.id,
    label:o.label,rangeEstimateM:o.depthEstimateM,geometry:null,
    geolocationStatus:'unlocated_georegistration_required',
    severity:null,urgency:'not_assessed'
  }));
}
