// Read-only release proof for the actual public owned Worlds heritage route.
// Unlike browser CI, this probes the configured external HTTPS edge.
import {checkWorldsOrigin} from './probe-worlds-public.mjs';
export async function probeWorldsHeritagePublic(origin,{fetchFn=fetch}={}){
 const safe=checkWorldsOrigin(origin);
 const fail=(reason,path)=>({schema:'evercraft.worlds.heritage-public-gate.v1',verified:false,origin:safe,reason,path});
 const endpoints=[
  {path:'/worlds/heritage/',type:'html',must:'EDUCATIONAL SCHEMATIC'},
  {path:'/worlds/heritage/app.mjs',type:'javascript',must:'buildHeritageDrawList'},
  {path:'/worlds/heritage/scene.mjs',type:'javascript',must:'pavlopetri-learning-scene-v1'},
  {path:'/worlds/heritage/atlas/',type:'html',must:'SUBMERGED HERITAGE ATLAS'},
  {path:'/worlds/heritage/atlas/sites.geojson',type:'geojson'}
 ];
 const passed=[];
 for(const endpoint of endpoints){
  let response;
  try{
   response=await fetchFn(safe+endpoint.path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status!==200)return fail('http_not_200',endpoint.path);
   const mime=(response.headers.get('content-type')||'').toLowerCase();
   if(endpoint.type==='html'&&!mime.includes('text/html'))return fail('html_content_type_mismatch',endpoint.path);
   if(endpoint.type==='javascript'&&!mime.includes('javascript'))return fail('javascript_content_type_mismatch',endpoint.path);
   if(endpoint.type==='geojson'&&!/application\/(?:geo\+json|json)/.test(mime))return fail('geojson_content_type_mismatch',endpoint.path);
   if(response.headers.get('access-control-allow-origin')==='*')return fail('unsafe_cors',endpoint.path);
   const body=await response.text();
   if(endpoint.must&&!body.includes(endpoint.must))return fail('unexpected_content',endpoint.path);
   if(endpoint.type==='geojson'){
    const data=JSON.parse(body);
    if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length<7||
       data.features.filter(f=>f.properties?.classification==='confirmed').length<5||
       data.features.filter(f=>f.properties?.classification==='disputed').length<2)
       return fail('unexpected_evidence_records',endpoint.path);
   }
   passed.push(endpoint.path);
  }catch{return fail('unreachable_or_invalid_response',endpoint.path);}
 }
 return {schema:'evercraft.worlds.heritage-public-gate.v1',verified:true,origin:safe,
  checked_paths:passed,write_test_performed:false,physical_device_tested:false,
  source_data_imported:false,production_scene_authoritative:false};
}
if(process.argv[1]?.endsWith('probe-worlds-heritage-public.mjs')){
 probeWorldsHeritagePublic(process.argv[2]||'').then(r=>{console.log(JSON.stringify(r,null,2));if(!r.verified)process.exitCode=1;})
 .catch(e=>{console.log(JSON.stringify({verified:false,reason:e.message}));process.exitCode=1;});
}
