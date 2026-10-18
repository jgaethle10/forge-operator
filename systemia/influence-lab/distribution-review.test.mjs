import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileInfluenceBrief,INFLUENCE_SCHEMA} from './influence-lab.mjs';
import {planInfluenceGraphics} from './graphics-bridge.mjs';
import {compileInfluenceDistributionReview} from './distribution-review.mjs';

const reference=JSON.parse(fs.readFileSync(new URL('../graphics-command/campaigns/website-audit-attention.json',import.meta.url),'utf8'));
const at='2026-10-17T23:00:00.000Z';
const input=()=>compileInfluenceBrief({schema:INFLUENCE_SCHEMA,campaignId:'influence-website-audit-001',
  product:'Website Audit',offerKey:'website-audit',offerUrl:reference.offerUrl,
  buyerProblem:'Understand where visitors might hesitate',targetCommunity:'Small business operators',
  evidenceRefs:['https://example.org/review-only-fixture']});
const source=()=>{
  const brief=input();
  return {brief,slate:planInfluenceGraphics({brief,referenceCampaign:reference}),at};
};
const canary=()=>({
  schema:'evercraft.chum.commerce-canary.v2',
  generated_at:at,status:'pass',route_state:'owned_gateway_probed',base44_used:false,
  doctrine:{read_only:true,checkout_created:false,payment_attempted:false},
  results:[{public_id:'audit-center-website-audit-machine-v1',valid:true,
    offer_door_valid:true,review_door_valid:true,buyer_required:true,buyer_door_valid:true}],
});
test('creates twelve uniquely tagged, held commercial draft handoffs',()=>{
  const pack=compileInfluenceDistributionReview(source());
  assert.equal(pack.copyAndLinkDrafts.length,12);
  assert.equal(new Set(pack.copyAndLinkDrafts.map(x=>x.link)).size,12);
  assert.equal(pack.state,'review_only');
  assert.equal(pack.canary.state,'unknown');
  assert.equal(pack.buyerJourney.independentlyVerifiedSettlements,null);
  assert.equal(pack.buyerJourney.deliveryReceipts,null);
  assert.equal(pack.boundaries.publicationAuthority,false);
  for(const item of pack.copyAndLinkDrafts){
    assert.equal(item.reviewState,'held');
    assert.match(item.captionDraft,/Insert/);
    assert.ok(item.blockers.includes('real_media_and_licensed_rights_missing'));
    assert.equal(item.providerPostId,null);
    assert.equal(item.contactAuthorized,false);
    assert.equal(item.publicationAuthority,false);
    assert.equal(new URL(item.link).origin,'https://fabric.systemiacommandcenters.com');
  }
});
test('read-only canary cannot be promoted into settlement or full readiness',()=>{
  const pack=compileInfluenceDistributionReview({...source(),canaryReceipt:canary()});
  assert.equal(pack.canary.state,'canary_reports_readable');
  assert.equal(pack.canary.externalHttpReceiptAccepted,false);
  assert.equal(pack.canary.providerSettlementVerified,false);
  assert.equal(pack.buyerJourney.createdCheckouts,null);
  assert.equal(pack.buyerJourney.incrementalNetRevenueCents,null);
  assert.equal(pack.boundaries.productionReady,false);
  assert.equal(pack.copyAndLinkDrafts.every(x=>x.reviewState==='held'),true);
});
test('stale canary and fake provider flags fail closed',()=>{
  const old=canary();old.generated_at='2026-10-01T00:00:00Z';
  assert.equal(compileInfluenceDistributionReview({...source(),canaryReceipt:old}).canary.state,'unknown');
  const bad=canary();bad.doctrine.checkout_created=true;
  assert.equal(compileInfluenceDistributionReview({...source(),canaryReceipt:bad}).canary.reason,'chum_canary_held_or_not_read_only');
  const missing=canary();missing.results[0].buyer_door_valid=false;
  assert.equal(compileInfluenceDistributionReview({...source(),canaryReceipt:missing}).canary.reason,'website_audit_route_not_readable_in_canary');
});
test('wrong offer identity, bad graphic lineage or unauthorized media are denied',()=>{
  const p=source();
  assert.throws(()=>compileInfluenceDistributionReview({...p,slate:{...p.slate,briefDigest:'forged'}}),/lineage_mismatch/);
  assert.throws(()=>compileInfluenceDistributionReview({...p,slate:{...p.slate,publicationAuthority:true}}),/lineage_mismatch/);
  const edit={...p.slate,treatments:p.slate.treatments.map((t,i)=>i===0?{...t,campaign:{...t.campaign,offerUrl:'https://example.org'}}:t)};
  assert.throws(()=>compileInfluenceDistributionReview({...p,slate:edit}),/creative_mismatch/);
});
test('draft URLs have no email addresses, payment tokens, or cookie-like identifiers',()=>{
  const pack=compileInfluenceDistributionReview(source());
  for(const item of pack.copyAndLinkDrafts){
    const url=new URL(item.link);
    assert.equal(url.searchParams.has('session_id'),false);
    assert.equal(url.searchParams.has('email'),false);
    assert.equal(url.searchParams.has('payment_intent'),false);
    assert.equal(url.searchParams.has('ref'),false);
    assert.equal(url.searchParams.get('utm_medium'),'owned_content');
  }
});
test('does not mistake any other offer for the named Website Audit canary',()=>{
  const c=canary();c.results=[{...c.results[0],public_id:'some-other-public-offer-v1'}];
  assert.equal(compileInfluenceDistributionReview({...source(),canaryReceipt:c}).canary.state,'unknown');
});

test('Saban browser supplied report cannot turn a held distribution pack live',()=>{
  const p=source();
  const report={schema:'evercraft.influence-lab.saban-website-audit-browser.v1',
    observedAt:at,target:'https://fabric.systemiacommandcenters.com/offers/website-audit',
    boundary:{readOnly:true,formSubmitAllowed:false,paymentPosted:false,
      checkoutCreated:false,settledRevenueVerified:false},
    verdict:'read_only_page_ui_checks_passed',blockers:[],
    views:['mobile','desktop'].map(name=>({name,status:200,finalOrigin:'https://fabric.systemiacommandcenters.com',
      pageRendered:true,offerNameVisible:true,priceVisible:true,emailFieldPresent:true,
      checkoutCtaVisible:true,checkoutFormActionCorrect:true,checkoutFormMethodPost:true,
      canonicalMatches:true,ogImageAllowed:true,
      screenshotPath:name+'-website-audit.png',screenshotSha256:'sha256:'+'b'.repeat(64),
      errors:[],blockedNonReadMethods:[],paymentPosted:false,formSubmitted:false,
      checkoutCreated:false,providerSettlementVerified:false}))};
  const receipt=compileInfluenceDistributionReview({...p,sabanReceipt:report});
  assert.equal(receipt.sabanBrowser.state,'untrusted_report_says_ui_visible');
  assert.equal(receipt.buyerJourney.createdCheckouts,null);
  assert.equal(receipt.boundaries.evercraftClipPublished,false);
  assert.equal(receipt.copyAndLinkDrafts.every(x=>x.reviewState==='held'),true);
});
