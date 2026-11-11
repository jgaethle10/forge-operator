// Evercraft Worlds / Hidden World · conceptual Titan I gallery scene.
// All coordinates are LOCAL, invented museum units: not field coordinates, a facility plan, a route, or surveyed engineering.
export const TITAN_GALLERY_SCHEMA='evercraft.hidden-world.titan-gallery.v1';
export const TITAN_SCENE=Object.freeze({
 schema:TITAN_GALLERY_SCHEMA,id:'titan-1962-gallery-v1',
 displayName:'Titan I: Beneath the Launch Field',
 evidenceStatus:'historic_system_categories_documented',
 geometryStatus:'original_invented_museum_geometry_not_georeferenced',
 coordinatesPolicy:'No actual complex coordinates, entrances, or real tunnel paths.',
 sources:[
  'https://www.historylink.org/File/10158',
  'https://www.govinfo.gov/content/pkg/GOVPUB-D103-PURL-gpo107257/pdf/GOVPUB-D103-PURL-gpo107257.pdf',
  'https://www.losangeles.spaceforce.mil/Portals/16/documents/AFD-060912-023.pdf'
 ],
 markers:[
  {id:'orientation',x:0,z:13,title:'History, not a site map',source:0,body:'Welcome to an invented educational museum inspired by the Washington Titan I program. This walkable geometry does not correspond to Odessa, Warden, Quincy/Royal City, or any other real installation.'},
  {id:'silo-idea',x:-10,z:4,title:'A hardened silo concept',source:0,body:'Washington hosted three Titan I complexes, each with three missiles. HistoryLink describes roughly 160-foot-deep silos. These sculptural chamber walls are not the correct scale or physical design of a historic silo.'},
  {id:'lift-idea',x:10,z:0,title:'Why Titan I had to rise',source:2,body:'Titan I historically used an elevator-style silo-to-surface launch concept. This exhibit illustrates the historical distinction at a high level, without reconstructing mechanics or operation.'},
  {id:'crew',x:6,z:-16,title:'The people underground',source:0,body:'A hardened underground launch-control room housed people conducting Cold War duties. This imagined gallery alcove is not an accurate control room or equipment configuration.'},
  {id:'interconnected',x:-8,z:-31,title:'Interdependent infrastructure',source:1,body:'Historical engineering studies describe support structures and underground connections. The corridor you see is an invented museum path: never a real passageway, access route or current facility map.'}
 ],
 views:{
 evidence:{label:'Historic ideas',description:'Category labels are sourced. All spatial geometry remains an original invented museum.'},
 interpretive:{label:'Show illustrated superstructure',description:'Added illuminated walls are fiction used to convey the scale of buried infrastructure.'}
 }
});
const ID=/^[a-z][a-z0-9-]{1,44}$/;
export function validateTitanScene(scene){
 if(!scene||scene.schema!==TITAN_GALLERY_SCHEMA||!ID.test(scene.id))throw Error('invalid_titan_gallery_schema');
 if(scene.geometryStatus!=='original_invented_museum_geometry_not_georeferenced')throw Error('unverified_geometry_disclosure_missing');
 if(!Array.isArray(scene.sources)||scene.sources.length!==3||scene.sources.some(s=>!s.startsWith('https://')))throw Error('source_links_missing');
 if(!Array.isArray(scene.markers)||scene.markers.length<5||scene.markers.length>20)throw Error('markers_missing');
 const ids=new Set();
 for(const m of scene.markers){
  if(!ID.test(m.id)||ids.has(m.id)||[m.x,m.z].some(v=>!Number.isFinite(v)||Math.abs(v)>45)||!m.title||!m.body||!Number.isInteger(m.source)||m.source<0||m.source>=scene.sources.length)throw Error('invalid_marker');
  ids.add(m.id);
 }
 return scene;
}
export function safeGalleryPosition(x,z){return {x:Math.min(29,Math.max(-29,x)),z:Math.min(19,Math.max(-43,z))};}
export function closestGalleryMarker(x,z,scene=TITAN_SCENE){
 validateTitanScene(scene);
 let marker=null,distance=Infinity;
 for(const m of scene.markers){const d=Math.hypot(m.x-x,m.z-z);if(d<distance){marker=m;distance=d;}}
 return {marker,distance};
}
export function buildTitanDrawList(scene=TITAN_SCENE){
 validateTitanScene(scene);
 const items=[];const add=(x,y,z,sx,sy,sz,color,tier='illustrative',name='')=>items.push({x,y,z,sx,sy,sz,color,tier,name});
 // A virtual interpretive gallery, physically impossible to confuse with a precise launch-complex floor plan.
 add(0,-.48,-12,69,.96,88,'#4c5658','environment','abstract underground gallery slab');
 add(0,-.01,-10,6,.10,78,'#987f65','environment','symbolic visitor floor ribbon');
 add(0,7.4,-12,69,.9,88,'#364850','environment','invented enclosed museum ceiling');
 // Gallery lighting and ceiling beams are scenic art, not components of a real hardened complex.
 for(let i=0;i<13;i++){
  const z=14-i*5.1;
  add(0,6.85,z,56,.48,.65,'#63737a','environment','fictional gallery ceiling rib');
  add(-3.15,6.35,z,1.4,.18,.85,'#dcc99d','interface','artistic luminous ceiling panel');
  add(3.15,6.35,z,1.4,.18,.85,'#dcc99d','interface','artistic luminous ceiling panel');
  add(0,.07,z,4.9,.07,.18,'#d2b98e','environment','interpretive floor graduation');
 }

 add(0,.01,17,10,.16,8,'#b69c78','environment','orientation podium floor');
 // Invented wall-and-light relief, not source engineering or accessibility information.
 for(let i=0;i<18;i++){const z=15-i*3.2;add(-4.0,.10,z,.18,.18,.92,'#d8c18c','environment','museum floor edge');add(4.0,.10,z,.18,.18,.92,'#d8c18c','environment','museum floor edge');}
 for(let i=0;i<11;i++){const z=13-i*5;add(-28,.55,z,.50,1.1,1.75,'#53636b','environment','sculptural strata pillar');add(28,.55,z,.50,1.1,1.75,'#53636b','environment','sculptural strata pillar');}
 // The three rings represent a category of underground structures, not the three real silos' arrangement.
 for(const [i,cx,cz] of [[0,-17,-6],[1,17,-6],[2,-17,-30]]){
  const size=6.8;
  for(const sign of [-1,1]){
    add(cx+sign*size,1.58,cz,.85,3.15,size*2,'#8e938b','documented_category','symbolic shaft wall');
    add(cx,1.58,cz+sign*size,size*2,3.15,.85,'#8e938b','documented_category','symbolic shaft wall');
  }
  add(cx,-.19,cz,10,.2,10,'#273c45','environment','symbolic chamber floor');
  add(cx,.1,cz,2.5,.5,2.5,'#c5ac83','illustrative','museum maquette base');
  add(cx,.93,cz,1.5,1.15,1.5,'#ad8777','illustrative','nonmechanical exhibit sculpture');
  add(cx,2.35,cz,1.2,1.7,1.2,'#c2ac8c','interpretive','illustrated silhouette, not a missile drawing');
  add(cx,3.13,cz,1.45,.15,1.45,'#e6d09c','interpretive','illustrated silhouette');
  for(let n=0;n<6;n++){const px=cx+(n-2.5)*2;add(px,.12,cz-size+.4,.45,.24,.3,'#d8b277','environment','display light');}
 }
 // A generic museum room depicts documented presence of underground control, without recreating control equipment.
 add(11,.16,-29,16,.32,12,'#667678','environment','conceptual crew gallery');
 for(const x of [4,18])add(x,1.7,-29,.75,3.4,12,'#60747b','documented_category','abstract gallery boundary');
 add(11,1.1,-34,9,1.2,.5,'#a49f88','illustrative','historical information panel');
 for(const x of [7,11,15])add(x,1.7,-33.55,1.25,.62,.1,'#e0c58d','interface','interpretive display panel');
 // Additional upper wall silhouettes are explicitly optional fiction.
 for(const x of [-27,27])add(x,3.55,-14,.30,5.6,72,'#74b9bb','interpretive','imagined outer wall');
 add(0,3.55,-49,54,5.6,.3,'#74b9bb','interpretive','imagined background wall');
 // Readable light sculptures indicate research waypoints, NOT entrance beacons or real navigational directions.
 for(const m of scene.markers){
  add(m.x,.56,m.z,.28,1.12,.28,'#61dad4','interface','museum research waypoint');
  add(m.x,1.32,m.z,.78,.20,.78,'#e5dbad','interface','museum research waypoint');
 }
 return items;
}
validateTitanScene(TITAN_SCENE);
