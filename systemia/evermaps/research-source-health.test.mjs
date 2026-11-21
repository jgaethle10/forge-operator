import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateResearchSourceHealth} from './research-source-health.mjs';
const complete={
 geology:{status:'source_geometry_complete_broad_phase_only',source_data_completeness:true},
 dossiers:{commercial_eligibility:'none_verified',record_count:700},
 land:{state:'source_metadata_and_coarse_counts_verified'},
 planning:{state:'coarse_sources_verified'},
 permitPoints:{state:'point_geometry_overlay_verified'},
 study:{status:'publisher_intersections_verified_within_unresolved'}
};
test('current verified research receipts satisfy only source health, NEVER mining eligibility',()=>{
 const r=evaluateResearchSourceHealth(complete);
 assert.equal(r.status,'all_research_dependencies_current');
 assert.equal(r.mining_recommendations_authorized,false);
 assert.equal(r.environment_clearance_verified,false);
 assert.equal(r.minable_reserves_established,undefined);
});
test('missing or 404 permit feed forces source dependency hold, not zero coverage',()=>{
 const s={...complete,permitPoints:{state:'overlay_unverified',reason:'WA DNR ArcGIS 404: Service not found'}};
 const r=evaluateResearchSourceHealth(s);
 assert.equal(r.status,'research_source_dependency_hold');
 assert.equal(r.evidence_receipt_states.permitPoints.status,'hold');
 assert.equal(r.mining_recommendations_authorized,false);
 assert.equal(r.evidence_receipt_states.permitPoints.evidence,'overlay_unverified');
});
test('missing WGS import or incomplete planning evidence cannot pass source health',()=>{
 assert.equal(evaluateResearchSourceHealth({...complete,geology:null}).required_research_dependencies_complete,false);
 assert.equal(evaluateResearchSourceHealth({...complete,planning:{state:'coarse_sources_partial'}}).required_research_dependencies_complete,false);
 assert.equal(evaluateResearchSourceHealth({...complete,dossiers:{record_count:0}}).required_research_dependencies_complete,false);
});
