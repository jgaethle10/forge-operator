/**
 * Evercraft Spatial Perception: bounded observation association over time.
 * No optical-flow inference, detector, geo-registration, camera-pose solution,
 * world-motion reconstruction, biometric identification, or speed estimate.
 * Every coordinate is image-relative or single-frame camera-relative.
 */
export const TEMPORAL_SCHEMA = 'evercraft.spatial-perception.temporal-review.v1';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const round = x => Math.round(x * 1000) / 1000;
const fail = why => { throw new Error('spatial_temporal_' + why); };
const isInt = (x,low,high) => Number.isInteger(x) && x>=low && x<=high;
const rect = b => b && ['x','y','width','height'].every(k=>finite(b[k])) &&
  b.width>0 && b.height>0 && b.x>=0 && b.y>=0;
const intersectOverUnion = (a,b) => {
  const left=Math.max(a.x,b.x),right=Math.min(a.x+a.width,b.x+b.width);
  const top=Math.max(a.y,b.y),bottom=Math.min(a.y+a.height,b.y+b.height);
  const overlap=Math.max(0,right-left)*Math.max(0,bottom-top);
  return overlap/(a.width*a.height+b.width*b.height-overlap);
};
const relativeCenter = (a,b,w,h) =>
  Math.hypot((a.x+a.width/2-b.x-b.width/2)/w,
    (a.y+a.height/2-b.y-b.height/2)/h);
function validateFrame(frame, previous, frameIds, total) {
  if(!frame || typeof frame.frameId!=='string' || !frame.frameId || frame.frameId.length>128)
    fail('invalid_frame_id');
  if(frameIds.has(frame.frameId))fail('duplicate_frame_id');
  frameIds.add(frame.frameId);
  if(!finite(frame.timestampMs)||frame.timestampMs<0||frame.timestampMs>1e15)
    fail('invalid_timestamp');
  if(previous && frame.timestampMs<=previous.timestampMs)fail('nonmonotonic_timestamp');
  if(!isInt(frame.width,16,4096)||!isInt(frame.height,12,4096))
    fail('invalid_dimensions');
  if(previous && (frame.width!==previous.width||frame.height!==previous.height))
    fail('mixed_image_dimensions');
  if(!Array.isArray(frame.observations)||frame.observations.length>200)
    fail('observation_limit');
  if(total+frame.observations.length>20000)fail('total_observation_limit');
  const ids=new Set();
  for(const o of frame.observations) {
    if(o?.schema!=='evercraft.spatial-perception.observation.v0')fail('invalid_observation_schema');
    if(o.frameId!==frame.frameId || o.timestampMs!==frame.timestampMs || typeof o.id!=='string'||!o.id||o.id.length>160)
      fail('observation_frame_mismatch');
    if(ids.has(o.id))fail('duplicate_observation');
    ids.add(o.id);
    if(typeof o.label!=='string'||!o.label.trim()||o.label.length>80)
      fail('invalid_label');
    if(!rect(o.box)||o.box.x+o.box.width>frame.width||
       o.box.y+o.box.height>frame.height)fail('invalid_box');
    if(!finite(o.detectorConfidence)||o.detectorConfidence<0||o.detectorConfidence>1)
      fail('invalid_confidence');
    if(o.depthEstimateM!==null && o.depthEstimateM!==undefined &&
      (!finite(o.depthEstimateM)||o.depthEstimateM<=0||o.depthEstimateM>10000))
      fail('invalid_depth');
    if(o.sourceSha256!==null&&o.sourceSha256!==undefined &&
      (typeof o.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(o.sourceSha256)))
      fail('invalid_source_digest');
    if(o.cameraPositionM!==null && o.cameraPositionM!==undefined &&
      (!['x','y','z'].every(k=>finite(o.cameraPositionM[k]))||
       o.cameraPositionM.z<=0))fail('invalid_camera_position');
    if(o.coordinateFrame!==undefined && o.coordinateFrame!=='camera_relative')
      fail('invalid_coordinate_frame');
    if(o.cameraPositionM && finite(o.depthEstimateM) &&
       Math.abs(o.cameraPositionM.z-o.depthEstimateM)>0.002)
      fail('inconsistent_camera_depth');
    if(o.georegistered===true || o.safetyCriticalApproved===true)
      fail('authority_escalation_forbidden');
  }
}
function candidate(track,o,frame,cfg) {
  if(track.label!==o.label) return null;
  if(frame.timestampMs-track.lastSeenMs>cfg.maxGapMs) return null;
  const a=track.lastBox,b=o.box;
  const wRatio=Math.max(a.width/b.width,b.width/a.width);
  const hRatio=Math.max(a.height/b.height,b.height/a.height);
  if(wRatio>cfg.maxBoxScaleRatio||hRatio>cfg.maxBoxScaleRatio)return null;
  const overlap=intersectOverUnion(a,b),shift=relativeCenter(a,b,frame.width,frame.height);
  if(shift>cfg.maxCenterShift || (overlap<cfg.minIoU && shift>cfg.maxCenterShift*0.45))
    return null;
  const oldDepth=track.lastDepth,newDepth=o.depthEstimateM;
  if(finite(oldDepth)&&finite(newDepth)&&
    Math.abs(oldDepth-newDepth)/Math.max(oldDepth,newDepth)>cfg.maxDepthJumpRatio)
    return null;
  const score=round(.7*overlap+.3*(1-Math.min(1,shift/cfg.maxCenterShift)));
  return {trackId:track.id,observationId:o.id,score,overlap:round(overlap),
    normalizedCenterShift:round(shift)};
}
export function associateSpatialFrames(frames,{
  maxGapMs=1500,minIoU=.1,maxCenterShift=.2,
  maxDepthJumpRatio=.6,maxBoxScaleRatio=2.5,ambiguityMargin=.07
}={}) {
  if(!Array.isArray(frames)||frames.length>400)fail('frame_limit');
  const cfg={maxGapMs,minIoU,maxCenterShift,maxDepthJumpRatio,maxBoxScaleRatio,ambiguityMargin};
  if(!isInt(maxGapMs,1,60000))fail('invalid_max_gap');
  if(!finite(minIoU)||minIoU<0||minIoU>1)fail('invalid_min_iou');
  if(!finite(maxCenterShift)||maxCenterShift<=0||maxCenterShift>1)
    fail('invalid_max_center_shift');
  if(!finite(maxDepthJumpRatio)||maxDepthJumpRatio<0||maxDepthJumpRatio>1)
    fail('invalid_max_depth_jump');
  if(!finite(maxBoxScaleRatio)||maxBoxScaleRatio<1||maxBoxScaleRatio>10)
    fail('invalid_box_scale');
  if(!finite(ambiguityMargin)||ambiguityMargin<0||ambiguityMargin>1)
    fail('invalid_ambiguity_margin');
  let previous=null,total=0,nextId=1,candidateBudget=0;
  const frameIds=new Set(),tracks=[],timeline=[];
  for(const frame of frames) {
    validateFrame(frame,previous,frameIds,total);
    total+=frame.observations.length;
    const available=tracks.filter(t=>frame.timestampMs-t.lastSeenMs<=maxGapMs);
    candidateBudget+=available.length*frame.observations.length;
    if(candidateBudget>300000)fail('association_budget_exceeded');
    const candidates=[];
    for(const track of available)for(const observation of frame.observations) {
      const c=candidate(track,observation,frame,cfg);
      if(c)candidates.push(c);
    }
    const byObservation=new Map(),byTrack=new Map();
    for(const c of candidates) {
      if(!byObservation.has(c.observationId))byObservation.set(c.observationId,[]);
      if(!byTrack.has(c.trackId))byTrack.set(c.trackId,[]);
      byObservation.get(c.observationId).push(c);
      byTrack.get(c.trackId).push(c);
    }
    const ambiguousIds=new Set(),ambiguousTracks=new Set();
    for(const [id,cs] of byObservation) {
      cs.sort((a,b)=>b.score-a.score||a.trackId.localeCompare(b.trackId));
      if(cs.length>1&&cs[0].score-cs[1].score<=ambiguityMargin)
        ambiguousIds.add(id);
    }
    for(const [id,cs] of byTrack) {
      cs.sort((a,b)=>b.score-a.score||a.observationId.localeCompare(b.observationId));
      if(cs.length>1&&cs[0].score-cs[1].score<=ambiguityMargin)
        ambiguousTracks.add(id);
    }
    const assignedTracks=new Set(),assignedObs=new Map();
    const ordered=candidates.sort((a,b)=>b.score-a.score||
      a.trackId.localeCompare(b.trackId)||a.observationId.localeCompare(b.observationId));
    for(const c of ordered) {
      if(ambiguousIds.has(c.observationId)||ambiguousTracks.has(c.trackId))continue;
      if(assignedTracks.has(c.trackId)||assignedObs.has(c.observationId))continue;
      assignedTracks.add(c.trackId);
      assignedObs.set(c.observationId,c);
    }
    const events=[];
    for(const observation of frame.observations) {
      const c=assignedObs.get(observation.id);
      let track;
      if(c){
        track=tracks.find(t=>t.id===c.trackId);
        track.lastSeenMs=frame.timestampMs;
        track.lastBox={...observation.box};
        track.lastDepth=observation.depthEstimateM??null;
        track.observationCount+=1;
      }else{
        track={id:'track-'+String(nextId++).padStart(4,'0'),label:observation.label,
          firstSeenMs:frame.timestampMs,lastSeenMs:frame.timestampMs,
          lastBox:{...observation.box},lastDepth:observation.depthEstimateM??null,
          observationCount:1};
        tracks.push(track);
      }
      const ambiguity=ambiguousIds.has(observation.id) || (c?false:
        [...ambiguousTracks].some(id=>(byObservation.get(observation.id)||[])
          .some(candidate=>candidate.trackId===id)));
      events.push({
        trackId:track.id,observationId:observation.id,frameId:frame.frameId,
        timestampMs:frame.timestampMs,label:observation.label,
        box:{...observation.box},depthEstimateM:observation.depthEstimateM??null,
        cameraPositionM:observation.cameraPositionM?{...observation.cameraPositionM}:null,
        sourceSha256:observation.sourceSha256??null,
        detectorConfidence:observation.detectorConfidence,
        association:!c?(ambiguity?'new_track_ambiguous':'new_track'):'image_association_only',
        matchScore:c?.score??null,ambiguous:ambiguity,
        coordinateFrame:'frame_camera_relative',physicalSpeedMps:null,
        georegistered:false,egoMotionCompensated:false,reviewStatus:'unreviewed'
      });
    }
    timeline.push({frameId:frame.frameId,timestampMs:frame.timestampMs,
      width:frame.width,height:frame.height,events});
    previous=frame;
  }
  return {schema:TEMPORAL_SCHEMA,
    metadata:{source:'bounded_observation_association',imageMatchingOnly:true,
      labelsFromExternalDetector:true,objectIdentityVerified:false,
      independentCameraPose:false,metricMotionValid:false,
      safetyCriticalApproved:false,forensicCertified:false,
      worldPersistenceAuthorized:false},
    tracks:tracks.map(({lastBox,lastDepth,...publicInfo})=>({...publicInfo,
      identityStatus:'provisional_image_association'})),
    frames:timeline,totalInputObservations:total};
}
export function temporalReviewPacket(result) {
  if(result?.schema!==TEMPORAL_SCHEMA||!Array.isArray(result.frames)||
     !Array.isArray(result.tracks))fail('invalid_timeline');
  return {schema:'evercraft.spatial-perception.review-packet.v1',
    reviewStatus:'unreviewed',sourceMediaVerified:false,chainOfCustodyVerified:false,
    coordinateFrame:'per_frame_camera_relative',georegistered:false,
    physicalSpeedMps:null,authoritativeWorldScene:false,
    tracks:result.tracks.map(t=>({id:t.id,label:t.label,
      firstSeenMs:t.firstSeenMs,lastSeenMs:t.lastSeenMs,
      observationCount:t.observationCount,identityStatus:t.identityStatus})),
    events:result.frames.flatMap(f=>f.events.map(e=>({
      trackId:e.trackId,observationId:e.observationId,frameId:e.frameId,
      timestampMs:e.timestampMs,label:e.label,box:{...e.box},
      depthEstimateM:e.depthEstimateM,sourceSha256:e.sourceSha256,
      association:e.association,ambiguous:e.ambiguous,
      reviewStatus:'unreviewed'}))),
    warning:'Model output is provisional. No object identity, geographic location, motion speed, or source custody has been verified.'};
}

// Consumer adapters are projections only. They do not mutate production records.
function validateReviewTimeline(timeline){
 if(timeline?.schema!==TEMPORAL_SCHEMA||!Array.isArray(timeline.frames))
   fail('invalid_timeline');
}
export function forensiScopeTemporalEvents(timeline){
 validateReviewTimeline(timeline);
 return timeline.frames.flatMap(frame=>frame.events.map(e=>({
  schema:'evercraft.forensiscope.temporal-spatial-event.v1',
  trackId:e.trackId,frameId:e.frameId,timestampMs:e.timestampMs,
  label:e.label,box:{...e.box},depthEstimateM:e.depthEstimateM,
  sourceSha256:e.sourceSha256,association:e.association,
  identityVerified:false,reviewStatus:'requires_human_review',
  chainOfCustodyVerified:false
 })));
}
export function everMapsTemporalDrafts(timeline){
 validateReviewTimeline(timeline);
 return timeline.frames.flatMap(frame=>frame.events.map(e=>({
   schema:'evercraft.evermaps.spatial-temporal-draft.v1',
   trackId:e.trackId,observationId:e.observationId,frameId:e.frameId,
   label:e.label,rangeEstimateM:e.depthEstimateM,
   geometry:null,geolocationStatus:'unlocated_georegistration_required',
   severity:null,urgency:'not_assessed',reviewStatus:'unreviewed'
 })));
}
export function worldsTemporalPreview(timeline,frameId){
 validateReviewTimeline(timeline);
 const frame=timeline.frames.find(f=>f.frameId===frameId);
 if(!frame)fail('frame_not_found');
 const slug=frameId.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,80);
 return {schema:'evercraft.world-engine.world.v1',
   id:'spatial-temporal-preview-'+slug,version:1,tickRateHz:60,
   gravity:{x:0,y:-9.81,z:0},ground:{enabled:false,height:0},
   entities:frame.events.filter(e=>e.cameraPositionM).map(e=>({
     id:'spatial-preview:'+e.trackId,name:e.label,
     transform:{position:{...e.cameraPositionM}},
     tags:['spatial_perception','provisional','non_colliding','frame_relative'],
     properties:{frameId:e.frameId,timestampMs:e.timestampMs,
       trackId:e.trackId,observationId:e.observationId,
       sourceSha256:e.sourceSha256,association:e.association,
       georegistered:false,identityVerified:false,reviewRequired:true}
   })),
   metadata:{source:'evercraft.spatial-perception.temporal-review.v1',
     cameraRelativeOnly:true,worldReconstructionComplete:false,
     productionAuthoritative:false,collisionAuthority:false,
     persistenceAuthorized:false,reviewRequired:true}
 };
}
