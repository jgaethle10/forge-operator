/**
 * FALLEN RC13 -> Evercraft World Engine visual case handoff.
 * This is a source-preserving, non-authoritative import boundary, NOT a simulation.
 * Coordinates are RC13 design-screen pixels, NOT lat/lon, field yards, meters or GIS.
 */
import crypto from 'node:crypto';

const SECTORS=new Set(['response','sports']);
const EVIDENCE=new Set(['synthetic','reported','observed','modeled']);
const KINDS=new Set(['care','bridge','shelter','power','water','depot','other']);
const PRIORITIES=new Set(['high','medium','low']);
const MAX_BYTES=160_000;
const VIEW={left:35,right:865,top:140,bottom:480};

function fail(reason){throw new Error('fallen_visual_case_'+reason);}
function obj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function str(v,max){return typeof v==='string'&&v.trim().length>0&&v.length<=max;}
function coord(x,y){return typeof x==='number'&&typeof y==='number'&&Number.isFinite(x)&&Number.isFinite(y)&&x>=VIEW.left&&x<=VIEW.right&&y>=VIEW.top&&y<=VIEW.bottom;}
function id(v,max=24){return str(v,max)&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v);}
function unique(value,seen,label){if(seen.has(value))fail(label+'_duplicate');seen.add(value);}
function point(v){return Array.isArray(v)&&v.length===2&&coord(v[0],v[1]);}
function normalized(x,y){return {u:(x-VIEW.left)/(VIEW.right-VIEW.left),v:(y-VIEW.top)/(VIEW.bottom-VIEW.top)};}
function stable(v){if(Array.isArray(v))return v.map(stable);if(obj(v))return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,stable(value)]));return v;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}

/** Parse and validate exact RC13 JSON export, without accepting arbitrary extra fields as authority. */
export function importFallenVisualCase(input){
  if(typeof input==='string'&&Buffer.byteLength(input,'utf8')>MAX_BYTES)fail('too_large');
  let candidate;
  try{candidate=typeof input==='string'?JSON.parse(input):input;}catch{fail('json_invalid');}
  if(!obj(candidate)||candidate.schema!=='fallen.visual-case.v1'||!SECTORS.has(candidate.sector))fail('schema_invalid');
  if(!str(candidate.title,100)||!obj(candidate.source)||!str(candidate.source.reference,200))fail('metadata_invalid');
  if(!EVIDENCE.has(candidate.source.evidence)||typeof candidate.source.timestamp!=='string'||candidate.source.timestamp.length>50)fail('source_invalid');
  const source={reference:candidate.source.reference.trim(),timestamp:candidate.source.timestamp,evidence:candidate.source.evidence};
  const nodes=[];
  if(candidate.sector==='response'){
    if(!Array.isArray(candidate.assets)||candidate.assets.length<1||candidate.assets.length>40)fail('asset_count_invalid');
    const seen=new Set();
    for(const a of candidate.assets){
      if(!obj(a)||!id(a.id)||!str(a.name,55)||!KINDS.has(a.kind)||!PRIORITIES.has(a.priority)||!coord(a.x,a.y)||typeof a.source!=='string'||a.source.length>150)fail('asset_invalid');
      unique(a.id,seen,'asset_id');
      nodes.push({id:a.id,label:a.name,kind:a.kind,priority:a.priority,position:normalized(a.x,a.y),screen:{x:a.x,y:a.y},source_note:a.source,evidence_state:source.evidence});
    }
  }else{
    if(!Array.isArray(candidate.players)||candidate.players.length<1||candidate.players.length>22||!Array.isArray(candidate.defense)||candidate.defense.length>20)fail('role_count_invalid');
    const seen=new Set();
    for(const p of candidate.players){
      if(!obj(p)||!id(p.id,12)||!['offense','defense'].includes(p.side)||!/^#[0-9a-fA-F]{6}$/.test(p.color)||!Array.isArray(p.route)||p.route.length<2||p.route.length>18||!p.route.every(point))fail('route_invalid');
      unique(p.id,seen,'role_id');
      nodes.push({id:p.id,label:p.id,kind:'route',side:p.side,color:p.color,route:p.route.map(([x,y])=>normalized(x,y)),screen_route:p.route.map(([x,y])=>({x,y})),evidence_state:source.evidence});
    }
    for(const d of candidate.defense){
      if(!obj(d)||!id(d.id,12)||!coord(d.x,d.y))fail('defense_invalid');
      unique(d.id,seen,'role_id');
      nodes.push({id:d.id,label:d.id,kind:'defensive_marker',position:normalized(d.x,d.y),screen:{x:d.x,y:d.y},evidence_state:source.evidence});
    }
  }
  const hasViewer=candidate.viewer!==undefined;
  if(hasViewer){
    const v=candidate.viewer;
    if(!obj(v)||typeof v.percentage!=='number'||!Number.isFinite(v.percentage)||v.percentage<0||v.percentage>100||typeof v.overlay!=='boolean'||!(v.selected===null||typeof v.selected==='string'))fail('viewer_invalid');
  }
  const core={
    schema:'evercraft.world-engine.visual-evidence-handoff.v1',
    source_schema:'fallen.visual-case.v1',
    sector:candidate.sector,
    title:candidate.title.trim(),
    source,
    coordinate_space:'rc13_schematic_screen_v1',
    normalized_coordinates:'unit_screen_not_world_units',
    claims:{georeferenced:false,observed_tracking:false,validated_physics:false,live_feed:false,decision_authority:false,publication_authority:false},
    release_state:'human_review_required',
    source_rights_state:'unverified',
    nodes
  };
  return {...core,digest:hash(core)};
}

/** Integrity check never upgrades rights, decision, publication, or physical validation. */
export function verifyFallenVisualHandoff(handoff){
  if(!obj(handoff)||handoff.schema!=='evercraft.world-engine.visual-evidence-handoff.v1'||typeof handoff.digest!=='string')return false;
  const {digest,...core}=handoff;
  if(core.release_state!=='human_review_required'||core.source_rights_state!=='unverified'||core.coordinate_space!=='rc13_schematic_screen_v1'||core.normalized_coordinates!=='unit_screen_not_world_units')return false;
  if(!obj(core.claims)||Object.values(core.claims).some(value=>value!==false))return false;
  return digest===hash(core);
}

export const FALLEN_RC13_VISUAL_CASE_CONTRACT=Object.freeze({
  inputSchema:'fallen.visual-case.v1',outputSchema:'evercraft.world-engine.visual-evidence-handoff.v1',
  maxJsonBytes:MAX_BYTES,unit:'rc13_screen_pixels',sourceAuthority:'unverified',publicationAuthority:false,decisionAuthority:false
});
