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
 assert.ok(html.includes('Regional geology preview.'));
 assert.ok(html.includes('Understand the map'));
 assert.ok(html.includes('id="map-layer-heading"'));
 assert.ok(html.includes('body:not(.evermaps-live) #toggles{display:none!important}'));
 assert.ok(html.includes('aside .group>.layer{display:flex'));
 assert.ok(html.includes('class="layer permit-legend" hidden'));
 assert.ok(html.includes("document.body.classList.add('evermaps-live')"));
 assert.ok(html.includes('permitLegend.hidden=!data.permits'));
 assert.ok(html.includes('Source verified. The interactive viewer needs browser JavaScript.'));
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
