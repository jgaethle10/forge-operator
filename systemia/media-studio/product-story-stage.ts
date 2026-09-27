
import type {
  EvidenceState,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';

export interface ProductCapture {
  sourcePath:string;
  mediaKind:'image'|'video';
  evidenceState:'observed'|'public_source'|'licensed';
  sourceRefs:string[];
  fit?:'cover'|'contain';
}

export interface ProductStoryStep {
  id:string;
  label:string;
  detail?:string;
  startSec:number;
  endSec:number;
  focus?:{x:number;y:number;width:number;height:number};
}

export interface ProductResultMetric {
  id:string;
  label:string;
  value:number;
  unit?:string;
  decimals?:number;
  evidenceState:EvidenceState;
  sourceRefs:string[];
}

export interface ProductStoryInput {
  id:string;
  productName:string;
  headline:string;
  promise?:string;
  durationSec?:number;
  aspectRatio?:'16:9'|'9:16';
  setPlate?:ProductCapture;
  capture:ProductCapture;
  steps:ProductStoryStep[];
  results?:ProductResultMetric[];
}

function dims(aspect:'16:9'|'9:16'='16:9'){
  return aspect==='9:16'?{width:1080,height:1920}:{width:1920,height:1080};
}

function opacityWindow(start:number,end:number,duration:number){
  const attack=Math.max(0,start-.18);
  const release=Math.min(duration,end+.18);
  return [
    {t:attack,value:0},
    {t:start,value:1,ease:'ease_out' as const},
    {t:end,value:1},
    {t:release,value:0,ease:'ease_in' as const},
  ];
}

function assertCapture(capture:ProductCapture,name:string){
  if(!capture?.sourcePath?.trim()) throw new Error(name+'_source_missing');
  if(!['observed','public_source','licensed'].includes(capture.evidenceState)){
    throw new Error(name+'_must_be_verified_capture');
  }
  if(!capture.sourceRefs?.length) throw new Error(name+'_source_refs_missing');
}

function validateFocus(step:ProductStoryStep){
  if(!step.focus) return;
  for(const [key,value] of Object.entries(step.focus)){
    if(!Number.isFinite(value)||value<0||value>1) throw new Error('focus_'+key+'_invalid:'+step.id);
  }
  if(step.focus.width<=0||step.focus.height<=0||step.focus.x+step.focus.width>1.001||step.focus.y+step.focus.height>1.001){
    throw new Error('focus_bounds_invalid:'+step.id);
  }
}

export function compileProductStoryStage(input:ProductStoryInput):VisualStage{
  if(!input.id?.trim()) throw new Error('product_story_id_missing');
  if(!input.productName?.trim()) throw new Error('product_name_missing');
  if(!input.headline?.trim()) throw new Error('product_headline_missing');
  assertCapture(input.capture,'product_capture');
  if(input.setPlate) assertCapture(input.setPlate,'set_plate');

  const durationSec=Math.max(8,Math.min(90,input.durationSec??24));
  const {width,height}=dims(input.aspectRatio);
  const vertical=height>width;
  const steps=[...input.steps].sort((a,b)=>a.startSec-b.startSec);

  if(!steps.length) throw new Error('product_story_steps_missing');
  for(const step of steps){
    if(!step.id?.trim()||!step.label?.trim()) throw new Error('product_story_step_identity_missing');
    if(!Number.isFinite(step.startSec)||!Number.isFinite(step.endSec)||step.startSec<0||step.endSec<=step.startSec||step.endSec>durationSec){
      throw new Error('product_story_step_timing_invalid:'+step.id);
    }
    validateFocus(step);
  }

  const layers:VisualLayer[]=[];
  if(input.setPlate){
    layers.push({
      id:'product-set',kind:'media',z:0,x:0,y:0,width,height,
      sourcePath:input.setPlate.sourcePath,mediaKind:input.setPlate.mediaKind,
      fit:input.setPlate.fit??'cover',parallax:.45,
      scale:[{t:0,value:1.02},{t:durationSec,value:1.07,ease:'ease_in_out'}],
      evidenceState:input.setPlate.evidenceState,sourceRefs:input.setPlate.sourceRefs
    });
  }

  const captureRect=vertical
    ? {x:70,y:370,width:940,height:920}
    : {x:420,y:190,width:1390,height:760};

  layers.push({
    id:'product-capture',kind:'media',z:2,...captureRect,
    sourcePath:input.capture.sourcePath,mediaKind:input.capture.mediaKind,
    fit:input.capture.fit??'contain',parallax:.92,perspectivePx:1800,
    rotateYDeg:vertical?0:-3.5,
    scale:[{t:0,value:.97},{t:1.1,value:1,ease:'ease_out'}],
    opacity:[{t:0,value:0},{t:.4,value:1,ease:'ease_out'}],
    evidenceState:input.capture.evidenceState,sourceRefs:input.capture.sourceRefs
  });

  steps.forEach((step,index)=>{
    if(step.focus){
      const focus={
        x:captureRect.x+captureRect.width*step.focus.x,
        y:captureRect.y+captureRect.height*step.focus.y,
        width:captureRect.width*step.focus.width,
        height:captureRect.height*step.focus.height
      };
      layers.push({
        id:'focus-'+step.id,kind:'shape',shape:'rect',z:6,...focus,
        fill:'rgba(183,154,86,0.08)',stroke:'#B79A56',strokeWidth:3,radius:12,
        parallax:1.06,opacity:opacityWindow(step.startSec,step.endSec,durationSec)
      });
    }

    const labelX=vertical?70:80;
    const labelY=vertical?1320:260+index*118;
    const labelWidth=vertical?940:300;
    const stepText=String(index+1).padStart(2,'0')+'  '+step.label+(step.detail?'\n'+step.detail:'');
    layers.push({
      id:'step-'+step.id,kind:'text',z:7,x:labelX,y:labelY,width:labelWidth,
      height:vertical?100:94,text:stepText,fontSize:vertical?28:24,
      fontWeight:600,letterSpacing:.3,parallax:1.15,
      translateX:[
        {t:Math.max(0,step.startSec-.2),value:vertical?0:-18},
        {t:step.startSec,value:0,ease:'ease_out'}
      ],
      opacity:opacityWindow(step.startSec,step.endSec,durationSec)
    });
  });

  (input.results??[]).slice(0,vertical?3:4).forEach((metric,index)=>{
    const reveal=Math.max(0,durationSec*.72+index*.18);
    layers.push({
      id:'result-'+metric.id,kind:'metric',z:8,
      x:vertical?70+index*305:420+index*320,y:vertical?1600:920,
      width:vertical?285:300,height:140,label:metric.label,from:0,to:metric.value,
      unit:metric.unit,decimals:metric.decimals??0,
      progress:[{t:reveal,value:0},{t:Math.min(durationSec,reveal+.8),value:1,ease:'ease_out'}],
      opacity:[{t:Math.max(0,reveal-.15),value:0},{t:reveal,value:1,ease:'ease_out'}],
      parallax:1.18,evidenceState:metric.evidenceState,sourceRefs:metric.sourceRefs
    });
  });

  layers.push({
    id:'product-name',kind:'text',z:10,x:vertical?70:80,y:vertical?70:55,
    width:vertical?940:300,height:72,text:input.productName.toUpperCase(),
    fontSize:vertical?25:22,fontWeight:700,letterSpacing:4,parallax:1.2,
    opacity:[{t:0,value:0},{t:.25,value:.9,ease:'ease_out'}]
  });

  layers.push({
    id:'headline',kind:'text',z:10,x:vertical?70:80,y:vertical?140:105,
    width:vertical?940:1680,height:150,text:input.headline,fontSize:vertical?54:58,
    fontWeight:700,letterSpacing:.5,parallax:1.22,
    translateY:[{t:0,value:18},{t:.45,value:0,ease:'ease_out'}],
    opacity:[{t:0,value:0},{t:.35,value:1,ease:'ease_out'}]
  });

  if(input.promise){
    layers.push({
      id:'promise',kind:'text',z:10,x:vertical?70:80,y:vertical?270:165,
      width:vertical?940:1200,height:90,text:input.promise,fontSize:vertical?25:23,
      fontWeight:500,letterSpacing:.2,parallax:1.2,
      opacity:[{t:.2,value:0},{t:.7,value:.76,ease:'ease_out'}]
    });
  }

  layers.push({
    id:'workflow-timeline',kind:'timeline',z:9,
    x:vertical?70:420,y:vertical?1815:1010,width:vertical?940:1390,height:50,
    startSec:0,endSec:durationSec,
    events:steps.map(step=>({
      id:step.id,t:step.startSec,label:step.label,evidenceState:'observed' as const,
      sourceRefs:input.capture.sourceRefs
    })),
    playhead:[{t:0,value:0},{t:durationSec,value:1}],parallax:1.16,
    evidenceState:'observed',sourceRefs:input.capture.sourceRefs,
    opacity:[{t:.4,value:0},{t:1,value:1,ease:'ease_out'}]
  });

  const cameraKeyframes=[
    {t:0,x:0,y:0,zoom:1},
    ...steps.map(step=>{
      const f=step.focus;
      const dx=f?(f.x+f.width/2-.5)*40:0;
      const dy=f?(f.y+f.height/2-.5)*24:0;
      return {t:Math.min(durationSec,step.startSec+.12),x:dx,y:dy,zoom:f?1.025:1.012,ease:'ease_in_out' as const};
    }),
    {t:durationSec,x:0,y:0,zoom:1.015,ease:'ease_in_out' as const}
  ];

  return {
    schema:'evercraft.fallen.visual-stage.v1',
    id:input.id,width,height,fps:30,durationSec,background:'#080b0b',
    camera:{keyframes:cameraKeyframes},layers,createdAt:new Date().toISOString()
  };
}
