import {writeFile} from 'node:fs/promises';
import {probeWaPermitSourceCandidates} from './permit-source-discovery.mjs';
let receipt;
try{receipt=await probeWaPermitSourceCandidates();}
catch(e){receipt={schema:'evercraft.evermaps.wa-permit-source-discovery.v1',
 state:'probe_failed',reason:String(e?.message??e),observed_at:new Date().toISOString(),
 full_county_import_verified:false,current_operating_status_verified:false};}
await writeFile('wa-permit-source-discovery-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(receipt.state!=='at_least_one_source_verified')process.exitCode=1;
