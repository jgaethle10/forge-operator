// Read-only release proof for Evercraft Hidden World. No deployment or write side effects.
import { checkWorldsOrigin } from './probe-worlds-public.mjs';

const requireText=async(fetchFn,url,token,mime)=>{
  const res=await fetchFn(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(res.status!==200)throw Error('http_'+res.status);
  if(mime&&!String(res.headers?.get('content-type')||'').toLowerCase().includes(mime))throw Error('mime_mismatch');
  const body=await res.text();
  if(!body.includes(token))throw Error('content_mismatch');
  return body;
};
export async function probeHiddenWorldPublic(origin,{fetchFn=fetch}={}){
  const safe=checkWorldsOrigin(origin);
  const fail=reason=>({schema:'evercraft.hidden-world.public-release-gate.v1',verified:false,origin:safe,reason});
  try{
    const health=await fetchFn(safe+'/worlds/api/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(health.status!==200)return fail('worlds_health_unavailable');
    const record=await health.json();
    if(record.schema!=='evercraft.worlds.vault.v1'||record.ok!==true||record.mode!=='owned-durable-vault')
      return fail('worlds_runtime_identity_mismatch');
  }catch{return fail('worlds_health_unreachable');}
  const checks=[
    ['/worlds/hidden-world/','Hidden World Atlas','text/html','atlas_entry'],
    ['/worlds/hidden-world/yakima-evidence.html','Connected tunnels established by the records reviewed','text/html','yakima_evidence'],
    ['/worlds/hidden-world/lund-building.html','National Register nomination PDF','text/html','lund_architecture'],
    ['/worlds/hidden-world/titan-i-1962.html','Original educational SVG','text/html','titan_exhibit'],
    ['/worlds/hidden-world/titan-i-1962-evidence.v1.json','evercraft.hidden-world.cold-war-evidence.v1','application/json','titan_ledger'],
    ['/worlds/hidden-world/titan-walk/','ORIGINAL ART · NOT A SITE PLAN','text/html','titan_walk_page'],
    ['/worlds/hidden-world/titan-walk/app.mjs','buildTitanDrawList','text/javascript','titan_walk_runtime'],
    ['/worlds/hidden-world/titan-walk/scene.mjs','evercraft.hidden-world.titan-gallery.v1','text/javascript','titan_walk_scene'],
    ['/worlds/hidden-world/titan-walk/tour.mjs','TITAN_TOUR_SECONDS','text/javascript','titan_walk_tour'],
    ['/worlds/hidden-world/yakima-standalone.html','scene-ready','text/html','yakima_exhibit'],
    ['/worlds/hidden-world/hidden_world_atlas_v1.csv','yakima,','text/csv','research_data'],
    ['/worlds/hidden-world/yakima-evidence-ledger.v1.json','evercraft.hidden-world.evidence-ledger.v1','application/json','evidence_ledger']
  ];
  for(const [path,token,mime,id] of checks){
    try{await requireText(fetchFn,safe+path,token,mime);}
    catch{return fail(id+'_not_verified');}
  }
  return {schema:'evercraft.hidden-world.public-release-gate.v1',verified:true,origin:safe,
    checks:['owned_worlds_health','atlas_entry','yakima_evidence','lund_architecture','titan_exhibit','titan_ledger','titan_walk_page','titan_walk_runtime','titan_walk_scene','titan_walk_tour','yakima_exhibit','research_data','evidence_ledger'],
    physical_iphone_verified:false,write_test_performed:false};
}

if(process.argv[1]?.endsWith('probe-hidden-world-public.mjs')){
  probeHiddenWorldPublic(process.argv[2]||'').then(r=>{console.log(JSON.stringify(r,null,2));if(!r.verified)process.exitCode=1;})
    .catch(e=>{console.log(JSON.stringify({verified:false,reason:e.message}));process.exitCode=1;});
}
