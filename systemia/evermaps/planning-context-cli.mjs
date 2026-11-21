import {readFile,writeFile} from 'node:fs/promises';
import {probeGrantPlanning} from './planning-context.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
let receipt;
try{
 const [wgs,sourceReceipt]=await Promise.all([
  readFile(dir+'/wgs-resources.geojson','utf8').then(JSON.parse),
  readFile(dir+'/wgs-full-import-receipt.json','utf8').then(JSON.parse)]);
 receipt=await probeGrantPlanning({source:wgs,receipt:sourceReceipt});
 console.log(JSON.stringify({state:receipt.state,results:Object.fromEntries(
  Object.entries(receipt.results).map(([k,v])=>[k,{status:v.status,count:v.envelope_matching_features}]))},null,2));
 if(receipt.state!=='coarse_sources_verified')process.exitCode=1;
}catch(error){
 receipt={schema:'evercraft.evermaps.grant-planning-probe.v1',state:'probe_failed',
  reason:String(error?.message??error),checked_at:new Date().toISOString(),
  legal_mining_eligibility_verified:false,commercial_site_recommendation_allowed:false};
 console.error('Planning source probe failed:',receipt.reason);process.exitCode=1;
}
await writeFile(dir+'/grant-planning-context-receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
