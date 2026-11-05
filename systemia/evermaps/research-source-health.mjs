/** Final research SOURCE-health gate. Green only when current run has all required receipts. */
export function evaluateResearchSourceHealth(inputs){
 const required={
  geology:{status:inputs.geology?.status==='source_geometry_complete_broad_phase_only'&&
   inputs.geology?.source_data_completeness===true?'verified':'hold',
   evidence:inputs.geology?.status??'missing'},
  dossiers:{status:inputs.dossiers?.commercial_eligibility==='none_verified'&&
   inputs.dossiers?.record_count>0?'verified':'hold',
   evidence:inputs.dossiers?.record_count??'missing'},
  land:{status:inputs.land?.state==='source_metadata_and_coarse_counts_verified'?'verified':'hold',
   evidence:inputs.land?.state??'missing'},
  planning:{status:inputs.planning?.state==='coarse_sources_verified'?'verified':'hold',
   evidence:inputs.planning?.state??'missing'},
  permitPoints:{status:inputs.permitPoints?.state==='point_geometry_overlay_verified'?'verified':'hold',
   evidence:inputs.permitPoints?.state??'missing'},
  study:{status:inputs.study?.status?.startsWith('publisher_intersections_verified')||inputs.study?.status==='publisher_spatial_relations_verified'?'verified':'hold',
   evidence:inputs.study?.status??'missing'}
 };
 const complete=Object.values(required).every(x=>x.status==='verified');
 return {
  schema:'evercraft.evermaps.source-health-manifest.v1',
  status:complete?'all_research_dependencies_current':'research_source_dependency_hold',
  evidence_receipt_states:required,
  required_research_dependencies_complete:complete,
  mining_recommendations_authorized:false,
  mineable_reserves_established:false,
  mineral_title_verified:false,
  zoning_approval_verified:false,
  environment_clearance_verified:false,
  notice:'Source refresh health is distinct from geological interpretation, mineral ownership, permissions, and project economics. A missing public feed is unknown, never zero.'
 };
}
