import {readFile,writeFile} from 'node:fs/promises';
import {verifyEvermapsOwnedHttps} from './public-https-canary.mjs';
const origin=process.env.EVERMAPS_PUBLIC_ORIGIN||'';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const receipt=JSON.parse(await readFile(dir+'/wgs-full-import-receipt.json','utf8'));
const expectedWgsSha256=receipt?.layers?.resources?.geometry_audit?.sha256_source_features;
let report;
try{report=await verifyEvermapsOwnedHttps({origin,expectedWgsSha256});}
catch(error){
 report={schema:'evercraft.evermaps.public-https-route-receipt.v1',
  result:'held_unverified_https',reason:String(error?.message??error),
  origin:origin||null,observed_at:new Date().toISOString(),
  payment_or_external_action_taken:false,authorized_mining_sites:false};
 process.exitCode=1;
}
await writeFile(dir+'/evermaps-public-https-route-receipt.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
