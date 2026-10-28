import {readFile,writeFile} from 'node:fs/promises';
import {readLandCoverageEvidence} from './land-context.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
let packet;
try{
  const source=JSON.parse(await readFile(dir+'/wgs-resources.geojson','utf8'));
  const receipt=JSON.parse(await readFile(dir+'/wgs-full-import-receipt.json','utf8'));
  packet=await readLandCoverageEvidence({source,receipt,county:'Grant'});
  console.log(JSON.stringify({status:packet.state,
    counts:Object.fromEntries(Object.entries(packet.results).map(([k,v])=>[k,{
      state:v.state,scope:v.scope??null,count:v.observed_record_count??null
    }]))},null,2));
  if(packet.state!=='source_metadata_and_coarse_counts_verified')process.exitCode=1;
}catch(error){
  packet={schema:'evercraft.evermaps.land-source-coverage.v1',
    state:'source_probe_unverified',observed_at:new Date().toISOString(),
    county:'Grant',reason:String(error?.message??error),land_title_verified:false};
  console.error('Land source coverage held: '+packet.reason);
  process.exitCode=1;
}
await writeFile(dir+'/land-source-coverage-receipt.json',JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
