import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileInfluenceBrief,INFLUENCE_SCHEMA} from './influence-lab.mjs';
import {planInfluenceGraphics} from './graphics-bridge.mjs';

const reference=JSON.parse(fs.readFileSync(new URL('../graphics-command/campaigns/website-audit-attention.json',import.meta.url),'utf8'));
const draft=()=>compileInfluenceBrief({
  schema:INFLUENCE_SCHEMA,campaignId:'evercraft-influence-audit-001',
  product:'Systemia Website Audit',offerKey:'website-audit',
  offerUrl:reference.offerUrl,buyerProblem:'Visitors cannot tell which action to take',
  targetCommunity:'Independent service business owners',
  evidenceRefs:['https://example.org/permissioned-test-evidence'],
});

test('all three influence variants compile into native Graphics Command plans with QC',()=>{
  const slate=planInfluenceGraphics({brief:draft(),referenceCampaign:reference});
  assert.equal(slate.treatments.length,3);
  assert.deepEqual(slate.treatments.map(x=>x.key),['designer','human','proof']);
  for(const item of slate.treatments){
    assert.equal(item.campaign.schema,'evercraft.commercial-attention-campaign.v1');
    assert.equal(item.plan.schema,'evercraft.graphics-command.commercial-plan.v1');
    assert.equal(item.scrollStop.status,'pass');
    assert.equal(item.plan.campaignDigest,item.campaign.digest);
    assert.equal(item.plan.publicationAuthority,false);
    assert.equal(item.existingRendererCompatible,false);
    assert.equal(item.visualsRendered,false);
    assert.equal(item.campaign.truthState,'concept_requires_actual_evidence');
    assert.equal(item.plan.truth.sourceRefs.includes(reference.offerUrl),true);
    assert.equal(item.plan.truth.sourceRefs.includes('https://example.org/permissioned-test-evidence'),true);
  }
  assert.equal(slate.publicationAuthority,false);
  assert.equal(slate.systemiaAdmitted,false);
});
test('each treatment has genuinely different story, sound, scene intent and duration',()=>{
  const s=planInfluenceGraphics({brief:draft(),referenceCampaign:reference}).treatments;
  assert.equal(new Set(s.map(x=>x.campaign.creative.hook)).size,3);
  assert.equal(new Set(s.map(x=>x.campaign.creative.visualMetaphor)).size,3);
  assert.equal(new Set(s.map(x=>x.campaign.creative.sonicHook.join('|'))).size,3);
  assert.equal(new Set(s.map(x=>x.plan.motion.targetDurationSec)).size,3);
  assert.ok(s.every(x=>x.plan.motion.beats.length===4));
});
test('graphics bridge cannot launder a mismatched price or destination into a product brief',()=>{
  const brief=draft();
  assert.throws(()=>planInfluenceGraphics({brief,referenceCampaign:{...reference,offerUrl:'https://unrelated.example/buy'}}),/offer_url_mismatch/);
});
test('graphics review cannot accept an unbound or self-authorized brief',()=>{
  assert.throws(()=>planInfluenceGraphics({brief:{...draft(),releaseState:'published'},referenceCampaign:reference}),/not_review_only/);
  assert.throws(()=>planInfluenceGraphics({brief:{...draft(),digest:''},referenceCampaign:reference}),/not_review_only/);
});
test('same input produces deterministic campaign and storyboard digests',()=>{
  const first=planInfluenceGraphics({brief:draft(),referenceCampaign:reference});
  const second=planInfluenceGraphics({brief:draft(),referenceCampaign:reference});
  assert.equal(first.digest,second.digest);
  assert.deepEqual(first.treatments.map(x=>x.plan.digest),second.treatments.map(x=>x.plan.digest));
});
