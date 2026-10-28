/** Regional evidence records, not mining site selection. Fail closed on source uncertainty. */
import {auditGeojsonCollection} from './spatial-integrity.mjs';
export const RESEARCH_GATES=Object.freeze({
  mineral_or_material_rights:'unverified',
  surface_ownership_and_access:'unverified',
  county_land_use_and_zoning:'unverified',
  environmental_and_tribal_constraints:'unverified',
  field_sampling_and_material_quality:'unverified',
  logistics_and_haul_economics:'unverified',
  engineering_and_geotechnical_review:'unverified',
  reclamation_and_permits:'unverified'
});
const CLASSES=new Set(['Demonstrated','Inferred','Speculative']);
export function buildAggregateResearchDossiers({source,receipt,county='Grant'}={}) {
  if(source?.type!=='FeatureCollection'||!Array.isArray(source.features)) {
    throw new Error('Complete WGS resource feature inventory is required');
  }
  if(receipt?.status!=='source_geometry_complete_broad_phase_only'||
     receipt?.county!==county||
     receipt?.layers?.resources?.complete!==true||
     receipt?.layers?.resources?.geometry_audit?.valid_for_mapping!==true||
     receipt.layers.resources.fetched_features!==source.features.length) {
    throw new Error('Source provenance and complete geometry audit not verified');
  }
  const sha=receipt.layers.resources.geometry_audit.sha256_source_features;
  if(typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha))throw new Error('Missing trusted source fingerprint');
  const sourceAudit=auditGeojsonCollection(source,{sourceLabel:'dossier-source'});
  if(!sourceAudit.valid_for_mapping||sourceAudit.sha256_source_features!==sha) {
    throw new Error('Source geometry is invalid or SHA-256 does not match verified import');
  }
  const seen=new Set(),dossiers=[];
  for(const feature of source.features) {
    const p=feature?.properties,oid=p?.OBJECTID;
    if(!Number.isSafeInteger(oid)||seen.has(oid))throw new Error('Invalid or repeated WGS OBJECTID');
    seen.add(oid);
    if(!CLASSES.has(p.CLASSIFICATION))continue;
    dossiers.push({
      schema:'evercraft.evermaps.aggregate-research-dossier.v1',
      id:'wgs-grant-'+oid,county,source_object_id:oid,
      geological_evidence:{
        source_layer:receipt.layers.resources.source,
        source_sha256:sha,publisher:'Washington Geological Survey',
        dataset_version:receipt.layers.resources.dataset,
        classification:p.CLASSIFICATION,commodity:p.COMMODITY??null,
        resource_acreage_reported:p.RESOURCE_ACREAGE??null,
        thickness_classification:p.THICKNESS_CLASSIFICATION??null
      },
      suitability:'not_determined',
      legal_mining_eligibility:'not_determined',
      evidence_gates:{...RESEARCH_GATES},
      required_next_step:'Independent qualified geological and property-rights/land-use review before economic or mining-site recommendation.',
      commercial_recommendation_allowed:false
    });
  }
  dossiers.sort((a,b)=>a.source_object_id-b.source_object_id);
  return {
    schema:'evercraft.evermaps.aggregate-research-dossiers.v1',
    county,source_sha256:sha,
    records:dossiers,record_count:dossiers.length,
    notice:'Published WGS geology is not mineral title, extractable volume, permitting or validated project feasibility.',
    commercial_eligibility:'none_verified'
  };
}
