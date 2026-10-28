import {readFile,writeFile} from 'node:fs/promises';
import {fetchGrantPermitPoints,joinPermitPointsToWgs} from './permit-point-overlay.mjs';

const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
let receipt;
try{
  const [wgs,importReceipt]=await Promise.all([
    readFile(dir+'/wgs-resources.geojson','utf8').then(JSON.parse),
    readFile(dir+'/wgs-full-import-receipt.json','utf8').then(JSON.parse)
  ]);
  const permits=await fetchGrantPermitPoints();
  const report=joinPermitPointsToWgs({wgs,receipt:importReceipt,permits});
  await writeFile(dir+'/wa-dnr-grant-permit-points.geojson',JSON.stringify(permits,null,2)+'\n',{flag:'wx'});
  await writeFile(dir+'/wa-dnr-permit-point-geology-overlay.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  receipt={schema:'evercraft.evermaps.permit-point-overlay-receipt.v1',
    state:'point_geometry_overlay_verified',county:'Grant',
    observed_at:new Date().toISOString(),
    source:report.source,permit_count:report.imported_approximate_permit_points,
    polygon_count:report.imported_resource_polygons,
    point_relation_counts:report.point_relation_counts,
    geologic_source_sha256:report.wgs_source_sha256,
    permit_source_sha256:report.permit_source_sha256,
    land_title_verified:false,site_recommendation_allowed:false};
  console.log(JSON.stringify(receipt,null,2));
}catch(error){
  receipt={schema:'evercraft.evermaps.permit-point-overlay-receipt.v1',
    state:'overlay_unverified',county:'Grant',observed_at:new Date().toISOString(),
    reason:String(error?.message??error),land_title_verified:false,
    site_recommendation_allowed:false};
  console.error('WA permit overlay held:',receipt.reason);
  process.exitCode=1;
}
await writeFile(dir+'/wa-dnr-permit-point-overlay-receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
