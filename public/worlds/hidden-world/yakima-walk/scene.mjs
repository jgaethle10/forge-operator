// Evercraft Hidden World · Yakima historical streetscape research gallery.
// Original interpretive model. The positions, streetscape proportions, unverified neighbors and
// gallery route are imaginary World-units, NOT a parcel survey or access to subterranean spaces.
export const YAKIMA_WALK_SCHEMA='evercraft.hidden-world.yakima-streetscape.v1';
export const YAKIMA_SCENE=Object.freeze({
 schema:YAKIMA_WALK_SCHEMA,id:'yakima-streetscape-inquiry-v1',
 displayName:'Yakima: The Street Above the Stories',
 evidenceStatus:'historic_building_and_photo_documented',
 geometryStatus:'original_illustrative_streetscape_not_georeferenced',
 undergroundConnectionsVerified:false,
 spatialCoordinates:'imaginary_museum_units_not_geographic',
 sources:[
  'https://npgallery.nps.gov/GetAsset/34270517-7a19-422d-a0a6-3070adf1befa',
  'https://lange.spokanelibrary.org/items/show/5659',
  'https://www.yvl.org/services/special-collections-and-archive-services/maps-and-atlases/',
  'https://yvmuseum.org/news/our-library-archives'
 ],
 markers:[
  {id:'orientation',x:-5,z:15,title:'What is real in this scene?',source:0,
   body:'This is a freely arranged heritage exhibit, not a measured 1899 Yakima block. The Lund Building and specific changes in its facade are documented. The street and all surrounding structures here are artistic staging, with no surveyed dimensions or accurate building positions.'},
  {id:'lund-1899',x:5,z:2,title:'1899: the Lund Building',source:0,
   body:'The National Register nomination documents a two-story, load-bearing local-stone building completed in 1899, first used as the Alfalfa Saloon. The original entrance was at its truncated corner. Our stone facade and corner display are visually interpretive, not a measured historic elevation.'},
  {id:'retail-1910',x:5,z:-11,title:'Circa 1910: storefront changes',source:0,
   body:'Around 1910 the saloon became the Chicago Clothing Company. The nomination records large plate-glass retail windows and says the cut corner remained at the upper story after the storefront changed. The proportions, shop signs and windows seen here are original illustrations.'},
  {id:'postcard',x:-5,z:-22,title:'1905–1915: an avenue photograph',source:1,
   body:'F. H. Newell photographed Yakima Avenue looking east from the railroad tracks, dated broadly 1905–1915 in Spokane Public Library’s archive. It is a public-domain archival image. This environment has not been aligned to that photograph or its camera viewpoint.'},
  {id:'archives',x:-4,z:-32,title:'How to solve the unknowns',source:2,
   body:'Historic Sanborn fire-insurance maps and the Yakima Valley Museum architectural collections may help identify period footprints, land use, dates and building relationships. Individual plans and their licensing must be examined before any precise digital twin is claimed.'},
  {id:'doorways',x:4,z:-38,title:'The doorway evidence is not a tunnel map',source:0,
   body:'The 1983 Lund nomination notes doorways connected its interior to two neighboring buildings. It does not say those connections were below grade, identify their alignments, or establish a public underground network. No tunnel entrances or below-ground paths are depicted here.'}
 ],
 views:{
 evidence:{label:'Historical category view',description:'Historic claims are sourced; all model geometry remains original illustration.'},
 interpretive:{label:'Illustrative historic facades',description:'Additional upper story and shop details are imagined; not survey evidence.'}
 }
});
const ID=/^[a-z][a-z0-9-]{1,44}$/;
export function validateYakimaScene(scene){
 if(!scene||scene.schema!==YAKIMA_WALK_SCHEMA||!ID.test(scene.id))throw Error('yakima_scene_schema_invalid');
 if(scene.geometryStatus!=='original_illustrative_streetscape_not_georeferenced'||scene.undergroundConnectionsVerified!==false)throw Error('unverified_geometry_or_tunnel_boundary');
 if(!Array.isArray(scene.sources)||scene.sources.length<4||scene.sources.some(s=>!/^https:\/\//.test(s)))throw Error('archival_sources_missing');
 if(!Array.isArray(scene.markers)||scene.markers.length!==6)throw Error('expected_six_history_stops');
 const ids=new Set();
 for(const m of scene.markers){
  if(!ID.test(m.id)||ids.has(m.id)||!Number.isFinite(m.x)||!Number.isFinite(m.z)||Math.abs(m.x)>45||Math.abs(m.z)>45||!m.body||!m.title||!Number.isInteger(m.source)||m.source<0||m.source>=scene.sources.length)throw Error('marker_invalid');
  ids.add(m.id);
 }
 return scene;
}
export function safeYakimaPosition(x,z){
 return {x:Math.min(28,Math.max(-28,x)),z:Math.min(19,Math.max(-43,z))};
}
export function closestYakimaMarker(x,z,scene=YAKIMA_SCENE){
 validateYakimaScene(scene);
 let marker=null,distance=Infinity;
 for(const m of scene.markers){const d=Math.hypot(m.x-x,m.z-z);if(d<distance){distance=d;marker=m;}}
 return {marker,distance};
}
export function buildYakimaDrawList(scene=YAKIMA_SCENE){
 validateYakimaScene(scene);
 const items=[];
 const add=(x,y,z,sx,sy,sz,color,tier='illustrative',name='')=>items.push({x,y,z,sx,sy,sz,color,tier,name});
 // Fictional exhibition avenue. The walkable strip is intentionally clear at -3 < X < 3.
 add(0,-.43,-12,70,.86,86,'#77726b','environment','exhibit ground');
 add(0,-.05,-12,9,.08,78,'#b2a48d','environment','visitor promenade');
 for(let z=17;z>-48;z-=3.2){
  add(0,-.005,z,8.5,.026,.08,'#8f8676','environment','illustrative paving seam');
 }
 for(const side of [-1,1]){
  for(let z=17;z>-47;z-=5.6){
   add(side*4.95,.06,z,.23,.10,.65,'#d4c4a8','environment','visitor edge in conceptual street');
  }
 }
 // Staged, unmeasured Lund-inspired stone facade. This is not a historic footprint.
 const lx=15,lz=-9;
 add(lx,3.4,lz,14,6.8,16,'#988e79','documented_category','two-story stone building type');
 add(lx,7.1,lz,14.7,.65,16.7,'#4f504c','illustrative','fictional roof');
 add(lx-7.1,3.45,lz,.34,7.1,16.4,'#c2ad83','illustrative','public-facing stone facade relief');
 add(lx-7.5,6.7,lz,.2,.25,16.2,'#ebd4a5','illustrative','simple projecting cornice');
 // Decorative stone relief and door motif. Do not treat these as verified opening locations.
 for(let z=lz-7;z<=lz+7;z+=2.4){
  add(lx-7.32,3.7,z,.12,.12,1.9,'#baac8f','illustrative','non-surveyed stone course');
 }
 // Period-dependent doorway/canopy geometry lives in periods.mjs,
 // so a saloon door is not erroneously displayed during the later retail era.
 for(let z=lz-5;z<=lz+5;z+=5){
  add(lx-7.37,5.6,z,.10,1.4,2.0,'#354b56','documented_category','symbolic arched-window bay');
  add(lx-7.43,6.33,z,.16,.13,2.30,'#dfd0ac','illustrative','arch suggestion');
  add(lx-7.44,2.65,z,.12,2.1,2.55,'#537684','interpretive','imagined plate-glass retail bay');
  add(lx-7.52,1.24,z,.14,.55,2.6,'#59473c','interpretive','imagined storefront panel');
 }
 // A second stone-facing lane is artistic context, not proof of specific adjacent buildings.
 add(-15,3.0,-14,15,6,24,'#9c8873','illustrative','unmeasured historic-inspired facade');
 add(-15,6.18,-14,15.5,.52,24.4,'#554d47','illustrative','imaginary roof line');
 for(let z=-23;z<=-3;z+=5){
  add(-7.3,3.4,z,.14,2,2.3,'#394e5b','illustrative','imagined commercial upper window');
  add(-7.35,1.25,z,.14,1.6,3.1,'#5d6d6e','interpretive','imagined street-level shop glazing');
  add(-7.5,2.35,z,.12,.19,3.45,'#d1b388','interpretive','decorative shop fascia');
 }
 // Not a survey: gallery corridor intentionally widens into an archive plaza.
 add(-14,.035,-34,11,.13,11,'#b6a78e','environment','archive research plaza');
 add(-14,1.25,-36,8,2.5,.65,'#354c54','illustrative','exhibit information wall');
 for(const [x,z] of [[-15,-34],[-13,-34],[-11,-34]]){
  add(x,1.65,z,.95,.70,.12,'#eed3a8','interface','museum source illustration panel');
 }
 // Period atmosphere, without conflating actual tracks with this made-up route.
 for(const x of [-24,-22]){
  add(x,.008,-12,.12,.12,70,'#665b51','environment','theatrical rail-line motif');
 }
 for(let z=18;z>-47;z-=3){
  add(-23,.01,z,3,.08,.25,'#907b62','environment','stylized railroad tie');
 }
 // Original gaslamp-esque display objects. Their positions have no historical significance.
 for(const z of [13,0,-13,-26,-39]){
  add(5.7,2,z,.18,4,.18,'#404b4d','environment','illustrative lamp mast');
  add(5.7,4.14,z,.78,.57,.78,'#d8bd80','interface','warm lamp');
  add(5.7,4.6,z,.88,.12,.88,'#4c4f4b','environment','lamp cap');
 }
 for(const m of scene.markers){
  add(m.x,.60,m.z,.18,1.2,.18,'#62b8ad','interface','historical research beacon, not physical waypoint');
  add(m.x,1.36,m.z,.55,.19,.55,'#efd1a2','interface','historical research indicator');
 }
 return items;
}
validateYakimaScene(YAKIMA_SCENE);
