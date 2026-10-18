// The owned EverMaps web artifact must be physically present in the Forge
// production build. Never equate repo source files with a served release.
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const out=resolve('dist/evermaps');
const files=['index.html','app.js','style.css','pnw-land.geojson'];
const digests={};
for(const name of files){
 const path=resolve(out,name);
 if(!existsSync(path)){
  console.error('BLOCKED: production EverMaps asset missing: '+name);
  process.exitCode=1;
  continue;
 }
 const bytes=readFileSync(path);
 if(bytes.length<300){
  console.error('BLOCKED: production EverMaps asset unexpectedly small: '+name);
  process.exitCode=1;
  continue;
 }
 if(bytes.toString('utf8').toLowerCase().includes('base44')){
  console.error('BLOCKED: legacy platform reference in new EverMaps asset: '+name);
  process.exitCode=1;
  continue;
 }
 digests[name]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
if(!process.exitCode){
 const html=readFileSync(resolve(out,'index.html'),'utf8');
 const script=readFileSync(resolve(out,'app.js'),'utf8');
 if(!html.includes('/evermaps/app.js')||!html.includes('/evermaps/style.css')
    ||!script.includes("fetch('/api/evermaps/incidents/pnw'")){
  console.error('BLOCKED: owned API/web asset linkage missing from built output');
  process.exitCode=1;
 }
}
console.log(JSON.stringify({
 schema:'evercraft.evermaps.owned-build-assets.v1',
 status:process.exitCode?'BLOCKED':'BUILT_ASSETS_VERIFIED',
 built_at_utc:new Date().toISOString(),
 origin:'Forge production dist',
 route:'/evermaps/',
 files:digests,
 legacy_host_dependencies:0,
 external_release_authorized:false,
 live_route_verified:false,
 physical_device_qa:false
},null,2));
