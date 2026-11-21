import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {buildAggregateResearchDossiers} from './research-dossiers.mjs';
import {buildEvermapsEvidencePacket,evidencePacketCsv,evidencePacketHtml} from './research-packet.mjs';
const f=(id,c,commodity)=>({type:'Feature',properties:{
 OBJECTID:id,CLASSIFICATION:c,COMMODITY:commodity,RESOURCE_ACREAGE:11},
 geometry:{type:'Polygon',coordinates:[[[-119.9,46.2],[-119.8,46.2],[-119.8,46.3],[-119.9,46.3],[-119.9,46.2]]]}})
const wgs={type:'FeatureCollection',features:[f(3,'Demonstrated','=2+3'),f(4,'Inferred','sand'),f(5,'Speculative','gravel'),f(6,'Not a Resource','none')]};
const sha=auditGeojsonCollection(wgs).sha256_source_features;
const receipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',
 source_data_completeness:true,layers:{resources:{
 complete:true,fetched_features:wgs.features.length,source:'WGS',
 geometry_audit:{valid_for_mapping:true,sha256_source_features:sha}
 }}};
const dossiers=buildAggregateResearchDossiers({source:wgs,receipt});
const sample={status:'sample_polygon_intersections_verified',
 source_wgs_sha256:sha,all_wgs_polygons_checked:false,
 rows:[{wgs_resource_object_id:3,results:{
 zoning:{state:'publisher_polygon_intersection_count',matching_source_features:1},
 dnr:{state:'publisher_polygon_intersection_count',matching_source_features:0},
 habitat:{state:'publisher_polygon_intersection_count',matching_source_features:12}
 }}]};
test('research packet needs exact WGS and dossier source hashes, and never asserts mineability',()=>{
 const x=buildEvermapsEvidencePacket({wgs,receipt,dossiers,polygonSample:sample,now:()=> 'fixed'});
 assert.equal(x.geological_records_exported,3);
 assert.equal(x.rows.find(v=>v.object_id===3).polygon_overlay.results.dnr.count,0);
 assert.equal(x.rows.find(v=>v.object_id===4).polygon_overlay.state,'not_sampled');
 assert.equal(x.site_recommendations_authorized,false);
 assert.equal(x.rows.every(v=>v.mineral_title==='unverified'),true);
 assert.equal(x.source_health.full_dependency_refresh_complete,false);
});
test('missing sample stays unknown and mismatched sample hash is rejected rather than shown',()=>{
 const bad=buildEvermapsEvidencePacket({wgs,receipt,dossiers,polygonSample:{...sample,source_wgs_sha256:'0'.repeat(64)}});
 assert.equal(bad.source_health.polygon_sample_count,0);
 assert.equal(bad.rows[0].polygon_overlay.state,'not_sampled');
});
test('tampered geology, mislabeled classifications, missing dossier and incorrect permissions fail closed',()=>{
 assert.throws(()=>buildEvermapsEvidencePacket({wgs:{...wgs,features:wgs.features.slice(1)},receipt,dossiers}),/complete|mismatch/i);
 assert.throws(()=>buildEvermapsEvidencePacket({wgs,receipt,dossiers:{...dossiers,records:dossiers.records.slice(1)}}),/mismatch|mismatched/i);
 assert.throws(()=>buildEvermapsEvidencePacket({wgs,receipt,dossiers:{...dossiers,records:dossiers.records.map((r,i)=>i? r:{...r,commercial_recommendation_allowed:true})}}),/malformed/i);
});
test('offline HTML filters safely; CSV defends against formula injection',()=>{
 const p=buildEvermapsEvidencePacket({wgs,receipt,dossiers,polygonSample:sample});
 const csv=evidencePacketCsv(p),html=evidencePacketHtml(p);
 assert.ok(csv.includes(String.raw`"'=2+3"`));
 assert.ok(csv.includes('ZONING_COUNT_SAMPLE_ONLY'));
 assert.ok(html.includes('Grant County geological intelligence'));
 assert.equal(html.includes('fetch('),false);
 assert.equal(html.includes('<script src='),false);
 assert.equal(html.includes('<td>=2+3</td>'),true); // inert text is safe HTML, unlike spreadsheet formulas
 const tampered={...p,rows:p.rows.map((row,i)=>i?row:{...row,published_commodity:'<img src=x onerror=alert(1)>'})};
 const safe=evidencePacketHtml(tampered);
 assert.equal(safe.includes('<img src=x'),false);
 assert.ok(safe.includes('&lt;img src=x onerror=alert(1)&gt;'));
 const script=html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(script);
 assert.doesNotThrow(()=>new Script(script));
 assert.equal(html.split('<tr data-class=').length-1,3);
});
