import { createHash } from 'node:crypto';

// Offline SVG drawing-sheet renderer. No network fetches, third-party basemaps,
// historical customer data, permit drawings, or external publication.
const ROLES = new Set(['site_concept', 'area_context']);
const BASIS = new Set(['source_derived', 'modeled', 'proposed']);
const COLORS = {
  parcel:'#168a87', existing:'#748aa1', parking:'#55718e', roadway:'#8aa0b8',
  charger:'#12aca2', equipment:'#ec9651', access:'#3b83d0', context:'#ced8e3',
  vegetation:'#87a898', trench:'#d98758'
};
const string = v => typeof v === 'string' ? v.trim() : '';
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const point = v => Array.isArray(v) && v.length === 2 && v.every(finite);
function ringsIntersect(a,b,c,d) {
  const cross = (p,q,r) => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]);
  const p=cross(a,b,c), q=cross(a,b,d), r=cross(c,d,a), s=cross(c,d,b);
  return p*q < 0 && r*s < 0;
}
function shapeValid(feature) {
  const g=feature?.geometry;
  if (!g || !['polygon','polyline'].includes(g.type) || !Array.isArray(g.points)) return false;
  if (g.points.length < (g.type==='polygon'?3:2) || g.points.length > 600 || !g.points.every(point)) return false;
  if (g.type==='polygon') {
    const p=g.points; let area=0;
    for (let i=0;i<p.length;i++) area += p[i][0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*p[i][1];
    if (Math.abs(area) < 0.01) return false;
    for(let i=0;i<p.length;i++) for(let j=i+1;j<p.length;j++) {
      if(j===i+1 || (i===0 && j===p.length-1)) continue;
      if(ringsIntersect(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length])) return false;
    }
  }
  return true;
}
function inside(pt, polygon) {
  const p=polygon; let result=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const xi=p[i][0], yi=p[i][1], xj=p[j][0], yj=p[j][1];
    if (((yi>pt[1]) !== (yj>pt[1])) && pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi) result=!result;
  }
  return result;
}
const allInside = (pts,boundary)=>pts.every(p=>inside(p,boundary));
const unique = arr => [...new Set(arr)];
function centroid(pts) {return pts.reduce((a,p)=>[a[0]+p[0]/pts.length,a[1]+p[1]/pts.length],[0,0]);}
const width=1600,height=1080, map={x:58,y:173,w:1100,h:742};
function text(x,y,body,size=15,color='#263850',weight=400,anchor='start') {
  return `<text x="${x}" y="${y}" font-family="Inter,Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(body)}</text>`;
}
function pathOf(points,tx,ty,close=false) {return points.map((p,i)=>(i?'L':'M')+tx(p[0]).toFixed(2)+','+ty(p[1]).toFixed(2)).join(' ')+(close?' Z':'');}
function hatch(id, color) {return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="10" stroke="${color}" stroke-opacity=".25" stroke-width="2"/></pattern>`;}

export function auditEvDrawingModel(model) {
  if(!model || typeof model!=='object' || Array.isArray(model)) throw new Error('drawing_model_object_required');
  const holds=[], cautions=[];
  if(!string(model.project?.id) || !string(model.project?.name)) holds.push('project_identity_missing');
  if(!string(model.site?.address) || !string(model.site?.parcel_id)) holds.push('canonical_address_or_parcel_missing');
  if(model.coordinates?.units!=='local_meters') holds.push('local_meters_projection_required');
  if(model.coordinates?.north_verified!==true) cautions.push('north_orientation_not_verified');
  if(model.coordinates?.metric_scale_verified!==true) cautions.push('scale_not_verified_show_not_to_scale');
  if(model?.demonstration!==true && model?.independent_source_review!==true) holds.push('independent_source_review_required');
  if(model?.demonstration!==true && model?.lineage?.independent_cleared!==true) holds.push('independent_asset_clearance_required');
  const features=Array.isArray(model.features)?model.features:[];
  if(!features.length || features.length>160) holds.push('feature_count_invalid');
  const ids=new Set(), parcels=[];
  for(const f of features) {
    if(!string(f?.id) || ids.has(f.id)) holds.push('duplicate_or_missing_feature_id');
    ids.add(f?.id);
    if(!shapeValid(f)) { holds.push('invalid_geometry:'+string(f?.id)); continue; }
    if(!BASIS.has(f.basis)) holds.push('feature_basis_missing:'+f.id);
    if(!COLORS[f.kind]) holds.push('unrecognized_feature_class:'+f.id);
    if(f.kind==='parcel' && f.geometry.type==='polygon') parcels.push(f);
    if(f.basis==='source_derived' && !string(f.source_id)) holds.push('source_derived_feature_missing_reference:'+f.id);
    if(f.basis==='proposed' && ['parcel','roadway','vegetation'].includes(f.kind)) holds.push('proposed_feature_misclassified:'+f.id);
    if(f.basis==='modeled') cautions.push('modeled_geometry_requires_field_verification');
  }
  if(parcels.length!==1) holds.push('exactly_one_parcel_polygon_required');
  const sourceIds=new Set((Array.isArray(model.sources)?model.sources:[]).map(s=>s.id));
  for(const f of features) if(f.basis==='source_derived' && !sourceIds.has(f.source_id)) holds.push('source_not_in_register:'+f.id);
  if(model.demonstration!==true) for(const source of (model.sources||[])) {
    if(source.rights!=='cleared_independent' || !/^https:\/\/[^/\s]+/.test(string(source.url))) holds.push('source_rights_or_url_unverified:'+string(source.id));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(string(source.observed_date))) holds.push('source_vintage_missing:'+string(source.id));
  }
  const parcel=parcels[0]?.geometry?.points;
  if(parcel) for(const f of features) {
    if(['charger','equipment','access','trench'].includes(f.kind) && !allInside(f.geometry.points,parcel)) holds.push('proposed_feature_outside_parcel:'+f.id);
  }
  if(!features.some(f=>f.kind==='charger' && f.basis==='proposed')) holds.push('proposed_charger_geometry_missing');
  if(model.site?.field_survey_verified!==true) cautions.push('site_dimensions_and_existing_conditions_require_survey');
  if(model.site?.utility_capacity_verified!==true) cautions.push('utility_service_capacity_not_verified');
  if(model.site?.accessible_route_verified!==true) cautions.push('accessible_route_and_grades_not_verified');
  return {
    schema:'evercraft.ev-opportunity.drawing-audit.v1',state:holds.length?'HOLD':'INTERNAL_PREVIEW',
    hold_reasons:unique(holds),verification_notes:unique(cautions),feature_count:features.length,
    model_sha256:digest(model),releasable:false,permit_ready:false,construction_ready:false,
    limitations:'Declared sources and local-metric geometry are not independent proof of site reality. Rendering is internal conceptual illustration only.'
  };
}

export function renderEvConceptSheet(model,{role='site_concept'}={}) {
  if(!ROLES.has(role)) throw new Error('unsupported_sheet_role');
  const qa=auditEvDrawingModel(model);
  if(qa.state==='HOLD') return {svg:null,qa,role};
  const features=model.features.filter(f=>shapeValid(f));
  const all=features.flatMap(f=>f.geometry.points);
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const spanX=Math.max(5,maxX-minX),spanY=Math.max(5,maxY-minY);
  const zoom=Math.min((map.w-110)/spanX,(map.h-110)/spanY);
  const dx=(map.w-spanX*zoom)/2,dy=(map.h-spanY*zoom)/2;
  const tx=x=>map.x+dx+(x-minX)*zoom, ty=y=>map.y+map.h-dy-(y-minY)*zoom;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(model.project.name)} ${role.replace('_',' ')} conceptual site drawing"><defs>
  ${hatch('modeled','#7d95a8')}${hatch('proposed','#159b92')}
  <clipPath id="mapclip"><rect x="${map.x}" y="${map.y}" width="${map.w}" height="${map.h}"/></clipPath>
  </defs><rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="23" y="23" width="1554" height="1033" fill="none" stroke="#132e48" stroke-width="3"/>
  <rect x="23" y="23" width="1554" height="112" fill="#112b43"/>
  ${text(58,73,'EVERCRAFT  /  EV INFRASTRUCTURE INTELLIGENCE',27,'#f3f7fa',700)}
  ${text(58,110,role==='site_concept'?'PRELIMINARY SITE CONCEPT':'AREA CONTEXT + EVIDENCE PLAN',16,'#73e2d6',700)}
  ${text(1536,73,'CONCEPT DESIGN  ·  INTERNAL REVIEW',16,'#eff6fa',700,'end')}
  ${text(1536,108,'NOT FOR CONSTRUCTION',16,'#ffb07a',700,'end')}
  <rect x="${map.x}" y="${map.y}" width="${map.w}" height="${map.h}" fill="#f6f9fb" stroke="#9eafc2" stroke-width="2"/>`;
  if(model.demonstration===true) svg += `<text x="610" y="540" font-family="Arial,sans-serif" font-size="67" font-weight="800" fill="#142d46" opacity=".095" text-anchor="middle" transform="rotate(-23 610 540)">SYNTHETIC DEMONSTRATION</text>`;
  // Clipped metric guide grid; grid coordinates are not surveyed coordinates.
  svg += `<g clip-path="url(#mapclip)">`;
  const grid=20; const gstartX=Math.floor(minX/grid)*grid,gendX=Math.ceil(maxX/grid)*grid;
  const gstartY=Math.floor(minY/grid)*grid,gendY=Math.ceil(maxY/grid)*grid;
  if((gendX-gstartX)/grid<150 && (gendY-gstartY)/grid<150) {
    for(let x=gstartX;x<=gendX;x+=grid) svg += `<path d="M${tx(x).toFixed(1)} ${map.y}V${map.y+map.h}" stroke="#d9e3ec" stroke-width="1" stroke-dasharray="3 6"/>`;
    for(let y=gstartY;y<=gendY;y+=grid) svg += `<path d="M${map.x} ${ty(y).toFixed(1)}H${map.x+map.w}" stroke="#d9e3ec" stroke-width="1" stroke-dasharray="3 6"/>`;
  }
  const order={context:0,roadway:1,vegetation:2,parcel:3,existing:4,parking:5,access:6,trench:7,equipment:8,charger:9};
  const sorted=[...features].sort((a,b)=>(order[a.kind]??99)-(order[b.kind]??99));
  for(const f of sorted) {
    const poly=f.geometry.type==='polygon';
    const color=COLORS[f.kind];
    const stroke=f.kind==='parcel'?'#0d766f':color;
    const fill=f.kind==='parcel'?'#e1f4f0':f.kind==='roadway'?'#dce3eb':f.kind==='vegetation'?'#e6f2e9':color;
    const opacity=f.kind==='parcel'?'.22':f.basis==='proposed'?'.47':'.23';
    svg += `<path d="${pathOf(f.geometry.points,tx,ty,poly)}" fill="${poly?fill:'none'}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${f.kind==='parcel'?3.7:f.kind==='charger'?3.8:2.4}" ${f.basis==='modeled'?'stroke-dasharray="8 6"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if(f.basis==='modeled' && poly) svg += `<path d="${pathOf(f.geometry.points,tx,ty,true)}" fill="url(#modeled)"/>`;
    if(role==='site_concept' && f.kind==='charger' && poly) {
      const c=centroid(f.geometry.points);svg += `<circle cx="${tx(c[0]).toFixed(1)}" cy="${ty(c[1]).toFixed(1)}" r="11" fill="#0c746e"/>`;
      svg += text(tx(c[0]),ty(c[1])+5,'EV',12,'#fff',800,'middle');
    }
    if(f.label && (role==='site_concept'||['parcel','roadway','context'].includes(f.kind))) {
      const c=centroid(f.geometry.points);
      svg += text(tx(c[0]),ty(c[1])-14,f.label,Math.min(15,Math.max(10,zoom*1.8)),'#284761',600,'middle');
    }
  }
  svg += `</g>`;
  const sideX=1180;
  svg += `<rect x="${sideX}" y="173" width="356" height="742" fill="#f8fafc" stroke="#a1b2c5" stroke-width="1.5"/>
  <rect x="${sideX}" y="173" width="356" height="47" fill="#e7f0f4"/>${text(sideX+19,203,'DRAWING CONTROL',16,'#1b3b56',700)}
  ${text(sideX+19,246,'PROJECT',11,'#648197',700)}
  ${text(sideX+19,269,model.project.name.slice(0,33),17,'#1a354c',700)}
  ${text(sideX+19,306,'SITE ADDRESS',11,'#648197',700)}
  ${text(sideX+19,329,model.site.address.slice(0,42),13,'#1a354c',600)}
  ${text(sideX+19,367,'PARCEL REFERENCE',11,'#648197',700)}
  ${text(sideX+19,390,model.site.parcel_id.slice(0,40),14,'#1a354c',600)}
  <path d="M${sideX+18} 411H${sideX+335}" stroke="#bccdd9"/>
  ${text(sideX+19,439,'LEGEND  /  EVIDENCE CLASS',12,'#1a354c',700)}`;
  const legend=[['parcel','Parcel boundary'],['existing','Source-derived features'],['parking','Parking context'],['charger','Proposed charging'],['equipment','Proposed equipment'],['access','Proposed accessible route'],['trench','Conceptual conduit / trench']];
  legend.forEach(([kind,label],i)=>{
    const y=470+i*34;
    svg += `<rect x="${sideX+21}" y="${y-12}" width="22" height="14" fill="${COLORS[kind]}" fill-opacity=".55" stroke="${COLORS[kind]}"/>${text(sideX+52,y,label,13,'#344e62')}`;
  });
  svg += `<path d="M${sideX+18} 709H${sideX+335}" stroke="#bccdd9"/>
  ${text(sideX+19,737,'SOURCE + PROJECTION',12,'#1a354c',700)}
  ${text(sideX+19,762,model.demonstration?'Synthetic test geometry':(model.sources?.[0]?.name||'Independent source review').slice(0,39),12,'#476078')}
  ${text(sideX+19,788,'Local metric coordinates (non-geodetic)',12,'#476078')}
  ${text(sideX+19,817,'Scale: '+(model.coordinates.metric_scale_verified?'metric drawing units':'NOT TO SCALE'),12,'#476078')}
  ${text(sideX+19,846,model.coordinates.north_verified?'North: verified in source':'North: NOT VERIFIED',12,'#476078')}
  ${text(sideX+19,886,'NOT FOR PERMITTING OR BUILD',12,'#bd603b',700)}`;
  // A visible reference bar is intentionally absent when metric scale hasn't been verified.
  svg+=`<rect x="58" y="932" width="1478" height="96" fill="#f3f7fa" stroke="#9db0c2"/>
  ${text(74,958,'EV OPPORTUNITY FABRIC  ·  SOURCE-TRACEABLE CONCEPT',13,'#16384c',700)}
  ${text(74,984,'Existing conditions require independent field verification. Proposed features are conceptual and may change.',13,'#4d6479')}
  ${text(74,1007,'No landowner approval, utility capacity, interconnection, accessibility compliance or construction authority is implied.',12,'#6c7e90')}
  <path d="M1196 932V1028" stroke="#a2b7c7"/>
  ${text(1213,958,role==='site_concept'?'SITE CONCEPT  |  EV-101':'AREA CONTEXT  |  EV-102',14,'#1b3b56',700)}
  ${text(1213,983,'REV A  ·  INTERNAL DEMONSTRATION',12,'#58728a')}
  ${text(1213,1007,'SOURCE HASH: '+qa.model_sha256.slice(0,14),11,'#58728a')}
  </svg>`;
  return {schema:'evercraft.ev-opportunity.rendered-sheet.v1',role,svg,qa,format:'image/svg+xml',page:{width,height},commercial_release:false};
}
