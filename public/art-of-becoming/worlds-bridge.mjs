// Non-networking adapter from private Becoming Worlds facility layouts to the
// *existing* Evercraft World Engine V1 entity model used by public/worlds/world-bridge.mjs.
// Important: This is an explicit export/projection contract, NOT a cloud publishing action.
// Never include check-in dates, streaks, conditions, user names, or goal IDs in this scene.
import {WORLD_CATALOG,worldSummary} from './world-engine.mjs';

export const BECOMING_WORLDS_SCENE_SCHEMA='evercraft.world-engine.world.v1';
const position=(x,y,z)=>({x,y,z});
const colliders={
  stadium:[15,5,12],arena:[12,6,10],academy:[8,5,7],
  'concert-hall':[12,7,10],'opera-house':[14,7,11],amphitheater:[13,2,9],
  observatory:[7,8,7],village:[10,6,9],cabin:[5,3,4],
  default:[6,4,5],
};
const dims=(kind)=>colliders[kind]||colliders.default;
const slug=(text)=>String(text).replace(/[^a-z0-9-]/g,'').slice(0,48);
function nodeForFacility(f,mode){
  const catalog=WORLD_CATALOG[mode].find(x=>x.kind===f.kind);
  const halfExtents=dims(f.kind);
  return {
    id:'facility:'+slug(f.id),
    name:catalog.name,
    transform:{position:position(f.x*36,0,f.y*36)},
    collider:{type:'box',halfExtents:position(...halfExtents)},
    tags:['becoming','facility','static',mode,f.kind],
    properties:{visualSource:'original_procedural',facilityKind:f.kind,level:f.level,previewOnly:true},
  };
}
export function toEvercraftWorldEngineScene(habitState,goal,mode){
  const summary=worldSummary(habitState,goal,mode);
  const entities=[
    {id:'becoming:founders-ground',name:'Founders Ground',
      transform:{position:position(0,0,0)},
      collider:{type:'box',halfExtents:position(6,.5,6)},
      tags:['becoming','founders','static'],
      properties:{visualSource:'original_procedural',previewOnly:true}},
    ...summary.buildings.map(f=>nodeForFacility(f,mode)),
  ];
  return {
    schema:BECOMING_WORLDS_SCENE_SCHEMA,
    id:'becoming-'+mode+'-local-preview',
    version:1,tickRateHz:60,gravity:position(0,-9.81,0),
    ground:{enabled:true,height:0},
    entities,
    metadata:{
      producer:'evercraft-becoming-worlds-export',
      sourceSchema:'evercraft.becoming.world-plot.v1',
      expressionMode:mode,productionAuthoritative:false,
      collaborationEnabled:false,
      containsCheckInHistory:false,containsHealthGoals:false,
      // Callers must obtain consent before using any future share/publish route.
      allowedDestination:'local_engine_preview_only',
    },
  };
}
