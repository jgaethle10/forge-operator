import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { auditEvDrawingModel,renderEvConceptSheet } from '../systemia/ev-opportunity/site-plan-renderer.mjs';
const template=JSON.parse(readFileSync(new URL('../systemia/ev-opportunity/site-plan-demo.synthetic.json', import.meta.url)));
const fixture=()=>structuredClone(template);
const get=(x,id)=>x.features.find(f=>f.id===id);

test('valid synthetic drawing renders an internal SVG, never publish/permit ready',()=>{
 const x=fixture();const out=renderEvConceptSheet(x);
 assert.equal(out.qa.state,'INTERNAL_PREVIEW');
 assert.ok(out.svg.startsWith('<svg'));
 assert.ok(out.svg.includes('SYNTHETIC DEMONSTRATION'));
 assert.ok(out.svg.includes('NOT FOR CONSTRUCTION'));
 assert.ok(out.svg.includes('EV-101'));
 assert.equal(out.qa.releasable,false);
 assert.equal(out.commercial_release,false);
});
test('area-context variant has its own sheet label and is internally gated',()=>{
 const x=fixture();const out=renderEvConceptSheet(x,{role:'area_context'});
 assert.ok(out.svg.includes('EV-102'));
 assert.equal(out.qa.releasable,false);
});
test('invalid role rejected',()=>assert.throws(()=>renderEvConceptSheet(fixture(),{role:'final_electrical'}),/unsupported_sheet_role/));
test('malicious SVG text escaped rather than interpreted as HTML',()=>{
 const x=fixture();x.project.name='</text><script>alert(1)</script>';
 const out=renderEvConceptSheet(x);
 assert.ok(out.svg.includes('&lt;script&gt;'));
 assert.ok(!out.svg.includes('<script>'));
});
test('unverified independent source clearance holds real data path',()=>{
 const x=fixture();x.demonstration=false;x.independent_source_review=false;
 const out=renderEvConceptSheet(x);
 assert.equal(out.svg,null);
 assert.ok(out.qa.hold_reasons.includes('independent_source_review_required'));
});
test('conflicting feature IDs hold rather than overwrite',()=>{
 const x=fixture();x.features.push(structuredClone(get(x,'stall-01')));
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('duplicate_or_missing_feature_id'));
});
test('proposed geometry outside parcel fails closed',()=>{
 const x=fixture();get(x,'stall-01').geometry.points=[[300,300],[310,300],[310,310],[300,310]];
 const out=renderEvConceptSheet(x);
 assert.equal(out.svg,null);
 assert.ok(out.qa.hold_reasons.includes('proposed_feature_outside_parcel:stall-01'));
});
test('self-crossing geometry rejected',()=>{
 const x=fixture();get(x,'stall-01').geometry.points=[[40,40],[70,70],[70,40],[40,70]];
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('invalid_geometry:stall-01'));
});
test('NaN and Infinity never become coordinates',()=>{
 const x=fixture();get(x,'stall-01').geometry.points[0][0]=Infinity;
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('invalid_geometry:stall-01'));
});
test('source-derived features require source register link',()=>{
 const x=fixture();get(x,'building').source_id='UNLISTED';
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('source_not_in_register:building'));
});
test('north and scale not asserted without independent verification',()=>{
 const out=renderEvConceptSheet(fixture());
 assert.ok(out.svg.includes('North: NOT VERIFIED'));
 assert.ok(out.svg.includes('Scale: NOT TO SCALE'));
 assert.equal(out.svg.includes('1:500'),false);
});
test('source rights declared restricted blocks non-synthetic drawing',()=>{
 const x=fixture();x.demonstration=false;x.independent_source_review=true;
 x.sources[0].rights='restricted';
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('source_rights_or_url_unverified:SOURCE-SYNTH'));
});
test('missing proposed charger is a hard stop',()=>{
 const x=fixture();x.features=x.features.filter(f=>f.kind!=='charger');
 assert.ok(auditEvDrawingModel(x).hold_reasons.includes('proposed_charger_geometry_missing'));
});
test('renderer leaves caller input unmodified and returns deterministic output',()=>{
 const x=fixture(),b=structuredClone(x);
 const first=renderEvConceptSheet(x),second=renderEvConceptSheet(x);
 assert.deepEqual(x,b);
 assert.equal(first.svg,second.svg);
 assert.equal(first.qa.model_sha256,second.qa.model_sha256);
});
test('no external asset requests, scripts, or customer payment links in markup',()=>{
 const out=renderEvConceptSheet(fixture());
 for(const bad of ['<image','<foreignObject','<script','<iframe','href=','checkout']) assert.ok(!out.svg.includes(bad),bad);
});
