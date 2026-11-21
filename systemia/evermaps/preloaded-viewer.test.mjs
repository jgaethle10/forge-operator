import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {buildPreloadedWgsViewer} from './preloaded-viewer.mjs';
const f=(id,props={})=>({type:'Feature',properties:{OBJECTID:id,...props},
 geometry:{type:'Polygon',coordinates:[[[-119.9,46.2],[-119.8,46.2],[-119.8,46.3],[-119.9,46.3],[-119.9,46.2]]]}});
const source=(id,props={})=>({type:'FeatureCollection',features:[f(id,props)]});
const collections={
 resources:source(1,{CLASSIFICATION:'Demonstrated',COMMENTS:'</script><script>alert(1)</script>'}),
 tests:{type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:2},geometry:{type:'Point',coordinates:[-119.5,46.5]}}]},
 mineHistory:{type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:3},geometry:{type:'Point',coordinates:[-119.5,46.6]}}]},
 studies:source(4)
};
const layers=Object.fromEntries(Object.entries(collections).map(([kind,fc])=>[kind,{
 complete:true,fetched_features:fc.features.length,
 geometry_audit:{valid_for_mapping:true,
  sha256_source_features:auditGeojsonCollection(fc).sha256_source_features}
}]));
const receipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',
 source_data_completeness:true,layers};
test('complete audited WGS GeoJSON embeds in a single offline viewer with no source HTML injection',async()=>{
 const template=await readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
 const html=buildPreloadedWgsViewer({template,collections,receipt});
 assert.ok(html.includes('Object.assign(data,'));
 assert.ok(html.includes('id="mobile-static-preview"'));
 assert.ok(html.includes('<svg'));
 assert.ok(html.includes('preview.hidden=true'));
 assert.ok(html.includes('Explore the'));
 assert.ok(html.includes('Geological classifications'));
 assert.ok(html.includes('Map layers &amp; visibility'));
 assert.ok(html.includes('#layers-detail{display:none}'));
 assert.ok(html.includes('.evermaps-live #layers-detail{display:block}'));
 assert.ok(html.includes('class="legend-item permit-legend" hidden'));
 assert.ok(html.includes("document.body.classList.add('evermaps-live')"));
 assert.ok(html.includes('permitLegend.hidden=!data.permits'));
 assert.ok(html.includes('Full interaction requires a browser-hosted Evercraft page.'));
 assert.ok(html.includes('resetToggles();onStatus();fit();'));
 assert.equal(html.includes('</script><script>alert(1)'),false);
 assert.ok(html.includes('\\u003c/script'));
 assert.equal(html.split('</script>').length-1,1);
 const script=html.split('<script>')[1]?.split('</script>')[0];
 assert.doesNotThrow(()=>new Script(script));
});
test('tampered WGS source geometry and incomplete layer cannot create a preloaded viewer',async()=>{
 const template=await readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
 const changed={...collections,resources:source(15)};
 assert.throws(()=>buildPreloadedWgsViewer({template,collections:changed,receipt}),/mismatch/);
 const truncated={...receipt,layers:{...receipt.layers,tests:{...receipt.layers.tests,complete:false}}};
 assert.throws(()=>buildPreloadedWgsViewer({template,collections,receipt:truncated}),/Missing complete/);
 assert.throws(()=>buildPreloadedWgsViewer({template,collections,receipt:{...receipt,source_data_completeness:false}}),/Full verified/);
});

test('current signed WGS and DNR receipt includes approximate permit dots with no owner data',async()=>{
 const {LAND_SOURCE_CATALOG}=await import('./land-context.mjs');
 const origin=LAND_SOURCE_CATALOG.washingtonSurfacePermits.url;
 const p={type:'FeatureCollection',features:[{type:'Feature',
  properties:{OBJECTID:100,PERMIT_NO:'W100',COUNTY:'Grant',COMMODITY:'Sand',APPLICANT:'Do not emit'},
  geometry:{type:'Point',coordinates:[-119.5,46.7]}}],metadata:{
   complete:true,source:origin,source_count_before:1,source_count_after:1
  }};
 p.metadata.sha256_source_features=auditGeojsonCollection(p).sha256_source_features;
 const r={schema:'evercraft.evermaps.permit-point-overlay-receipt.v1',
  state:'point_geometry_overlay_verified',county:'Grant',source:origin,
  geologic_source_sha256:receipt.layers.resources.geometry_audit.sha256_source_features,
  permit_source_sha256:p.metadata.sha256_source_features,
  site_recommendation_allowed:false,land_title_verified:false,permit_count:1};
 const template=await readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
 const html=buildPreloadedWgsViewer({template,collections,receipt,permits:p,permitReceipt:r});
 assert.ok(html.includes('1 permit points*'));
 assert.ok(html.includes('class="legend-item permit-legend"'));
 assert.ok(!html.includes('class="legend-item permit-legend" hidden'));
 assert.ok(html.includes('fill="#ffa95b"'));
 assert.equal(html.includes('Do not emit'),false);
 const damaged={...r,geologic_source_sha256:'b'.repeat(64)};
 assert.throws(()=>buildPreloadedWgsViewer({template,collections,receipt,permits:p,permitReceipt:damaged}),/same-run/);
});
