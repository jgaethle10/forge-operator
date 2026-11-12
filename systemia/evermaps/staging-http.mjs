/**
 * EverMaps research staging: local read-only Node HTTP server for owned edge.
 * Serve only verified artifact bytes from a fixed release at process startup.
 * No remote provider, API key, public route, or data mutation.
 */
import {createServer} from 'node:http';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const RELEASE_FILES=Object.freeze({
 map:'research-map-preloaded.html',
 index:'research-brief.html',
 csv:'research-index.csv',
 packet:'research-packet.json',
 geology:'wgs-full-import-receipt.json',
 health:'source-health-manifest.json'
});
const SHA=/^[a-f0-9]{64}$/;
const MAX_ASSET=22*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function regularFile(directory,name){
 const file=path.join(directory,name);
 const st=await lstat(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>MAX_ASSET)
  throw Error('Invalid staging evidence asset: '+name);
 return readFile(file);
}
function parseJson(bytes,name){
 try{return JSON.parse(bytes.toString('utf8'));}
 catch{throw Error('Invalid staging JSON asset: '+name);}
}
export async function loadVerifiedEvermapsRelease({directory}={}){
 if(typeof directory!=='string'||directory.trim()==='')throw Error('release_directory_required');
 const assets={};
 for(const [key,name] of Object.entries(RELEASE_FILES)){
  assets[key]=await regularFile(directory,name);
 }
 const source=parseJson(assets.geology,'geology');
 const health=parseJson(assets.health,'health');
 const packet=parseJson(assets.packet,'packet');
 const id=source?.layers?.resources?.geometry_audit?.sha256_source_features;
 if(!SHA.test(String(id||''))||source.status!=='source_geometry_complete_broad_phase_only'||
    source.source_data_completeness!==true||source.county!=='Grant'||
    source.layers.resources.complete!==true||
    source.layers.resources.geometry_audit.valid_for_mapping!==true)
  throw Error('WGS source integrity receipt required for staging');
 if(health.status!=='all_research_dependencies_current'||
    health.required_research_dependencies_complete!==true||
    !Object.values(health.evidence_receipt_states||{}).every(x=>x.status==='verified'))
  throw Error('Live source dependency holds prevent release admission');
 if(packet.schema!=='evercraft.evermaps.offline-geological-research-packet.v1'||
    packet.research_wgs_sha256!==id||
    packet.geological_records_exported!==packet.rows?.length||
    packet.geological_records_exported<1||
    packet.source_health?.full_dependency_refresh_complete!==true||
    packet.site_recommendations_authorized!==false||
    packet.public_mining_rights_verified!==false||
    packet.certified_reserves!==false)
  throw Error('Geology packet evidence mismatched or improperly eligible');
 const html=assets.map.toString('utf8');
 if(!html.includes('id="mobile-static-preview"')||
    !html.includes('<svg')||!html.includes('Object.assign(data,')||
    !html.includes('preview.hidden=true')||
    html.includes('src="https://')||html.includes('src="http://'))
  throw Error('Expected full mobile fallback and preloaded owned map');
 const summary={
  schema:'evercraft.evermaps.owned-staging-release.v1',
  service:'evermaps-research',
  release_state:'verified_source_bundle_not_publicly_deployed',
  county:'Grant',
  wgs_source_sha256:id,
  wgs_resource_polygons:source.layers.resources.fetched_features,
  research_record_count:packet.geological_records_exported,
  source_dependencies_verified:true,
  mining_site_recommendations_authorized:false,
  mineral_title_verified:false,
  public_https_route_verified:false,
  files:Object.fromEntries(Object.entries(assets).map(([key,bytes])=>[key,{sha256:digest(bytes),size_bytes:bytes.length}]))
 };
 return {assets,summary};
}
const REPLY_HEADERS=Object.freeze({
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'cache-control':'no-store, max-age=0',
 'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"
});
const ROUTES=Object.freeze({
 '/':['map','text/html; charset=utf-8'],
 '/evermaps/':['map','text/html; charset=utf-8'],
 '/research/':['index','text/html; charset=utf-8'],
 '/research.csv':['csv','text/csv; charset=utf-8'],
 '/evermaps/research/':['index','text/html; charset=utf-8'],
 '/evermaps/research.csv':['csv','text/csv; charset=utf-8']
});
export async function createEvermapsStagingServer({releaseDirectory}={}){
 const release=await loadVerifiedEvermapsRelease({directory:releaseDirectory});
 const server=createServer((req,res)=>{
  const method=String(req.method||'GET');
  if(method!=='GET'&&method!=='HEAD'){
   res.writeHead(405,{...REPLY_HEADERS,allow:'GET, HEAD'});res.end();return;
  }
  const pathname=req.url?.split('?')[0];
  if(pathname==='/api/health'||pathname==='/evermaps/api/health'){
   const reply=Buffer.from(JSON.stringify({
    ok:true,service:release.summary.service,
    release_state:release.summary.release_state,
    wgs_source_sha256:release.summary.wgs_source_sha256,
    research_record_count:release.summary.research_record_count,
    source_dependencies_verified:true,
    public_https_route_verified:false,
    mining_site_recommendations_authorized:false
   }));
   res.writeHead(200,{...REPLY_HEADERS,'content-type':'application/json; charset=utf-8','content-length':reply.length});
   res.end(method==='HEAD'?undefined:reply);return;
  }
  const chosen=ROUTES[pathname];
  if(!chosen){res.writeHead(404,REPLY_HEADERS);res.end();return;}
  const [kind,mime]=chosen,body=release.assets[kind];
  res.writeHead(200,{...REPLY_HEADERS,'content-type':mime,'content-length':body.length});
  res.end(method==='HEAD'?undefined:body);
 });
 return {server,release:release.summary};
}
