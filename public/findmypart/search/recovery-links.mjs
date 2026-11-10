// User-initiated discovery routes, not retrieved evidence or verified matches.
const providers=[
 {id:'original',name:'Original replacement',suffix:' OEM original replacement part'},
 {id:'interchange',name:'Interchange & supersession',suffix:' replacement interchange cross reference'},
 {id:'salvage',name:'Salvage & donor equipment',suffix:' used salvage donor parts'},
 {id:'cad_fabrication',name:'3D models & fabrication',suffix:' CAD STL STEP 3D printable replacement'},
 {id:'repair',name:'Repair & refurbishment',suffix:' repair rebuild service manual'},
 {id:'engineered_substitute',name:'Engineered substitution',suffix:' adapter alternate component technical dimensions'}
];
export function recoveryResearchLinks(query){
 const q=String(query||'').trim().slice(0,180);
 if(q.length<3)return [];
 return providers.map(x=>({type:x.id,label:x.name,
  url:'https://www.google.com/search?q='+encodeURIComponent(q+x.suffix),
  state:'research_link_only',verified:false}));
}
