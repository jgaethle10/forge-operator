/** Read-only full-county evidence import. NEVER a mining prospect recommendation. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ingestWgsEvidenceLayer,WGS_EVIDENCE_LAYERS} from './aggregate-evidence.mjs';
import {screenAggregateResources,queueToGeoJSON} from './mineral-intelligence.mjs';
import {auditGeojsonCollection,auditStudyEnvelopes} from './spatial-integrity.mjs';

const county=process.env.EVERMAPS_COUNTY||'Grant';
const outDir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const pageSize=Number(process.env.EVERMAPS_PAGE_SIZE||100);
const maxPages=Number(process.env.EVERMAPS_MAX_PAGES||40);
const keys=Object.keys(WGS_EVIDENCE_LAYERS);
const receipt={
  schema:'evercraft.evermaps.wgs-full-county-ingest.v1',
  status:'not_started',county,started_at:new Date().toISOString(),
  method:'county_id_pagination_then_full_geometry_audit',
  data_permission:'read_only_public_wgs',layers:{},source_data_completeness:false,
  study_coverage_method:'bounding_box_broad_phase_only',
  study_polygon_intersections_verified:false,
  disclaimer:'Evidence inventory only. No rights, zoning, haul economics, drilling, or mineability conclusions.'
};
await mkdir(outDir,{recursive:true});
async function save(filename,value) {
  await writeFile(outDir+'/'+filename,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
const raw={},audits={};
try {
  for (const kind of keys) {
    const collection=await ingestWgsEvidenceLayer({
      kind,county,pageSize,maxPages,signal:AbortSignal.timeout(180000)
    });
    const quality=auditGeojsonCollection(collection,{sourceLabel:kind});
    raw[kind]=collection;audits[kind]=quality;
    receipt.layers[kind]={
      ...collection.metadata,
      geometry_audit:{
        record_count:quality.record_count,unique_object_ids:quality.unique_object_ids,
        valid_geometry_count:quality.valid_geometry_count,invalid_count:quality.invalid_count,
        sampled_coordinate_count:quality.sampled_coordinate_count,
        sha256_source_features:quality.sha256_source_features,valid_for_mapping:quality.valid_for_mapping,
        geometry_errors:quality.geometry_errors
      }
    };
    console.log(JSON.stringify({
      layer:kind,count:collection.features.length,complete:collection.metadata.complete,
      geometry_valid:quality.valid_for_mapping,sha256:quality.sha256_source_features
    }));
    await save('wgs-'+kind+'.geojson',collection);
  }
  const screen=screenAggregateResources(raw.resources);
  const mapQueue=queueToGeoJSON(screen);
  const broadPhase=auditStudyEnvelopes(audits.resources,audits.studies);
  receipt.summary={
    classification_counts:Object.fromEntries([...new Set(raw.resources.features
      .map(f=>String(f?.properties?.CLASSIFICATION??'Unknown')))].sort().map(k=>
      [k,raw.resources.features.filter(f=>String(f?.properties?.CLASSIFICATION??'Unknown')===k).length])),
    resource_review_queue:screen.research_queue.length,
    resource_polygon_study_envelopes_with_possible_overlap:broadPhase.resource_envelopes_with_possible_study_overlap,
    resource_polygon_study_envelopes_disjoint:broadPhase.resource_envelopes_disjoint_from_studies,
    study_overlap_caveat:broadPhase.means
  };
  await save('wgs-classified-review-queue.geojson',mapQueue);
  await save('wgs-study-envelope-candidates.json',broadPhase);
  receipt.source_data_completeness=keys.every(k=>raw[k].metadata.complete&&audits[k].valid_for_mapping);
  receipt.status=receipt.source_data_completeness?
    'source_geometry_complete_broad_phase_only':'data_incomplete_or_integrity_hold';
} catch(error) {
  receipt.status='ingest_failed';
  receipt.failure_message=String(error?.message??error);
  console.error('Full WGS ingest failed:',receipt.failure_message);
  process.exitCode=1;
} finally {
  receipt.finished_at=new Date().toISOString();
  receipt.sha256_receipt_payload=createHash('sha256').update(JSON.stringify(receipt.layers)).digest('hex');
  await save('wgs-full-import-receipt.json',receipt);
  console.log(JSON.stringify({
    status:receipt.status,county,counts:Object.fromEntries(Object.entries(receipt.layers)
      .map(([k,v])=>[k,v.fetched_features])),summary:receipt.summary??null,
    receipt:outDir+'/wgs-full-import-receipt.json'
  },null,2));
  if (receipt.status!=='source_geometry_complete_broad_phase_only') process.exitCode=1;
}
