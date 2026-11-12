/**
 * Reproducible, OFFLINE geological research packet. No prospect ranking,
 * site eligibility, owner harvesting, or title/environment/permit clearance.
 */
import {validateWgsProvenance} from './land-context.mjs';

const CLASSES=new Set(['Demonstrated','Inferred','Speculative']);
export const PACKET_GATE_KEYS=Object.freeze([
 'mineral_or_material_rights','surface_ownership_and_access',
 'county_land_use_and_zoning','environmental_and_tribal_constraints',
 'field_sampling_and_material_quality','logistics_and_haul_economics',
 'engineering_and_geotechnical_review','reclamation_and_permits'
]);

function safeExternalContext(input,sourceHash){
 if(!input||input.source_wgs_sha256!==sourceHash||
    input.status!=='sample_polygon_intersections_verified'||
    !Array.isArray(input.rows)||input.all_wgs_polygons_checked!==false){
  return {state:'not_verified_for_this_source',byId:new Map(),sampleCount:0};
 }
 const byId=new Map();
 for(const row of input.rows){
  const id=row?.wgs_resource_object_id;
  if(!Number.isSafeInteger(id)||byId.has(id))return {
   state:'invalid_sample',byId:new Map(),sampleCount:0
  };
  const matches={};
  for(const kind of ['zoning','dnr','habitat']){
   const value=row.results?.[kind];
   matches[kind]=value?.state==='publisher_polygon_intersection_count'&&
      Number.isSafeInteger(value.matching_source_features)&&
      value.matching_source_features>=0?
      {state:'verified_source_intersection_count',count:value.matching_source_features}:
      {state:'not_verified',count:null};
  }
  byId.set(id,matches);
 }
 return {state:'partial_8_polygon_source_sample',byId,sampleCount:byId.size};
}
function assertPacketInputs({wgs,receipt,dossiers}){
 const prov=validateWgsProvenance({source:wgs,receipt,county:'Grant'});
 if(dossiers?.schema!=='evercraft.evermaps.aggregate-research-dossiers.v1'||
    dossiers.county!=='Grant'||dossiers.source_sha256!==prov.source_sha256||
    dossiers.commercial_eligibility!=='none_verified'||
    !Array.isArray(dossiers.records)||
    dossiers.record_count!==dossiers.records.length){
  throw Error('Missing or mismatched WGS research dossiers');
 }
 const ids=new Set();
 const features=new Map(wgs.features.map(f=>[f.properties.OBJECTID,f]));
 const expected=wgs.features.filter(f=>CLASSES.has(f.properties.CLASSIFICATION)).length;
 if(dossiers.records.length!==expected)throw Error('Research dossier completeness mismatch');
 for(const row of dossiers.records){
  const oid=row?.source_object_id;
  if(!Number.isSafeInteger(oid)||ids.has(oid)||!features.has(oid)||
    row.geological_evidence?.source_sha256!==prov.source_sha256||
    row.geological_evidence?.classification!==features.get(oid).properties.CLASSIFICATION||
    row.commercial_recommendation_allowed!==false||
    row.legal_mining_eligibility!=='not_determined'||
    !PACKET_GATE_KEYS.every(k=>row.evidence_gates?.[k]==='unverified'))
    throw Error('WGS dossier malformed, modified, or ineligible for safe packet');
  ids.add(oid);
 }
 return prov;
}
export function buildEvermapsEvidencePacket({wgs,receipt,dossiers,polygonSample,
 land,planning,permits,sourceHealth,now=()=>new Date().toISOString()}={}){
 const prov=assertPacketInputs({wgs,receipt,dossiers});
 const context=safeExternalContext(polygonSample,prov.source_sha256);
 const rows=dossiers.records.map(row=>({
  id:row.id,object_id:row.source_object_id,
  published_geology_classification:row.geological_evidence.classification,
  published_commodity:row.geological_evidence.commodity,
  acreage_as_reported_by_wgs:row.geological_evidence.resource_acreage_reported,
  thickness_as_reported_by_wgs:row.geological_evidence.thickness_classification,
  legal_mining_eligibility:'not_determined',
  zoning_currentness:'unverified_2018_map_only',
  mineral_title:'unverified',
  access:'unverified',environmental_clearance:'unverified',
  engineering_economics:'unverified',
  polygon_overlay:context.byId.has(row.source_object_id)?
    {state:'publisher_intersection_counts_only',results:context.byId.get(row.source_object_id)}:
    {state:'not_sampled',results:null},
  commercial_recommendation_allowed:false
 }));
 const stateOf=(record,states)=>states.includes(record?.state||record?.status)?'verified':'unverified';
 return {
  schema:'evercraft.evermaps.offline-geological-research-packet.v1',
  county:'Grant',generated_at:now(),
  packet_status:'verified_wgs_geology_research_only',
  research_wgs_sha256:prov.source_sha256,
  wgs_complete_geology_polygon_count:prov.source_features,
  geological_records_exported:rows.length,
  source_health:{
   current_run_overall:sourceHealth?.status||'not_provided',
   full_dependency_refresh_complete:sourceHealth?.required_research_dependencies_complete===true,
   land_context:stateOf(land,['source_metadata_and_coarse_counts_verified']),
   planning_context:stateOf(planning,['coarse_sources_verified']),
   permit_point_context:stateOf(permits,['point_geometry_overlay_verified']),
   polygon_sample:context.state,
   polygon_sample_count:context.sampleCount
  },
  source_links:{
   wgs:'https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Aggregate_Resources/FeatureServer/11',
   grant_county:'https://www.grantcountywa.gov/172/Geographic-Information-Systems-GIS',
   critical_areas:'https://www.grantcountywa.gov/DocumentCenter/View/591/Chapter-2408--Critical-Areas-and-Cultural-Resource-Lands-PDF'
  },
  site_recommendations_authorized:false,certified_reserves:false,
  public_mining_rights_verified:false,
  caveat:'Historical/regional geology is not mineral rights, zoning permission, habitat clearance, physical access, currently operating mines or project economics. This packet is research evidence only.',
  rows
 };
}
export function evidencePacketCsv(packet){
 if(packet?.schema!=='evercraft.evermaps.offline-geological-research-packet.v1')
  throw Error('Expected provenance-gated research packet');
 const headers=['WGS_OBJECTID','PUBLISHED_CLASSIFICATION','PUBLISHED_COMMODITY',
  'WGS_REPORTED_ACREAGE','ZONING_COUNT_SAMPLE_ONLY','DNR_COUNT_SAMPLE_ONLY',
  'PHS_COUNT_SAMPLE_ONLY','MINERAL_TITLE','ZONING_CURRENT','ENVIRONMENTAL_CLEARANCE','ELIGIBILITY'];
 const escapeCsv=v=>{
  if(v===null||v===undefined)return '""';
  let s=String(v);
  // Spreadsheet formula injection guard for all untrusted publisher attribute values.
  if(/^[\s\x00-\x1f]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 };
 const lines=[headers.map(escapeCsv).join(',')];
 for(const x of packet.rows){
  const count=kind=>x.polygon_overlay.state==='publisher_intersection_counts_only'?
   x.polygon_overlay.results?.[kind]?.count:null;
  lines.push([
   x.object_id,x.published_geology_classification,x.published_commodity,
   x.acreage_as_reported_by_wgs,count('zoning'),count('dnr'),count('habitat'),
   x.mineral_title,x.zoning_currentness,x.environmental_clearance,
   x.legal_mining_eligibility
  ].map(escapeCsv).join(','));
 }
 return lines.join('\r\n')+'\r\n';
}
function escapeHtml(v){
 return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
export function evidencePacketHtml(packet){
 if(packet?.schema!=='evercraft.evermaps.offline-geological-research-packet.v1'||
    packet.site_recommendations_authorized!==false)throw Error('Research packet invariant missing');
 const options=['All','Demonstrated','Inferred','Speculative'];
 const rowMarkup=packet.rows.map(x=>{
  const c=x.polygon_overlay;
  const format=k=>c.state==='publisher_intersection_counts_only'&&
   c.results?.[k]?.state==='verified_source_intersection_count'?
   c.results[k].count:'not sampled';
  return '<tr data-class="'+escapeHtml(x.published_geology_classification)+'" data-search="'+
   escapeHtml([x.object_id,x.published_geology_classification,x.published_commodity].join(' ').toLowerCase())+'">'+
   '<td>'+escapeHtml(x.object_id)+'</td><td>'+escapeHtml(x.published_geology_classification)+'</td>'+
   '<td>'+escapeHtml(x.published_commodity||'not reported')+'</td>'+
   '<td>'+escapeHtml(x.acreage_as_reported_by_wgs??'not reported')+'</td>'+
   '<td>'+escapeHtml(format('zoning'))+'</td><td>'+escapeHtml(format('dnr'))+'</td>'+
   '<td>'+escapeHtml(format('habitat'))+'</td>'+
   '<td>Unverified</td></tr>';
 }).join('\n');
 const stat=packet.source_health;
 const statuses=[
  ['WGS source polygons',packet.wgs_complete_geology_polygon_count],
  ['Research dossiers',packet.geological_records_exported],
  ['Polygon overlay sample',stat.polygon_sample_count],
  ['Complete refresh',stat.full_dependency_refresh_complete?'Verified':'Incomplete']
 ];
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>EverMaps | Grant County Geological Research</title><style>'+
 ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#091321;color:#eaf2fb;font:15px system-ui,sans-serif}'+
 'header{padding:32px max(22px,5vw);border-bottom:1px solid #293951;background:linear-gradient(130deg,#111f31,#07131f)}'+
 'h1{margin:6px 0 14px;font-size:clamp(25px,4vw,43px);letter-spacing:-.04em}p{max-width:960px;line-height:1.55;color:#afc1d1}'+
 'main{padding:22px max(16px,5vw) 64px}a{color:#82ccf6}.eyebrow{font-size:11px;letter-spacing:.16em;color:#62ddc4;font-weight:700}'+
 '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:20px 0}'+
 '.stat{border:1px solid #2a3b50;background:#142437;border-radius:12px;padding:15px}.stat b{font-size:24px;display:block;margin-top:7px}'+
 '.callout{border:1px solid #425977;border-left:4px solid #86c8eb;border-radius:10px;padding:14px;margin-bottom:20px;line-height:1.5}'+
 '.controls{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}input,select{background:#182c3e;color:#eef5fd;border:1px solid #43576a;border-radius:8px;padding:12px;min-width:190px}'+
 '.scroll{overflow:auto;border:1px solid #2d3b4a;border-radius:12px}table{border-collapse:collapse;min-width:960px;width:100%}'+
 'th,td{text-align:left;padding:11px 13px;border-bottom:1px solid #263c4c;font-size:13px}th{position:sticky;top:0;background:#1c3146}'+
 'tbody tr:nth-child(even){background:#0e2030}small{color:#9bb2c6}.foot{margin-top:24px;font-size:13px}'+
 '</style></head><body><header><div class="eyebrow">EVERCRAFT / EVERMAPS / RESEARCH EVIDENCE</div>'+
 '<h1>Grant County geological intelligence</h1>'+
 '<p>A fully offline, source-verified geological evidence index. WGS classification does not establish extraction rights, operating mines, reserve quantities, or economic viability.</p>'+
 '<small>WGS SHA-256: '+escapeHtml(packet.research_wgs_sha256)+'</small></header><main><section class="stats">'+
 statuses.map(([k,v])=>'<div class="stat"><small>'+escapeHtml(k)+'</small><b>'+escapeHtml(v)+'</b></div>').join('')+
 '</section><div class="callout"><strong>Evidence boundary.</strong> All mineral title, land access, current zoning, habitat clearance and feasibility gates are unverified. The zoning source is from 2018. The eight-polygon overlay, where available, reports GIS source-feature intersection counts only. Missing observations remain <strong>not sampled</strong>, never zero. No mining-site recommendation is authorized.</div>'+
 '<div class="controls"><input id="query" type="search" placeholder="Search WGS ID, class, commodity" aria-label="Search source features">'+
 '<select id="classification" aria-label="Filter geology classification">'+
 options.map(o=>'<option value="'+o+'">'+o+'</option>').join('')+
 '</select><small id="count" aria-live="polite"></small></div>'+
 '<div class="scroll"><table><thead><tr>'+
 ['WGS ID','WGS class','Commodity','Published acres','Zoning hits*','DNR hits*','Habitat hits*','Legal title'].map(v=>'<th>'+v+'</th>').join('')+
 '</tr></thead><tbody>'+rowMarkup+'</tbody></table></div>'+
 '<div class="foot"><p>*Source-publisher geometry intersection counts for a nonrepresentative sample of eight polygons. WDFW public PHS data is generalized and incomplete; it is not a no-habitat clearance check. No source owner, permittee or species records were exported.</p>'+
 '<p>Sources: <a href="'+escapeHtml(packet.source_links.wgs)+'">Washington Geological Survey</a> · '+
 '<a href="'+escapeHtml(packet.source_links.grant_county)+'">Grant County GIS</a> · '+
 '<a href="'+escapeHtml(packet.source_links.critical_areas)+'">Grant County critical-areas code</a></p>'+
 '<small>Generated '+escapeHtml(packet.generated_at)+'. Original source records are packaged separately. Fully local filtering, no tracking or network requests by this page.</small></div></main>'+
 '<script>const q=document.querySelector("#query"),c=document.querySelector("#classification"),rows=Array.from(document.querySelectorAll("tbody tr")),total=document.querySelector("#count");function filter(){const term=q.value.toLowerCase().trim(),cls=c.value;let n=0;for(const r of rows){const show=(cls==="All"||r.dataset.class===cls)&&r.dataset.search.includes(term);r.hidden=!show;if(show)n++}total.textContent=n+" matching records"}q.addEventListener("input",filter);c.addEventListener("change",filter);filter()</script></body></html>';
}
