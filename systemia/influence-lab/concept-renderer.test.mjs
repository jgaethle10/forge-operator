import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {INFLUENCE_SCHEMA,compileInfluenceBrief} from './influence-lab.mjs';
import {planInfluenceGraphics} from './graphics-bridge.mjs';
import {renderInfluenceConceptSvg,renderInfluenceConceptCollection} from './concept-renderer.mjs';

const ref=JSON.parse(fs.readFileSync(new URL('../graphics-command/campaigns/website-audit-attention.json',import.meta.url),'utf8'));
const slate=()=>planInfluenceGraphics({referenceCampaign:ref,brief:compileInfluenceBrief({
  schema:INFLUENCE_SCHEMA,campaignId:'website-audit-influence-preview-001',
  product:'Systemia Website Audit',offerKey:'website-audit',offerUrl:ref.offerUrl,
  buyerProblem:'Public-facing navigation may be confusing',
  targetCommunity:'Small-business operators',evidenceRefs:['https://example.org/evidence-requires-human-review'],
})});

test('renderer makes 12 clearly marked, distinct draft compositions',()=>{
  const s=slate(),collection=renderInfluenceConceptCollection(s);
  assert.equal(collection.state,'concept_only');
  assert.equal(collection.publicationAuthority,false);
  assert.equal(collection.productionReady,false);
  for(const key of ['designer','human','proof']){
    assert.deepEqual(Object.keys(collection.outputs[key]),['feed','square','story','hero-wide']);
    for(const [format,svg] of Object.entries(collection.outputs[key])){
      const dims=collection.formats[format];
      assert.match(svg,new RegExp('viewBox="0 0 '+dims.width+' '+dims.height+'"'));
      assert.match(svg,/CONCEPT • NOT PRODUCT FOOTAGE/);
      assert.match(svg,/EDITORIAL REVIEW ONLY/);
      assert.match(svg,/<title>/);
      assert.doesNotMatch(svg,/viewBox="0 0 0 0"/);
    }
  }
  assert.match(collection.outputs.designer.feed,/THE PASSAGE/);
  assert.match(collection.outputs.human.feed,/REAL FOOTAGE REQUIRED/);
  assert.match(collection.outputs.proof.feed,/DEMONSTRATION SLOT/);
  assert.notEqual(collection.outputs.designer.feed,collection.outputs.human.feed);
  assert.notEqual(collection.outputs.human.feed,collection.outputs.proof.feed);
});
test('an attempt to override concept boundary fails closed',()=>{
  const s=slate();const t={...s.treatments[0],publicationAuthority:true};
  assert.throws(()=>renderInfluenceConceptSvg(t),/publication_boundary_invalid/);
  assert.throws(()=>renderInfluenceConceptCollection({...s,publicationAuthority:true}),/slate_invalid/);
});
test('unknown dimensions, corrupt treatment and absent rights requirement fail',()=>{
  const s=slate();
  assert.throws(()=>renderInfluenceConceptSvg(s.treatments[0],'banner'),/format_invalid/);
  assert.throws(()=>renderInfluenceConceptSvg({...s.treatments[0],key:'paid_endorsement'}),/invalid_treatment/);
  assert.throws(()=>renderInfluenceConceptSvg({...s.treatments[0],requiredSourceMedia:[]}),/source_media_requirements_missing/);
});
