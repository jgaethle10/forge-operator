/** Source-backed bounded per-polygon planning intersection sample. No title/clearance claims. */
import {readFile,writeFile} from 'node:fs/promises';
import {testGrantPolygonPlanningSample} from './planning-polygon-sample.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
let report;
try{
 const [wgs,receipt]=await Promise.all([
  readFile(dir+'/wgs-resources.geojson','utf8').then(JSON.parse),
  readFile(dir+'/wgs-full-import-receipt.json','utf8').then(JSON.parse)
 ]);
 report=await testGrantPolygonPlanningSample({source:wgs,receipt});
 console.log(JSON.stringify({
  status:report.status,sample_feature_count:report.sample_feature_count,
  rows:report.rows.map(x=>({id:x.wgs_resource_object_id,class:x.wgs_published_classification,
   matches:Object.fromEntries(Object.entries(x.results).map(([key,v])=>[key,
    v.matching_source_features??null]))}))
 },null,2));
 if(report.status!=='sample_polygon_intersections_verified')process.exitCode=1;
}catch(error){
 report={schema:'evercraft.evermaps.planning-polygon-sample.v1',
  status:'sample_failed',observed_at:new Date().toISOString(),
  reason:String(error?.message??error),
  county:'Grant',all_wgs_polygons_checked:false,
  environmental_clearance_verified:false,commercial_recommendation_allowed:false};
 console.error('Polygon-specific planning sample held: '+report.reason);
 process.exitCode=1;
}
await writeFile(dir+'/grant-polygon-planning-sample-receipt.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
