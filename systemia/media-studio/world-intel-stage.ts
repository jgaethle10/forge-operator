import type {
  EvidenceState,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';
import { EVERCRAFT_VISUAL_THEME_V1 } from './visual-theme.js';

export interface WorldIntelMediaInput {
  sourcePath: string;
  mediaKind: 'image' | 'video';
  evidenceState: EvidenceState;
  sourceRefs: string[];
  fit?: 'cover' | 'contain';
}

export interface WorldIntelRouteInput {
  id: string;
  points: Array<{ lat:number; lon:number }>;
  evidenceState: EvidenceState;
  sourceRefs: string[];
  width?: number;
}

export interface WorldIntelPointInput {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  radius?: number;
  intensity?: number;
  pulse?: boolean;
  evidenceState: EvidenceState;
  sourceRefs: string[];
}

export interface WorldIntelMetricInput {
  id: string;
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  evidenceState: EvidenceState;
  sourceRefs: string[];
}

export interface WorldIntelTimelineInput {
  id: string;
  t: number;
  label: string;
  evidenceState: EvidenceState;
  sourceRefs: string[];
}

export interface WorldIntelStageInput {
  id: string;
  headline: string;
  subhead?: string;
  durationSec?: number;
  aspectRatio?: '16:9' | '9:16';
  setPlate?: WorldIntelMediaInput;
  subjectMedia?: WorldIntelMediaInput;
  mapPlate?: WorldIntelMediaInput;
  map?: {
    projection?: 'equirectangular' | 'mercator';
    centerLat?: number;
    centerLon?: number;
    zoom?: number;
    routes?: WorldIntelRouteInput[];
    points?: WorldIntelPointInput[];
  };
  metrics?: WorldIntelMetricInput[];
  timeline?: {
    startSec: number;
    endSec: number;
    events: WorldIntelTimelineInput[];
  };
}

function dims(aspect:'16:9'|'9:16'='16:9'){
  return aspect==='9:16'
    ? {width:1080,height:1920}
    : {width:1920,height:1080};
}

function refs(items:Array<{sourceRefs:string[]}>|undefined){
  return [...new Set((items??[]).flatMap(item=>item.sourceRefs))];
}

function predominantState(
  items:Array<{evidenceState:EvidenceState}>|undefined,
  fallback:EvidenceState='public_source',
):EvidenceState{
  const rows=items??[];
  if(!rows.length) return fallback;
  const counts=new Map<EvidenceState,number>();
  for(const item of rows) counts.set(item.evidenceState,(counts.get(item.evidenceState)??0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
}

export function compileWorldIntelStage(input:WorldIntelStageInput):VisualStage{
  if(!input.id?.trim()) throw new Error('World-intelligence stage requires id.');
  if(!input.headline?.trim()) throw new Error('World-intelligence stage requires headline.');

  const durationSec=Math.max(6,Math.min(90,input.durationSec??18));
  const {width,height}=dims(input.aspectRatio);
  const vertical=height>width;
  const layers:VisualLayer[]=[];

  if(input.setPlate){
    layers.push({
      id:'set-plate',
      kind:'media',
      z:0,
      x:0,y:0,width,height,
      sourcePath:input.setPlate.sourcePath,
      mediaKind:input.setPlate.mediaKind,
      fit:input.setPlate.fit??'cover',
      parallax:.55,
      scale:[{t:0,value:1.02},{t:durationSec,value:1.08,ease:'ease_in_out'}],
      evidenceState:input.setPlate.evidenceState,
      sourceRefs:input.setPlate.sourceRefs
    });
  }

  if(input.subjectMedia){
    layers.push({
      id:'subject-media',
      kind:'media',
      z:2,
      x:vertical?70:80,
      y:vertical?320:190,
      width:vertical?940:920,
      height:vertical?660:620,
      sourcePath:input.subjectMedia.sourcePath,
      mediaKind:input.subjectMedia.mediaKind,
      fit:input.subjectMedia.fit??'cover',
      parallax:.9,
      perspectivePx:1600,
      rotateYDeg:vertical?0:-5,
      translateX:[
        {t:0,value:vertical?0:-80},
        {t:durationSec*.18,value:0,ease:'ease_out'},
        {t:durationSec*.52,value:vertical?0:-110,ease:'ease_in_out'}
      ],
      scale:[
        {t:0,value:1.05},
        {t:durationSec*.45,value:1,ease:'ease_out'},
        {t:durationSec*.7,value:.88,ease:'ease_in_out'}
      ],
      opacity:[
        {t:0,value:0},
        {t:.35,value:1,ease:'ease_out'},
        {t:durationSec*.55,value:1},
        {t:durationSec*.72,value:.26,ease:'ease_in_out'}
      ],
      evidenceState:input.subjectMedia.evidenceState,
      sourceRefs:input.subjectMedia.sourceRefs
    });
  }

  const mapX=vertical?70:950;
  const mapY=vertical?1040:170;
  const mapW=vertical?940:860;
  const mapH=vertical?650:650;

  if(input.mapPlate){
    layers.push({
      id:'map-plate',
      kind:'media',
      z:3,
      x:mapX,y:mapY,width:mapW,height:mapH,
      sourcePath:input.mapPlate.sourcePath,
      mediaKind:input.mapPlate.mediaKind,
      fit:'cover',
      parallax:1.06,
      perspectivePx:1600,
      rotateYDeg:vertical?0:5,
      opacity:[
        {t:0,value:0},
        {t:durationSec*.35,value:0},
        {t:durationSec*.48,value:1,ease:'ease_out'}
      ],
      evidenceState:input.mapPlate.evidenceState,
      sourceRefs:input.mapPlate.sourceRefs
    });
  }

  if(input.map){
    const mapRefs=[
      ...refs(input.map.routes),
      ...refs(input.map.points)
    ];
    const mapItems=[
      ...(input.map.routes??[]),
      ...(input.map.points??[])
    ];
    layers.push({
      id:'world-geo',
      kind:'geo',
      z:4,
      x:mapX,y:mapY,width:mapW,height:mapH,
      projection:input.map.projection??'mercator',
      centerLat:input.map.centerLat??15,
      centerLon:input.map.centerLon??0,
      zoom:input.map.zoom??1.15,
      grid:!input.mapPlate,
      parallax:1.09,
      perspectivePx:1600,
      rotateYDeg:vertical?0:5,
      opacity:[
        {t:0,value:0},
        {t:durationSec*.37,value:0},
        {t:durationSec*.5,value:1,ease:'ease_out'}
      ],
      routes:(input.map.routes??[]).map(route=>({
        ...route,
        progress:[
          {t:durationSec*.45,value:0},
          {t:durationSec*.82,value:1,ease:'ease_in_out'}
        ]
      })),
      points:input.map.points??[],
      evidenceState:predominantState(mapItems),
      sourceRefs:mapRefs
    });
  }

  const metrics=input.metrics??[];
  metrics.slice(0,vertical?3:4).forEach((metric,index)=>{
    const metricWidth=vertical?290:250;
    const spacing=vertical?305:270;
    const x=vertical?70+index*spacing:90+index*spacing;
    const y=vertical?1720:850;
    layers.push({
      id:`metric-${metric.id}`,
      kind:'metric',
      z:7,
      x,y,width:metricWidth,height:130,
      label:metric.label,
      from:0,to:metric.value,
      unit:metric.unit,
      decimals:metric.decimals??0,
      parallax:1.15,
      progress:[
        {t:durationSec*.56,value:0},
        {t:durationSec*.72,value:1,ease:'ease_out'}
      ],
      opacity:[
        {t:durationSec*.52,value:0},
        {t:durationSec*.62,value:1,ease:'ease_out'}
      ],
      evidenceState:metric.evidenceState,
      sourceRefs:metric.sourceRefs
    });
  });

  if(input.timeline){
    layers.push({
      id:'intel-timeline',
      kind:'timeline',
      z:8,
      x:vertical?70:90,
      y:vertical?1850:1000,
      width:vertical?940:1740,
      height:50,
      startSec:input.timeline.startSec,
      endSec:input.timeline.endSec,
      events:input.timeline.events,
      playhead:[
        {t:durationSec*.48,value:0},
        {t:durationSec*.94,value:1,ease:'linear'}
      ],
      opacity:[
        {t:durationSec*.45,value:0},
        {t:durationSec*.55,value:1,ease:'ease_out'}
      ],
      evidenceState:predominantState(input.timeline.events),
      sourceRefs:refs(input.timeline.events)
    });
  }

  layers.push({
    id:'headline',
    kind:'text',
    z:10,
    x:vertical?70:90,
    y:vertical?80:60,
    width:vertical?940:1500,
    height:110,
    text:input.headline,
    fontSize:vertical?54:62,
    fontWeight:700,
    letterSpacing:1.4,
    parallax:1.22,
    translateY:[
      {t:0,value:22},
      {t:.55,value:0,ease:'ease_out'}
    ],
    opacity:[
      {t:0,value:0},
      {t:.35,value:1,ease:'ease_out'}
    ]
  });

  if(input.subhead){
    layers.push({
      id:'subhead',
      kind:'text',
      z:10,
      x:vertical?70:95,
      y:vertical?190:135,
      width:vertical?940:1300,
      height:70,
      text:input.subhead,
      fontSize:vertical?24:25,
      fontWeight:500,
      letterSpacing:.4,
      parallax:1.2,
      opacity:[
        {t:.25,value:0},
        {t:.8,value:.82,ease:'ease_out'}
      ]
    });
  }

  return {
    schema:'evercraft.fallen.visual-stage.v1',
    id:input.id,
    width,height,fps:30,durationSec,
    background:input.setPlate
      ? EVERCRAFT_VISUAL_THEME_V1.palette.background
      : EVERCRAFT_VISUAL_THEME_V1.palette.surfaceRaised,
    theme:EVERCRAFT_VISUAL_THEME_V1,
    camera:{
      keyframes:[
        {t:0,x:0,y:0,zoom:1},
        {t:durationSec*.42,x:vertical?0:35,y:8,zoom:1.025,ease:'ease_in_out'},
        {t:durationSec*.78,x:vertical?0:55,y:15,zoom:1.055,ease:'ease_in_out'},
        {t:durationSec,x:0,y:0,zoom:1.02,ease:'ease_in_out'}
      ]
    },
    layers,
    createdAt:new Date().toISOString()
  };
}
