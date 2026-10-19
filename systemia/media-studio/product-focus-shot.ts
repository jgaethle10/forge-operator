import type { VisualStage, EaseName } from './visual-stage.js';

export interface SourceWindow {
  x:number; y:number; width:number; height:number;
  sourceWidth:number; sourceHeight:number;
}

export interface FocusRegion {
  x:number; y:number; width:number; height:number;
}

export interface ProductFocusInput {
  id:string;
  sourcePath:string;
  sourceRefs:string[];
  sourceKind:'image'|'video';
  sourceWidth:number;
  sourceHeight:number;
  focus:FocusRegion;
  /** Multiple truthful subject windows that the on-screen camera should follow. */
  focusPath?:Array<{t:number;focus:FocusRegion;action:string;ease?:EaseName}>;
  title:string;
  caption:string;
  evidenceLabel:string;
  durationSec?:number;
  format?:'portrait'|'square'|'landscape';
  paddingFraction?:number;
  minimumFocusFraction?:number;
}

export interface ProductFocusResult {
  schema:'evercraft.fallen.product-focus-shot.v1';
  status:'candidate_requires_visual_review';
  stage:VisualStage;
  sourceWindow:SourceWindow;
  evidence:{
    sourceRefs:string[];
    focusAreaFraction:number;
    sourcePixelsPerOutputPixel:number;
    target:string;
    cameraStops:number;
    cameraIntent:string[];
    sourcePixelsNotInvented:true;
    pixelLegibilityNotAutomaticallyVerified:true;
    noCreativeOrPublicationAuthority:true;
  };
}

const FORMATS={
  portrait:{width:1080,height:1920,screen:{x:35,y:305,width:1010,height:1260}},
  square:{width:1080,height:1080,screen:{x:35,y:205,width:1010,height:655}},
  landscape:{width:1920,height:1080,screen:{x:560,y:120,width:1300,height:790}},
} as const;

function within(value:number,min:number,max:number){
  return Math.min(max,Math.max(min,value));
}

function positiveFinite(...values:number[]){
  return values.every(value=>Number.isFinite(value)&&value>0);
}

/**
 * Determine the exact source pixel window that fills a target frame without
 * nonuniform stretching or black bars. The nominated focus must be visible.
 * Does not imply that a source screenshot's small text is actually readable.
 */
export function planProductSourceWindow(input:{
  sourceWidth:number;
  sourceHeight:number;
  focus:FocusRegion;
  displayWidth:number;
  displayHeight:number;
  paddingFraction?:number;
  minimumFocusFraction?:number;
}):{sourceWindow:SourceWindow;focusAreaFraction:number;sourcePixelsPerOutputPixel:number}{
  const {sourceWidth:sw,sourceHeight:sh,focus,displayWidth:dw,displayHeight:dh}=input;
  if(!positiveFinite(sw,sh,dw,dh,focus?.width,focus?.height) ||
     ![focus.x,focus.y].every(Number.isFinite) ||
     focus.x<0||focus.y<0||focus.x+focus.width>sw||focus.y+focus.height>sh){
    throw new Error('product_focus_geometry_invalid');
  }
  const pad=input.paddingFraction??.06;
  const floor=input.minimumFocusFraction??.27;
  if(!Number.isFinite(pad)||pad<0||pad>.25) throw new Error('product_focus_padding_invalid');
  if(!Number.isFinite(floor)||floor<=0||floor>1) throw new Error('product_focus_fraction_invalid');

  const ratio=dw/dh;
  let cropW=Math.max(focus.width*(1+2*pad),focus.height*(1+2*pad)*ratio);
  let cropH=cropW/ratio;
  if(cropW>sw+1e-6||cropH>sh+1e-6){
    throw new Error('product_focus_cannot_fit_source');
  }

  const cx=focus.x+focus.width/2;
  const cy=focus.y+focus.height/2;
  let x=within(cx-cropW/2,0,sw-cropW);
  let y=within(cy-cropH/2,0,sh-cropH);
  // Rounding output to source pixels is deferred to rasterization to avoid
  // changing the aspect ratio and accidentally stretching source content.
  if(x>focus.x+1e-5||y>focus.y+1e-5||
     x+cropW<focus.x+focus.width-1e-5||
     y+cropH<focus.y+focus.height-1e-5){
    throw new Error('product_focus_window_omits_subject');
  }
  const focusAreaFraction=(focus.width*focus.height)/(cropW*cropH);
  if(focusAreaFraction<floor){
    throw new Error('product_focus_too_small_for_format');
  }
  return {
    sourceWindow:{x,y,width:cropW,height:cropH,sourceWidth:sw,sourceHeight:sh},
    focusAreaFraction:Number(focusAreaFraction.toFixed(4)),
    sourcePixelsPerOutputPixel:Number((cropW/dw).toFixed(4)),
  };
}

export function compileProductFocusShot(input:ProductFocusInput):ProductFocusResult{
  if(!/^[a-zA-Z0-9._-]{1,128}$/.test(input.id??'')){
    throw new Error('product_focus_id_invalid');
  }
  if(!input.sourcePath?.trim()||!Array.isArray(input.sourceRefs)||
     !input.sourceRefs.length||input.sourceRefs.some(ref=>!ref?.trim())){
    throw new Error('product_focus_provenance_missing');
  }
  if(!input.title?.trim()||!input.caption?.trim()||!input.evidenceLabel?.trim()){
    throw new Error('product_focus_editorial_copy_missing');
  }
  if(!['image','video'].includes(input.sourceKind)){
    throw new Error('product_focus_source_kind_invalid');
  }
  const duration=input.durationSec??5;
  if(!Number.isFinite(duration)||duration<2||duration>15){
    throw new Error('product_focus_duration_invalid');
  }
  const fmt=input.format??'portrait';
  const layout=FORMATS[fmt];
  if(!layout) throw new Error('product_focus_format_invalid');
  const crop=planProductSourceWindow({
    sourceWidth:input.sourceWidth,
    sourceHeight:input.sourceHeight,
    focus:input.focus,
    displayWidth:layout.screen.width,
    displayHeight:layout.screen.height,
    paddingFraction:input.paddingFraction,
    minimumFocusFraction:input.minimumFocusFraction,
  });
  const {width,height,screen}=layout;
  const path=input.focusPath;
  if(path!==undefined){
    if(!Array.isArray(path)||path.length<2||path.length>12||
       Math.abs(path[0]?.t??-1)>1e-5||
       Math.abs(path[path.length-1]?.t-duration)>1e-5){
      throw new Error('product_focus_camera_path_invalid');
    }
    let prev=-1;
    for(const item of path){
      if(!Number.isFinite(item.t)||item.t<=prev||item.t<0||item.t>duration||
         !item.action?.trim()||
         (item.ease!==undefined&&!['linear','ease_in','ease_out','ease_in_out'].includes(item.ease))){
        throw new Error('product_focus_camera_waypoint_invalid');
      }
      prev=item.t;
    }
  }
  const cameraPath=path?.map(item=>{
    const window=planProductSourceWindow({
      sourceWidth:input.sourceWidth,sourceHeight:input.sourceHeight,
      focus:item.focus,displayWidth:screen.width,displayHeight:screen.height,
      paddingFraction:input.paddingFraction,
      minimumFocusFraction:input.minimumFocusFraction,
    }).sourceWindow;
    return {t:item.t,x:window.x,y:window.y,width:window.width,height:window.height,ease:item.ease};
  });
  if(cameraPath?.length){
    const first=cameraPath[0];
    const w=crop.sourceWindow;
    if(Math.max(Math.abs(first.x-w.x),Math.abs(first.y-w.y),
      Math.abs(first.width-w.width),Math.abs(first.height-w.height))>1e-4){
      throw new Error('product_focus_camera_initial_focus_mismatch');
    }
    const changed=cameraPath.some(item=>
      Math.abs(item.x-first.x)+Math.abs(item.y-first.y)+
      Math.abs(item.width-first.width)+Math.abs(item.height-first.height)>1);
    if(!changed) throw new Error('product_focus_camera_no_attention_change');
  }
  const compact=fmt!=='landscape';
  const stage:VisualStage={
    schema:'evercraft.fallen.visual-stage.v1',
    id:input.id,
    width,height,fps:30,durationSec:duration,
    background:'#080b10',
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1},{t:duration,x:0,y:0,zoom:1}]},
    layers:[
      {
        id:'product-evidence',kind:'media',mediaKind:input.sourceKind,
        sourcePath:input.sourcePath,sourceWindow:crop.sourceWindow,
        ...(cameraPath?{sourceWindowKeyframes:cameraPath}:{}),
        fit:'cover',x:screen.x,y:screen.y,width:screen.width,height:screen.height,z:2,
        sourceRefs:[...input.sourceRefs],evidenceState:'observed',
        scale:cameraPath?1:[{t:0,value:1},{t:duration,value:1.015,ease:'ease_in_out'}],
      },
      {
        id:'headline',kind:'text',text:input.title,fontSize:compact?67:75,
        fontWeight:700,x:compact?58:65,y:compact?42:135,
        width:compact?width-116:465,height:compact?182:340,z:4,
      },
      {
        id:'product-subtitle',kind:'text',text:input.caption,fontSize:compact?34:36,
        fontWeight:500,x:compact?58:68,y:compact?1590:540,
        width:compact?width-116:460,height:compact?190:220,z:4,
      },
      {
        id:'evidence-label',kind:'text',text:input.evidenceLabel,
        fontSize:compact?25:23,fontWeight:600,x:compact?58:70,
        y:compact?1810:922,width:compact?width-116:470,
        height:compact?54:76,z:4,
        evidenceState:'public_source',sourceRefs:[...input.sourceRefs],
      },
    ],
    createdAt:new Date().toISOString(),
  };
  return {
    schema:'evercraft.fallen.product-focus-shot.v1',
    status:'candidate_requires_visual_review',
    stage,
    sourceWindow:crop.sourceWindow,
    evidence:{
      sourceRefs:[...input.sourceRefs],
      focusAreaFraction:crop.focusAreaFraction,
      sourcePixelsPerOutputPixel:crop.sourcePixelsPerOutputPixel,
      target:fmt,
      cameraStops:cameraPath?.length??1,
      cameraIntent:path?.map(item=>item.action)??[],
      sourcePixelsNotInvented:true,
      pixelLegibilityNotAutomaticallyVerified:true,
      noCreativeOrPublicationAuthority:true,
    },
  };
}
