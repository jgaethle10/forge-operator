import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInfluenceSabanBrowserReceipt} from './saban-browser-review.mjs';

const observedAt='2026-10-18T06:30:00.000Z';
const SHA='sha256:'+'a'.repeat(64);
function view(name){
  return {name,status:200,finalOrigin:'https://fabric.systemiacommandcenters.com',
    pageRendered:true,offerNameVisible:true,priceVisible:true,emailFieldPresent:true,
    checkoutCtaVisible:true,checkoutFormActionCorrect:true,checkoutFormMethodPost:true,
    canonicalMatches:true,ogImageAllowed:true,
    screenshotPath:name+'-website-audit.png',screenshotSha256:SHA,
    errors:[],blockedNonReadMethods:[],
    paymentPosted:false,formSubmitted:false,checkoutCreated:false,
    providerSettlementVerified:false};
}
function specimen(){
  return {schema:'evercraft.influence-lab.saban-website-audit-browser.v1',
    observedAt,target:'https://fabric.systemiacommandcenters.com/offers/website-audit',
    boundary:{readOnly:true,formSubmitAllowed:false,paymentPosted:false,
      checkoutCreated:false,settledRevenueVerified:false},
    verdict:'read_only_page_ui_checks_passed',blockers:[],
    views:[view('mobile'),view('desktop')]};
}
const inspect=receipt=>assessInfluenceSabanBrowserReceipt({receipt,at:observedAt});
test('complete Saban report remains untrusted UI evidence, never a sale',()=>{
  const result=inspect(specimen());
  assert.equal(result.state,'untrusted_report_says_ui_visible');
  assert.equal(result.mobileAndDesktopVisuallyObserved,true);
  assert.equal(result.ctaAndFormDisplayed,true);
  assert.equal(result.ogImageFetchedAndVerified,false);
  assert.equal(result.checkoutCreated,false);
  assert.equal(result.paymentSettled,false);
  assert.equal(result.fulfillmentVerified,false);
  assert.equal(result.releaseAuthorized,false);
});
test('rejects fake success if checkout or browser side effects were attempted',()=>{
  const r=specimen();r.boundary.formSubmitAllowed=true;
  assert.equal(inspect(r).state,'held');
  const one=specimen();one.views[0].formSubmitted=true;
  assert.equal(inspect(one).reason,'browser_side_effect_boundary_broken');
  const two=specimen();two.views[1].blockedNonReadMethods=['POST'];
  assert.equal(inspect(two).reason,'browser_errors_or_nonread_traffic_present');
});
test('rejects forged or incomplete mobile/desktop UI and screenshots',()=>{
  const noDesktop=specimen();noDesktop.views.pop();
  assert.equal(inspect(noDesktop).reason,'mobile_desktop_pair_missing');
  const noPrice=specimen();noPrice.views[0].priceVisible=false;
  assert.equal(inspect(noPrice).reason,'browser_page_form_or_metadata_missing');
  const noDigest=specimen();noDigest.views[1].screenshotSha256='not-a-digest';
  assert.equal(inspect(noDigest).reason,'browser_screenshot_digest_missing');
});
test('rejects stale or future-dated observation, spoofed route and fake origin',()=>{
  const stale=specimen();stale.observedAt='2026-09-01T00:00:00Z';
  assert.equal(inspect(stale).reason,'browser_observation_stale_or_future');
  const future=specimen();future.observedAt='2026-10-19T06:30:00Z';
  assert.equal(inspect(future).reason,'browser_observation_stale_or_future');
  const spoof=specimen();spoof.target='https://example.org/offers/website-audit';
  assert.equal(inspect(spoof).reason,'browser_authority_boundary_invalid');
  const alien=specimen();alien.views[0].finalOrigin='https://example.org';
  assert.equal(inspect(alien).reason,'browser_page_form_or_metadata_missing');
});
