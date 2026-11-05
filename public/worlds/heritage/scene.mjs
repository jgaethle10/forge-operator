// Evercraft Worlds / Below the Line: original schematic research scene.
// NO source mesh, measured position, exact settlement plan, or certified survey geometry.
export const HERITAGE_SCHEMA = 'evercraft.worlds.heritage-schematic.v1';
export const PAVLOPETRI_SCENE = Object.freeze({
  schema: HERITAGE_SCHEMA,
  id: 'pavlopetri-learning-scene-v1',
  displayName: 'Pavlopetri: Beneath the Blue',
  location: 'Laconia, Greece',
  evidenceStatus: 'confirmed_settlement',
  geometryStatus: 'original_illustrative_layout_not_georeferenced',
  waterDepth: 'Not modeled from bathymetric data',
  timeline: 'Prehistoric occupation beginning at least c. 3500 BCE; surviving remains span multiple periods',
  sources: [
    'https://digital.bsa.ac.uk/fieldwork.php?project=2127',
    'https://chronique.efa.gr/?id=1893&r=report',
    'https://impact.ref.ac.uk/casestudies/CaseStudy.aspx?Id=28862',
    'https://www.unesco.org/en/underwater-heritage/principles-2001'
  ],
  evidenceStatements: [
    'Streets, building remains, courtyards, walls and graves were mapped in three dimensions by an archaeological survey.',
    'The surviving masonry is commonly only one course high or flush with the seabed.',
    'No exact layout, wall position or modern bathymetry has been loaded into this scene.'
  ],
  markers: [
    {id:'orientation',x:0,z:13,title:'Survey orientation',kind:'documented_category',body:'Pavlopetri is a confirmed submerged prehistoric town. The geometry ahead is a newly drawn educational arrangement, not a digital twin.',source:0},
    {id:'street',x:1,z:3,title:'Streets and circulation',kind:'documented_category',body:'Archaeologists documented a network of streets and walls. This pathway conveys the idea of circulation, not Street 1 or any measured plan.',source:1},
    {id:'building',x:-10,z:-4,title:'Building foundations',kind:'documented_category',body:'Stone foundations and building complexes are documented. The arrangement and footprint you see here are illustrative and deliberately unreferenced to real survey coordinates.',source:1},
    {id:'courtyard',x:11,z:-11,title:'Open courtyards',kind:'documented_category',body:'Courtyards are documented in the archaeological record. This model uses a generic open enclosure to show the spatial idea.',source:0},
    {id:'ridge',x:21,z:-21,title:'Protective rock ridge',kind:'documented_category',body:'Survey reports describe an eastern bedrock ridge protecting the site from some wave action. Its shape and position in this learning scene are artistic, not surveyed.',source:1}
  ],
  footprints: [
    {id:'house-a',x:-11,z:-5,w:9,d:8,kind:'building'},
    {id:'house-b',x:-12,z:-18,w:11,d:9,kind:'building'},
    {id:'house-c',x:9,z:-4,w:10,d:8,kind:'building'},
    {id:'courtyard-a',x:12,z:-16,w:14,d:12,kind:'courtyard'},
    {id:'house-d',x:-3,z:-30,w:10,d:7,kind:'building'},
    {id:'house-e',x:9,z:-31,w:8,d:8,kind:'building'}
  ],
  // These are conceptual labels, not provenance claims about exact features.
  views: {
    evidence: {label:'Foundations only',description:'Low surviving stone courses: typology supported by survey, layout wholly illustrative.'},
    interpretive:{label:'Illustrative upper walls',description:'Transparent imagined architectural height. Not an archaeological observation.'}
  }
});
const F=/^[a-z][a-z0-9-]{1,44}$/;
export function validateHeritageScene(scene){
  if(!scene||scene.schema!==HERITAGE_SCHEMA||!F.test(scene.id)) throw Error('Unsupported heritage scene');
  if(scene.geometryStatus!=='original_illustrative_layout_not_georeferenced')throw Error('Must identify scene as illustrative');
  if(!Array.isArray(scene.sources)||scene.sources.length<3||scene.sources.some(s=>!/^https:\/\//.test(s)))throw Error('Missing evidence sources');
  const ids=new Set();
  if(!Array.isArray(scene.markers)||scene.markers.length<3||scene.markers.length>30)throw Error('Invalid markers');
  for(const m of scene.markers){
    if(!F.test(m.id)||ids.has(m.id)||!Number.isFinite(m.x)||!Number.isFinite(m.z)||Math.abs(m.x)>50||Math.abs(m.z)>50||!m.body||!Number.isInteger(m.source)||m.source<0||m.source>=scene.sources.length)throw Error('Invalid evidence marker');
    ids.add(m.id);
  }
  if(!Array.isArray(scene.footprints)||scene.footprints.length<1||scene.footprints.length>80)throw Error('Invalid footprints');
  for(const b of scene.footprints){
    if(!F.test(b.id)||!['building','courtyard'].includes(b.kind)||[b.x,b.z,b.w,b.d].some(v=>!Number.isFinite(v))||b.w<=2||b.d<=2||b.w>25||b.d>25||Math.abs(b.x)>50||Math.abs(b.z)>50)throw Error('Invalid schematic building');
  }
  return scene;
}
export function safePlayerPosition(x,z){
  // The scene's spaces are didactic, not a real underwater navigation route.
  return {x:Math.min(29,Math.max(-29,x)),z:Math.min(19,Math.max(-43,z))};
}
export function closestMarker(x,z,scene=PAVLOPETRI_SCENE){
  validateHeritageScene(scene);
  let best=null,dist=Infinity;
  for(const m of scene.markers){const d=Math.hypot(m.x-x,m.z-z);if(d<dist){best=m;dist=d;}}
  return {marker:best,distance:dist};
}
export function buildHeritageDrawList(scene=PAVLOPETRI_SCENE){
  validateHeritageScene(scene);
  const items=[];
  const add=(x,y,z,sx,sy,sz,color,tier='observed_type',name='')=>items.push({x,y,z,sx,sy,sz,color,tier,name});
  add(0,-.36,-13,70,.7,86,'#526c67','environment','Original procedural seabed');
  // Public seafloor simulation, NOT sampled bathymetry. Small stones are decorative and do not depict actual artifacts.
  let seed=4973;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<125;i++){const x=(next()-.5)*66,z=(next()-.5)*82-13;add(x,.012,z,.17+next()*.32,.08,.14+next()*.28,i%3?'#899c8b':'#a1aba1','environment','Decorative rock');}
  for(const b of scene.footprints){
    const isCourt=b.kind==='courtyard',wall=isCourt?'#9aaba3':'#aab5ac';
    // Open stone foundations, modeled as one course. Their placement is not the historical survey plan.
    const thickness=isCourt?.68:.82, h=isCourt?.44:.67, y=h/2;
    add(b.x-b.w/2,y,b.z,thickness,h,b.d,wall,'documented_type',b.id+' west stone line');
    add(b.x+b.w/2,y,b.z,thickness,h,b.d,wall,'documented_type',b.id+' east stone line');
    add(b.x,y,b.z-b.d/2,b.w,h,thickness,wall,'documented_type',b.id+' far stone line');
    // Intentionally leave a visibly open doorway, with a split southern wall.
    const door=2.5,side=(b.w-door)/2;
    add(b.x-(door+side)/2,y,b.z+b.d/2,side,h,thickness,wall,'documented_type',b.id+' south stone line');
    add(b.x+(door+side)/2,y,b.z+b.d/2,side,h,thickness,wall,'documented_type',b.id+' south stone line');
    if(!isCourt){
      add(b.x,1.6,b.z-b.d/2,b.w,2.35,.09,'#71bac7','interpretive',b.id+' imagined upper wall');
      add(b.x-b.w/2,1.6,b.z,.09,2.35,b.d,'#71bac7','interpretive',b.id+' imagined upper wall');
      add(b.x+b.w/2,1.6,b.z,.09,2.35,b.d,'#71bac7','interpretive',b.id+' imagined upper wall');
    }
  }
  // An abstract ridge indicates that the archaeology reports one; geometry NOT extracted from the site.
  for(let i=0;i<23;i++){const x=22+Math.sin(i*.8)*.65, z=13-i*2.3;add(x,.33,z,2.6,.65+(i%4)*.2,1.55,'#87998f','environment','Illustrative ridge');}
  // Paired marker posts are visual wayfinding only, NOT historical features.
  for(const m of scene.markers){add(m.x,.7,m.z,.14,1.4,.14,'#8cddd7','interface','Interpretive waypoint');add(m.x,1.5,m.z,.44,.18,.44,'#c9f6ed','interface','Interpretive waypoint');}
  return items;
}
validateHeritageScene(PAVLOPETRI_SCENE);
