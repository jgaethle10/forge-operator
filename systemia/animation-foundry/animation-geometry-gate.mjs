/**
 * Animation Foundry preflight gate for Evercraft World Engine animation.v1.
 * Objective geometry checks only. Never certifies artistry, voice rights, or readiness for publication.
 * Expects a declared 2D coordinate system in pixels with explicit stage bounds.
 * This is not a substitute for World Engine's own schema validation.
 */
const finite = v => typeof v === 'number' && Number.isFinite(v);
const dist = (a,b)=> Math.hypot(a.x-b.x,a.y-b.y);
function sample(frames,time){
  if(!frames?.length)return null;
  if(time<=frames[0].timeSec)return frames[0].value;
  for(let i=1;i<frames.length;i++){
    const r=frames[i],l=frames[i-1];
    if(time>r.timeSec)continue;
    const s=Math.max(0,Math.min(1,(time-l.timeSec)/Math.max(1e-10,r.timeSec-l.timeSec)));
    return {x:l.value.x+(r.value.x-l.value.x)*s,y:l.value.y+(r.value.y-l.value.y)*s,z:l.value.z+(r.value.z-l.value.z)*s};
  }
  return frames.at(-1).value;
}
export function auditAnimationGeometry(component,options={}){
  const opts={fps:24,maxElbowDelta:8,maxHandHeadRatio:.38,headHeight:265,handHeight:68,
    canvasWidth:960,canvasHeight:540,headSafeMargin:35,expectedUpperArm:101,expectedForearm:106,
    lengthTolerance:1.0,requiredEvents:['snap'],...options};
  const failures=[];const warnings=[];
  const clip=component?.clips?.[0];
  if(component?.schema!=='evercraft.world-engine.animation.v1'||!clip){
    return {status:'fail',failures:['invalid_or_missing_world_engine_animation'],warnings,observations:{}};
  }
  if(!finite(clip.durationSec)||clip.durationSec<=0||!finite(opts.fps)||opts.fps<=0){
    return {status:'fail',failures:['invalid_duration_or_fps'],warnings,observations:{}};
  }
  const byBone=new Map(clip.tracks.map(t=>[t.boneId,t]));
  for(const id of ['shoulder','elbow','wrist','head']){
    if(!byBone.get(id)?.translation?.length)failures.push(`missing_translation_track:${id}`);
  }
  const eventIds=new Set((clip.events||[]).map(e=>e.id));
  for(const id of opts.requiredEvents)if(!eventIds.has(id))failures.push(`required_event_missing:${id}`);
  if(failures.length)return {status:'fail',failures,warnings,observations:{}};
  if(opts.handHeight/opts.headHeight>opts.maxHandHeadRatio)failures.push('hand_oversized');
  let maximumElbowDelta=0,minimumMargin=Infinity,maxUpperError=0,maxLowerError=0;
  let previousElbow=null;
  const frames=Math.round(clip.durationSec*opts.fps);
  for(let i=0;i<frames;i++){
    const time=i/opts.fps;
    const bone=id=>sample(byBone.get(id).translation,time);
    const shoulder=bone('shoulder'),elbow=bone('elbow'),wrist=bone('wrist'),head=bone('head');
    if([shoulder,elbow,wrist,head].some(p=>p===null||![p.x,p.y,p.z].every(finite))){failures.push(`nonfinite_pose_at_frame:${i}`);break;}
    maxUpperError=Math.max(maxUpperError,Math.abs(dist(shoulder,elbow)-opts.expectedUpperArm));
    maxLowerError=Math.max(maxLowerError,Math.abs(dist(elbow,wrist)-opts.expectedForearm));
    minimumMargin=Math.min(minimumMargin,head.y-opts.headHeight*.65,opts.canvasWidth-wrist.x,wrist.x);
    if(previousElbow)maximumElbowDelta=Math.max(maximumElbowDelta,dist(previousElbow,elbow));
    previousElbow=elbow;
  }
  if(maximumElbowDelta>opts.maxElbowDelta)failures.push('elbow_pop');
  if(Math.max(maxUpperError,maxLowerError)>opts.lengthTolerance)failures.push('bone_length_drift');
  if(minimumMargin<opts.headSafeMargin)failures.push('unsafe_frame');
  const observations={frameCount:frames,maxElbowDeltaPx:Number(maximumElbowDelta.toFixed(3)),
    maximumUpperBoneErrorPx:Number(maxUpperError.toFixed(3)),maximumLowerBoneErrorPx:Number(maxLowerError.toFixed(3)),
    minimumHeadWristFrameMarginPx:Number(minimumMargin.toFixed(3)),handHeadRatio:Number((opts.handHeight/opts.headHeight).toFixed(3))};
  return {status:failures.length?'fail':'pass',failures,warnings,observations,
    humanReviewRequired:['visual appeal','face acting','finger contact','voice/music rights','publication authorization']};
}