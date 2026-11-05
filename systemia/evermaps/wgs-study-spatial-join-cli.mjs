import {readFile,writeFile} from 'node:fs/promises';
import {verifyPublisherStudyJoins} from './wgs-study-spatial-join.mjs';

const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const county=process.env.EVERMAPS_COUNTY||'Grant';
const out=dir+'/wgs-study-publisher-spatial-join-receipt.json';
let receipt;
try {
  const raw=JSON.parse(await readFile(dir+'/wgs-resources.geojson','utf8'));
  const imported=JSON.parse(await readFile(dir+'/wgs-full-import-receipt.json','utf8'));
  if(imported.status!=='source_geometry_complete_broad_phase_only') {
    throw new Error('Complete geometry source audit not established; cannot make study join');
  }
  const ids=raw.features.map(f=>f.properties.OBJECTID);
  receipt=await verifyPublisherStudyJoins({county,sourceIds:ids});
  console.log(JSON.stringify({
    status:receipt.status,county,
    imported:receipt.source_imported_resource_count,
    intersects:receipt.polygon_intersects_study_count,
    within:receipt.polygon_within_study_count,
    outside:receipt.polygon_does_not_intersect_study_count,
    method:receipt.method
  },null,2));
} catch(error) {
  receipt={schema:'evercraft.evermaps.wgs-publisher-study-join.v1',
    checked_at:new Date().toISOString(),county,status:'spatial_join_unverified',
    reason:String(error?.message??error)};
  console.error('Publisher study spatial join unverified:',receipt.reason);
  process.exitCode=1;
}
await writeFile(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
