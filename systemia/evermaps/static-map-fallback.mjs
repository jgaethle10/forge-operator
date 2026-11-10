/** Source-derived SVG display for mobile file previews that never execute JavaScript. */
const COLORS={Demonstrated:'#42bda1',Inferred:'#baab60',Speculative:'#d98661','Not a Resource':'#47677b','Not Analyzed':'#3e5668'};
function collect(v,out){
 if(!Array.isArray(v))return;
 if(v.length>=2&&typeof v[0]==='number'&&typeof v[1]==='number'){
  if(Number.isFinite(v[0])&&Number.isFinite(v[1]))out.push(v);
  return;
 }
 for(const x of v)collect(x,out);
}
export function wgsStaticSvg(layers){
 const arr=[];
 for(const f of layers.studies.features)collect(f.geometry?.coordinates,arr);
 if(arr.length<3)for(const f of layers.resources.features)collect(f.geometry?.coordinates,arr);
 if(arr.length<3)throw Error('Verified WGS preview geometry absent');
 let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
 for(const p of arr){xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}
 const cosine=Math.cos((ymin+ymax)*Math.PI/360);
 const size=Math.min(725/((xmax-xmin)*cosine),870/(ymax-ymin));
 const lon=(xmin+xmax)/2,lat=(ymin+ymax)/2;
 const pt=p=>[450+(p[0]-lon)*cosine*size,500-(p[1]-lat)*size];
 const path=g=>{
  const polys=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
  return polys.flatMap(poly=>poly.map(ring=>{
   if(!Array.isArray(ring)||ring.length<4)return '';
   const projected=ring.map(pt),kept=[projected[0]];
   for(let i=1;i<projected.length-1;i++){
    const p=projected[i],q=kept[kept.length-1];
    if(Math.hypot(p[0]-q[0],p[1]-q[1])>1.3)kept.push(p);
   }
   if(kept.length<3){kept.length=0;kept.push(projected[0],projected[Math.floor(projected.length/3)],projected[Math.floor(2*projected.length/3)]);}
   return 'M'+kept.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
  })).join('');
 };
 const polygons=layers.resources.features.map(f=>{
  const d=path(f.geometry);return d?'<path d="'+d+'" fill="'+(COLORS[f.properties?.CLASSIFICATION]||COLORS['Not Analyzed'])+'" fill-opacity=".76" stroke="#87adbc" stroke-width=".4" fill-rule="evenodd"/>':'';
 }).join('');
 const border=layers.studies.features.map(f=>'<path d="'+path(f.geometry)+'" fill="none" stroke="#e9f6fd" stroke-width="2.8" stroke-dasharray="7 6"/>').join('');
 const dots=(k,color,r)=>layers[k].features.map(f=>{
  const p=f.geometry?.coordinates;
  if(f.geometry?.type!=='Point'||!Array.isArray(p)||!p.slice(0,2).every(Number.isFinite))return '';
  const [x,y]=pt(p);return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r+'" fill="'+color+'"/>';
 }).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grant County WGS geological map" viewBox="0 0 900 1050">'+
  '<rect width="900" height="1050" rx="18" fill="#102536"/>'+
  '<text x="26" y="47" font-size="24" font-weight="700" fill="#edf8ff">GRANT COUNTY | WGS GEOLOGY</text>'+
  polygons+border+dots('tests','#64dce8',3)+dots('mineHistory','#f1a3cb',2.5)+
  '<text x="25" y="1007" font-size="18" fill="#e3f2fa">'+layers.resources.features.length+' polygons / '+layers.tests.features.length+' tests / '+layers.mineHistory.features.length+' historical mines</text>'+
  '<text x="25" y="1033" font-size="15" fill="#a1c0ce">Static regional preview. No mineral rights or site approval established.</text></svg>';
}
export function addNoScriptPreview(template,layers){
 const anchor='<canvas id="map" aria-label="Interactive map of locally loaded WGS geology data"></canvas>';
 if(!template.includes(anchor)||!template.includes('No source files loaded.'))throw Error('Unexpected first-party map template');
 const css=[
 '#mobile-static-preview{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#0a1926;padding:10px;gap:6px}',
 '#mobile-static-preview svg{height:calc(100% - 34px);width:100%;object-fit:contain}',
 '#mobile-static-preview p{font-size:12px;color:#c5e0eb;margin:0;text-align:center}',
 '#mobile-static-preview[hidden]{display:none}',
 '.canvas-wrap .controls{display:none}',
 '@media(max-width:820px){main{display:flex;flex-direction:column}.canvas-wrap{order:-1;min-height:76dvh}aside{order:2}}'
 ].join('');
 return template.replace('</style>',css+'</style>')
 .replace(anchor,anchor+'<div id="mobile-static-preview">'+wgsStaticSvg(layers)+'<p>Static preview. Interactive map requires a browser-hosted page.</p></div>')
 .replace('No source files loaded.','All verified WGS layers are embedded. Interactive controls require JavaScript.')
 .replace('Load WGS GeoJSON files<input','Add other GeoJSON files<input')
 .replace('Open the GeoJSON files from the GitHub Actions full Grant County research artifact. This page uses native browser Canvas with no map service, account, or API key.',
  'The geography is already embedded. iPhone file preview may block the interactive code, so a verified static map remains visible. Open a browser-hosted map for pan, zoom and inspection.');
}
