/**
 * World Engine evidence-typed moving educational callouts.
 *
 * The projected anchor is derived from a REAL validated WebGPU scene plan,
 * never estimated by an image model. This compiler emits an FFmpeg/libass
 * subtitle track, not new world pixels or synthetic history.
 */
import crypto from 'node:crypto';
import type {CinematicCameraSequence} from './cinematic-rig.js';
import type {Vec3} from './engine.js';
import {verifyWebGpuRenderPlan} from './webgpu.js';

export type TeachingEvidence='modeled'|'verified_fact';
export interface SceneCallout{
  id:string;
  entityId:string;
  label:string;
  evidence:TeachingEvidence;
  sourceRefs?:string[];
  localAnchor:Vec3;
  startSec:number;
  endSec:number;
}
export interface TeachingCalloutManifest{
  schema:'evercraft.world-engine.teaching-callouts.v1';
  sequenceWorldDigest:string;
  reviewRef?:string;
  callouts:SceneCallout[];
  authoredByHuman:boolean;
  publicationAuthority:false;
}
export interface AnchorTrack{
  calloutId:string;
  entityId:string;
  label:string;
  evidence:TeachingEvidence;
  sourceRefs:string[];
  activeFrames:number;
  visibleFrames:number;
  changingPositionFrames:number;
  omittedOutOfFrame:number;
  firstScreen:{x:number;y:number}|null;
  lastScreen:{x:number;y:number}|null;
}
const fail=(reason:string):never=>{throw Error('world_teaching_'+reason);};
const validText=(t:unknown,max=85)=>typeof t==='string'&&
 t.length>=4&&t.length<=max&&/^[A-Za-z0-9][A-Za-z0-9 .,:'()/-]*$/.test(t);
const hash=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const pad=(n:number,digits=2)=>String(n).padStart(digits,'0');
const assTime=(s:number)=>{const cs=Math.round(s*100);const h=Math.floor(cs/360000),m=Math.floor(cs%360000/6000),t=Math.floor(cs%6000/100);return h+':'+pad(m)+':'+pad(t)+'.'+pad(cs%100);};
function project(m:number[],p:Vec3){
  return [
    m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],
    m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],
    m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14],
    m[3]*p.x+m[7]*p.y+m[11]*p.z+m[15]
  ];
}
function screen(vp:number[],model:number[],local:Vec3,w:number,h:number){
  const v=project(model,local),p=project(vp,{x:v[0],y:v[1],z:v[2]});
  if(!p.every(Number.isFinite)||p[3]<=1e-6)return null;
  const ndc={x:p[0]/p[3],y:p[1]/p[3],z:p[2]/p[3]};
  if(ndc.z<0||ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)return null;
  return {x:Math.round((ndc.x*.5+.5)*w),y:Math.round((1-(ndc.y*.5+.5))*h)};
}
function validate(seq:CinematicCameraSequence,manifest:TeachingCalloutManifest){
  if(seq?.schema!=='evercraft.world-engine.cinematic-camera-sequence.v1'||!Array.isArray(seq.frames)
    ||seq.frames.length<2||seq.durationSec<=0||!Number.isFinite(seq.fps))
    fail('sequence_invalid');
  if(manifest?.schema!=='evercraft.world-engine.teaching-callouts.v1'||
    manifest.sequenceWorldDigest!==seq.worldDefinitionDigest||
    manifest.authoredByHuman!==true||manifest.publicationAuthority!==false)
    fail('manifest_provenance_invalid');
  if(!Array.isArray(manifest.callouts)||!manifest.callouts.length||
    manifest.callouts.length>8)fail('callouts_invalid');
  const ids=new Set<string>();
  for(const c of manifest.callouts){
    if(!/^[a-z][a-z0-9-]{2,42}$/.test(c?.id||'')||ids.has(c.id))fail('callout_id_invalid');
    ids.add(c.id);
    if(typeof c.entityId!=='string'||!/^[a-z][a-z0-9-]{2,90}$/.test(c.entityId))
      fail('entity_id_invalid');
    if(!validText(c.label))fail('label_unsafe');
    if(c.evidence!=='modeled'&&c.evidence!=='verified_fact')fail('evidence_state_invalid');
    if(c.evidence==='verified_fact' &&
      (!manifest.reviewRef||manifest.reviewRef.length<8||
        !Array.isArray(c.sourceRefs)||!c.sourceRefs.length||
        c.sourceRefs.some(ref=>!validText(ref,180))))
      fail('factual_claim_review_required');
    for(const a of ['x','y','z'] as const)if(!finite(c.localAnchor?.[a])||
      Math.abs(c.localAnchor[a])>1000)fail('anchor_nonfinite_or_unbounded');
    if(!finite(c.startSec)||!finite(c.endSec)||
      c.startSec<0||c.endSec>seq.durationSec||c.endSec-c.startSec<.20)
      fail('callout_window_invalid');
  }
}
export function compileTeachingCallouts(sequence:CinematicCameraSequence,
  manifest:TeachingCalloutManifest):{
    ass:string;
    receipt:{
      schema:'evercraft.world-engine.teaching-projection-receipt.v1';
      worldDigest:string;
      sourceCameraTakeId:string;
      cameraPlanDigests:string[];
      manifestSha256:string;
      subtitleSha256:string;
      videoFrames:number;
      labels:AnchorTrack[];
      visualSource:'canonical_3d_world_gpu_plan_projection';
      occlusionDetection:false;
      educationalFactVerification:'not_performed_by_renderer';
      releaseApproval:false;
      publicationAuthority:false;
    }
  }{
  validate(sequence,manifest);
  const {width,height}=sequence.frames[0].renderPlan;
  if(!Number.isInteger(width)||!Number.isInteger(height))fail('viewport_invalid');
  // Require all original plans to be digest verified before using their
  // camera projection as the source of truth.
  for(const frame of sequence.frames){
    if(!verifyWebGpuRenderPlan(frame.renderPlan)||frame.renderPlan.width!==width||
      frame.renderPlan.height!==height)fail('plan_digest_or_viewport_invalid');
  }
  const lines=[
    '[Script Info]','Title: Evercraft Verified-Projection Teaching Review',
    'ScriptType: v4.00+','WrapStyle: 2','ScaledBorderAndShadow: yes',
    'PlayResX: '+width,'PlayResY: '+height,'',
    '[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Callout,DejaVu Sans,15,&H00FFFFFF,&H00FFFFFF,&H00201107,&H80000000,1,0,0,0,100,100,0,0,1,2,0,7,8,8,8,1',
    'Style: Line,DejaVu Sans,12,&H0000D9F6,&H0000D9F6,&H000B1A26,&H000B1A26,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    'Style: Disclosure,DejaVu Sans,12,&H00FFFFFF,&H00FFFFFF,&H00110904,&H80110904,1,0,0,0,100,100,0,0,1,2,0,2,8,8,8,1',
    '','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  const duration=sequence.durationSec;
  lines.push('Dialogue: 5,'+assTime(0)+','+assTime(duration)+',Disclosure,,0,0,0,,SYNTHETIC 3D - MODELED SCENE, NOT HISTORICAL FOOTAGE');
  const tracks:AnchorTrack[]=[];
  for(const c of manifest.callouts){
    const track:AnchorTrack={calloutId:c.id,entityId:c.entityId,label:c.label,
      evidence:c.evidence,sourceRefs:c.sourceRefs??[],activeFrames:0,visibleFrames:0,
      changingPositionFrames:0,omittedOutOfFrame:0,firstScreen:null,lastScreen:null};
    let previous:{x:number;y:number}|null=null;
    for(let i=0;i<sequence.frames.length-1;i++){
      const frame=sequence.frames[i];
      if(frame.timeSec+1e-5<c.startSec||frame.timeSec>=c.endSec)continue;
      track.activeFrames++;
      const match=frame.renderPlan.draws.filter(x=>x.entityId===c.entityId);
      if(match.length!==1)fail('missing_or_ambiguous_renderable_'+c.entityId);
      const origin=screen(frame.renderPlan.viewProjectionMatrix,match[0].modelMatrix,
        c.localAnchor,width,height);
      if(!origin){track.omittedOutOfFrame++;continue;}
      track.visibleFrames++;
      if(previous&&(previous.x!==origin.x||previous.y!==origin.y))
        track.changingPositionFrames++;
      track.firstScreen??=origin;track.lastScreen=origin;previous=origin;
      const fullLabel=(c.evidence==='modeled'?'MODEL: ':'FACT REVIEWED: ')+c.label;
      // Conservative DejaVu Sans bold sizing for native 640x360 review.
      // Prefer right-side label when it fits; otherwise flip to the left.
      const estimatedWidth=Math.min(width-18,Math.ceil(fullLabel.length*9.1)+14);
      const wouldOverflow=origin.x+24+estimatedWidth>width-10;
      const desiredX=wouldOverflow?origin.x-estimatedWidth-24:origin.x+24;
      const x=clamp(desiredX,8,width-estimatedWidth-8);
      const y=clamp(origin.y-45,14,height-62);
      const lineEndX=wouldOverflow?x+estimatedWidth-11:x;
      const cue=assTime(i/sequence.fps),end=assTime((i+1)/sequence.fps);
      // Both 3D-linked pointer and readable label follow projected scene
      // coordinates frame by frame; no software image recognition.
      lines.push('Dialogue: 0,'+cue+','+end+',Line,,0,0,0,,{\\an7\\pos(0,0)\\p1\\c&H00D9F6&}m '+
        origin.x+' '+origin.y+' l '+lineEndX+' '+(y+11));
      lines.push('Dialogue: 2,'+cue+','+end+',Callout,,0,0,0,,{\\an7\\pos('+x+','+y+')}'+
        fullLabel);
    }
    if(!track.visibleFrames)fail('callout_never_visible_'+c.id);
    tracks.push(track);
  }
  const ass=lines.join('\n')+'\n';
  const receipt={
    schema:'evercraft.world-engine.teaching-projection-receipt.v1' as const,
    worldDigest:sequence.worldDefinitionDigest,
    sourceCameraTakeId:sequence.takeId,
    cameraPlanDigests:sequence.frames.slice(0,-1).map(f=>f.renderPlan.digest),
    manifestSha256:hash(manifest),
    subtitleSha256:crypto.createHash('sha256').update(ass).digest('hex'),
    videoFrames:sequence.frames.length-1,labels:tracks,
    visualSource:'canonical_3d_world_gpu_plan_projection' as const,
    occlusionDetection:false as const,
    educationalFactVerification:'not_performed_by_renderer' as const,
    releaseApproval:false as const,publicationAuthority:false as const
  };
  return {ass,receipt};
}
