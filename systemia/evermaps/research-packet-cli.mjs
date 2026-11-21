import {readFile,writeFile} from 'node:fs/promises';
import {buildEvermapsEvidencePacket,evidencePacketCsv,evidencePacketHtml} from './research-packet.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
async function get(name,required=false){
 try{return JSON.parse(await readFile(dir+'/'+name,'utf8'));}
 catch(error){if(required)throw error;return null;}
}
try{
 const [wgs,receipt,dossiers,polygonSample,land,planning,permits,sourceHealth]=await Promise.all([
  get('wgs-resources.geojson',true),get('wgs-full-import-receipt.json',true),
  get('wgs-research-dossiers.json',true),get('grant-polygon-planning-sample-receipt.json'),
  get('land-source-coverage-receipt.json'),get('grant-planning-context-receipt.json'),
  get('wa-dnr-permit-point-overlay-receipt.json'),get('source-health-manifest.json')
 ]);
 const packet=buildEvermapsEvidencePacket({
  wgs,receipt,dossiers,polygonSample,land,planning,permits,sourceHealth
 });
 await Promise.all([
  writeFile(dir+'/research-packet.json',JSON.stringify(packet,null,2)+'\n',{flag:'wx'}),
  writeFile(dir+'/research-index.csv',evidencePacketCsv(packet),{flag:'wx'}),
  writeFile(dir+'/research-brief.html',evidencePacketHtml(packet),{flag:'wx'})
 ]);
 console.log(JSON.stringify({status:packet.packet_status,
  geological_records:packet.geological_records_exported,
  source_wgs_sha256:packet.research_wgs_sha256,
  sample_count:packet.source_health.polygon_sample_count,
  full_dependency_refresh_complete:packet.source_health.full_dependency_refresh_complete,
  site_recommendations_authorized:false},null,2));
}catch(error){
 console.error('Research packet export held:',String(error?.message??error));
 process.exitCode=1;
}
