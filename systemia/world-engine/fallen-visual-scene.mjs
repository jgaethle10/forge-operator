/**
 * RC13 evidence handoff -> native Evercraft World Engine visual scene.
 * Presentation geometry only. Screen coordinates are NOT geodetic, metric or tracking data.
 */
import crypto from 'node:crypto';
import {verifyFallenVisualHandoff} from './fallen-visual-case.mjs';

const MATERIALS=[
  ['panel','#0b1b2a'],['high','#f27c65'],['medium','#f0c66d'],['low','#68c9ad'],
  ['route','#efd49a'],['role','#8bd8f6'],['defense','#8b9ec9'],
  ['field','#143a39'],['endzone','#0c242e'],['sideline','#4d938e'],
  ['fieldline','#386c6b'],['hashmark','#327170'],['crossbar','#152f43'],
  ['terrain','#132b39'],['water','#164e64'],['coastline','#2b8290'],
  ['contour','#275366'],['grid','#244554'],['hud','#1a3b4b'],
  ['accent','#46c5c4'],['trim','#f7d998'],['deep','#081622']
].map(([id,hex])=>({
  id:'rc13:'+id,model:'unlit',
  baseColor:{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255,a:1},
  doubleSided:true
}));
const GEOMETRY={
  schema:'evercraft.world-engine.geometry.v1',id:'rc13:unit-quad',
  primitive:'triangles',
  positions:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],
  normals:[0,0,1,0,0,1,0,0,1,0,0,1],
  uvs:[0,0,1,0,1,1,0,1],
  indices:[0,1,2,0,2,3]
};
function stable(v){
  if(Array.isArray(v))return v.map(stable);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,stable(value)]));
  return v;
}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function point(p,z=0){return{x:2*p.u-1,y:1-2*p.v,z};}
function entity(id,xy,width,height,material,properties,tags){
  return {
    id,transform:{position:xy,rotationDeg:{x:0,y:0,z:0},scale:{x:width,y:height,z:1}},
    renderable:{geometryRef:GEOMETRY.id,materialId:'rc13:'+material,layerMask:1},
    tags:['fallen','schematic_visual','not_georeferenced',...tags],
    properties
  };
}

/**
 * Presentation-only stage dressing. These shapes carry no geographic data,
 * field measurements, real observations, live states or emergency authority.
 * All motion remains controlled by the canonical World Engine event ledger.
 */
function addGraphicStage(entities,sector,common){
  const source={...common,source_kind:'synthetic_editorial_stage',source_rights_state:'unverified',stage_not_evidence:true};
  const prop=(kind)=>({...source,stage_kind:kind});
  const quad=(id,x,y,z,w,h,material,kind,rotation=0)=>{
    const shape=entity('rc13:stage:'+sector+':'+id,{x,y,z},w,h,material,prop(kind),['synthetic_editorial_stage']);
    shape.transform.rotationDeg.z=rotation;
    entities.push(shape);
  };
  // A clear abstract command frame, kept away from the actual input nodes.
  quad('top-header',0,.985,-.105,3.16,.045,'hud','frame');
  quad('bottom-footer',0,-.99,-.105,3.16,.035,'hud','frame');
  quad('left-rule',-1.58,0,-.102,.013,1.91,'accent','frame');
  quad('right-rule',1.58,0,-.102,.013,1.91,'accent','frame');
  quad('header-accent',-1.21,.985,-.09,.48,.016,'trim','frame');

  if(sector==='sports'){
    // Deliberately abstract training-board geometry, not a regulation field.
    quad('pitch',0,-.015,-.125,2.55,1.78,'field','schematic_training_surface');
    quad('endzone-left',-1.13,-.015,-.105,.28,1.74,'endzone','schematic_training_surface');
    quad('endzone-right',1.13,-.015,-.105,.28,1.74,'endzone','schematic_training_surface');
    quad('touchline-top',0,.865,-.08,2.55,.015,'sideline','schematic_training_line');
    quad('touchline-bottom',0,-.895,-.08,2.55,.015,'sideline','schematic_training_line');
    quad('boundary-left',-1.265,-.015,-.08,.015,1.78,'sideline','schematic_training_line');
    quad('boundary-right',1.265,-.015,-.08,.015,1.78,'sideline','schematic_training_line');
    for(let i=-5;i<=5;i++){
      const x=i*.205;
      quad('training-vertical-'+(i+5),x,-.015,-.075,i===0?.012:.007,1.73,
        i===0?'sideline':'fieldline','schematic_training_line');
      for(const side of [-1,1]){
        quad('hash-'+(i+5)+'-'+side,x,side*.31,-.067,.035,.012,'hashmark','schematic_training_hash');
      }
    }
    // Visual subdivisions and command-panel accents are decorative only.
    quad('midfield-banner',0,-.01,-.073,.53,.02,'sideline','schematic_training_line');
    quad('metric-column-left',-1.43,.09,-.085,.06,1.4,'hud','decorative_legend');
    quad('metric-column-right',1.43,.09,-.085,.06,1.4,'hud','decorative_legend');
    for(let i=0;i<5;i++){
      quad('left-meter-'+i,-1.43,-.55+i*.21,-.075,.042,.105,
        i>2?'accent':'fieldline','decorative_legend');
      quad('right-meter-'+i,1.43,-.55+i*.21,-.075,.042,.105,
        i<2?'trim':'fieldline','decorative_legend');
    }
  }else{
    // Diagrammatic blue terrain bands; nothing is measured or flood modeled.
    quad('chart',0,-.01,-.127,2.89,1.80,'terrain','synthetic_chart_surface');
    for(let i=0;i<=12;i++){
      const x=-1.38+i*.23;
      quad('vertical-grid-'+i,x,-.01,-.105,.006,1.76,'grid','nongeospatial_grid');
    }
    for(let i=0;i<=8;i++){
      const y=-.87+i*.214;
      quad('horizontal-grid-'+i,0,y,-.104,2.86,.006,'grid','nongeospatial_grid');
    }
    // A flowing design ribbon, not an actual river or inundation outline.
    const bands=[
      {offset:-.17,width:.46,material:'water',z:-.081},
      {offset:.105,width:.025,material:'coastline',z:-.066},
      {offset:-.445,width:.025,material:'coastline',z:-.066}
    ];
    for(const [layer,band] of bands.entries()){
      const pts=Array.from({length:13},(_,i)=>{
        const x=-1.48+i*2.96/12;
        return{x,y:band.offset+.18*Math.sin(x*2.4+.5)};
      });
      for(let i=0;i<pts.length-1;i++){
        const a=pts[i],b=pts[i+1];
        const dx=b.x-a.x,dy=b.y-a.y;
        quad('design-ribbon-'+layer+'-'+i,(a.x+b.x)/2,(a.y+b.y)/2,band.z,
          Math.hypot(dx,dy)+.006,band.width,band.material,'nongeospatial_design_ribbon',
          Math.atan2(dy,dx)*180/Math.PI);
      }
    }
    for(let i=0;i<5;i++){
      const x=-1.34+i*.66;
      quad('contour-top-'+i,x,.69+.07*Math.sin(i*.9),-.06,.51,.012,'contour','decorative_contour',-12+i*3);
      quad('contour-bottom-'+i,x,-.74+.06*Math.cos(i),-.06,.49,.012,'contour','decorative_contour',8-i*2);
    }
    quad('left-scale-rail',-1.49,0,-.059,.024,1.72,'hud','decorative_legend');
    quad('right-scale-rail',1.49,0,-.059,.024,1.72,'hud','decorative_legend');
    for(let i=0;i<6;i++){
      quad('right-indicator-'+i,1.49,-.7+i*.24,-.048,.016,.092,
        i>=4?'trim':'accent','decorative_legend');
    }
  }
}

/** Imports only verified handoffs and keeps all authored scene data non-authoritative. */
export function sceneFromFallenVisualHandoff(handoff){
  if(!verifyFallenVisualHandoff(handoff))throw new Error('fallen_visual_scene_handoff_unverified');
  if(!['response','sports'].includes(handoff.sector)||!Array.isArray(handoff.nodes)||handoff.nodes.length>450)throw new Error('fallen_visual_scene_sector_invalid');
  const common={
    source_reference:handoff.source.reference,
    evidence_state:handoff.source.evidence,
    source_rights_state:'unverified',
    input_digest:handoff.digest,
    coordinate_space:'rc13_schematic_screen_v1',
    decision_authority:false,
    publication_authority:false
  };
  const entities=[
    {
      id:'rc13:camera',
      transform:{position:{x:0,y:0,z:4},rotationDeg:{x:0,y:0,z:0}},
      camera:{projection:{type:'orthographic',orthoHeight:2.17},near:.1,far:50,layerMask:1},
      tags:['fallen','presentation_camera']
    },
    entity('rc13:background',{x:0,y:0,z:-.15},3.32,2.06,'panel',common,['presentation_surface'])
  ];
  addGraphicStage(entities,handoff.sector,common);
  const ids=new Set();
  for(const n of handoff.nodes){
    if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id))throw new Error('fallen_visual_scene_node_invalid');
    ids.add(n.id);
    const props={...common,source_id:n.id,source_label:String(n.label||n.id),source_kind:n.kind};
    if(handoff.sector==='response'){
      if(!n.position||!Number.isFinite(n.position.u)||!Number.isFinite(n.position.v))throw new Error('fallen_visual_scene_position_invalid');
      const color=n.priority==='high'?'high':n.priority==='medium'?'medium':'low';
      entities.push(entity('rc13:facility:'+n.id,point(n.position,.03),.06,.06,color,{...props,priority:n.priority,source_note:n.source_note},['response','facility']));
    }else if(n.kind==='route'){
      if(!Array.isArray(n.route)||n.route.length<2)throw new Error('fallen_visual_scene_route_invalid');
      const pts=n.route.map(p=>point(p,.02));
      const material=n.side==='defense'?'defense':'route';
      for(let i=0;i<pts.length-1;i++){
        const [a,b]=[pts[i],pts[i+1]],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        if(!Number.isFinite(length)||length<1e-9)throw new Error('fallen_visual_scene_segment_degenerate');
        const segment=entity('rc13:route:'+n.id+':'+i,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:.02},length,.015,material,
          {...props,segment_index:i,authored_color:n.color,route_role:n.side},['sports','route_segment']);
        segment.transform.rotationDeg.z=Math.atan2(dy,dx)*180/Math.PI;
        entities.push(segment);
      }
      entities.push(entity('rc13:player:'+n.id,point(n.route[0],.05),.055,.055,n.side==='defense'?'defense':'role',
        {...props,authored_color:n.color,route_role:n.side},['sports','player_marker']));
    }else{
      if(!n.position||!Number.isFinite(n.position.u)||!Number.isFinite(n.position.v))throw new Error('fallen_visual_scene_defense_invalid');
      entities.push(entity('rc13:defender:'+n.id,point(n.position,.05),.055,.055,'defense',props,['sports','defender']));
    }
  }
  if(handoff.sector==='response'){
    entities.push(entity(
      'rc13:scenario-front',{x:0,y:.94,z:.015},2.05,.012,'high',
      {...common,source_kind:'synthetic_scenario_phase_indicator',scenario_validated:false},
      ['response','authored_phase_indicator','not_hydraulic_model']
    ));
  }
  const world={
    schema:'evercraft.world-engine.world.v1',
    id:'fallen:visual:'+handoff.digest.slice(0,18),
    version:1,tickRateHz:60,gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      materials:MATERIALS,initialCameraEntityId:'rc13:camera',
      clearColor:{r:.025,g:.04,b:.065}
    },
    entities,
    metadata:{
      origin:'fallen.visual-case.v1',
      source_handoff_digest:handoff.digest,
      case_sector:handoff.sector,case_title:handoff.title,
      scene_units:'abstract_schematic_not_meters',
      coordinate_space:'rc13_schematic_screen_v1',
      source_rights_state:'unverified',
      publication_authority:false,decision_authority:false,
      geospatial_authority:false,tracking_authority:false,
      physically_validated:false,live_data:false,
      release_state:'human_review_required'
    }
  };
  const core={
    schema:'evercraft.world-engine.visual-scene-projection-receipt.v1',
    sourceHandoffDigest:handoff.digest,
    worldId:world.id,
    worldDefinitionDigest:hash(world),
    geometryDigest:hash(GEOMETRY),
    renderableCount:world.entities.filter(e=>e.renderable).length,
    release_state:'human_review_required',
    decision_authority:false,publication_authority:false
  };
  return{world,geometryAssets:[structuredClone(GEOMETRY)],receipt:{...core,digest:hash(core)}};
}
export function verifyFallenVisualSceneReceipt(receipt,world,geometryAssets){
  if(!receipt||receipt.schema!=='evercraft.world-engine.visual-scene-projection-receipt.v1'||!Array.isArray(geometryAssets)||geometryAssets.length!==1)return false;
  const {digest,...core}=receipt;
  return typeof digest==='string'&&core.worldDefinitionDigest===hash(world)&&core.geometryDigest===hash(geometryAssets[0])&&
    core.sourceHandoffDigest===world?.metadata?.source_handoff_digest&&core.release_state==='human_review_required'&&
    core.publication_authority===false&&core.decision_authority===false&&
    world.metadata.publication_authority===false&&world.metadata.decision_authority===false&&
    world.metadata.scene_units==='abstract_schematic_not_meters'&&digest===hash(core);
}
