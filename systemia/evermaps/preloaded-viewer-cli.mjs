/** Build a fully preloaded map in the same source-audited research artifact. */
import {readFile,writeFile} from 'node:fs/promises';
import {buildPreloadedWgsViewer} from './preloaded-viewer.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
try{
 const kinds=['resources','tests','mineHistory','studies'];
 const [template,receipt,...sources]=await Promise.all([
  readFile(new URL('./research-viewer.html',import.meta.url),'utf8'),
  readFile(dir+'/wgs-full-import-receipt.json','utf8').then(JSON.parse),
  ...kinds.map(kind=>readFile(dir+'/wgs-'+kind+'.geojson','utf8').then(JSON.parse))
 ]);
 const collections=Object.fromEntries(kinds.map((kind,i)=>[kind,sources[i]]));
 const html=buildPreloadedWgsViewer({template,collections,receipt});
 await writeFile(dir+'/research-map-preloaded.html',html,{flag:'wx'});
 console.log(JSON.stringify({status:'preloaded_verified_wgs_offline_map',
  county:'Grant',layers:Object.fromEntries(kinds.map(kind=>[kind,collections[kind].features.length])),
  source_hash:receipt.layers.resources.geometry_audit.sha256_source_features,
  bytes:Buffer.byteLength(html),external_dependencies:false}));
}catch(error){
 console.error('Preloaded research viewer held:',String(error?.message??error));
 process.exitCode=1;
}
