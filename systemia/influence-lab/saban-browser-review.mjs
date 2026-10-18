const TARGET='https://fabric.systemiacommandcenters.com/offers/website-audit';
const SHA=/^sha256:[0-9a-f]{64}$/;
const allowedStates=['mobile','desktop'];
const held=(reason)=>({schema:'evercraft.influence-lab.browser-acceptance.v1',
  state:'held',reason,sourceAuthentication:'unverified_supplied_browser_report',
  mobileAndDesktopVisuallyObserved:false,ctaAndFormDisplayed:false,ogImageFetchedAndVerified:false,
  checkoutCreated:false,paymentSettled:false,fulfillmentVerified:false,releaseAuthorized:false});
/** Assess a purported Saban screenshot receipt, never authenticate it as provider evidence. */
export function assessInfluenceSabanBrowserReceipt({receipt,at=new Date().toISOString()}={}){
  if(receipt?.schema!=='evercraft.influence-lab.saban-website-audit-browser.v1')return held('schema_invalid_or_missing');
  if(receipt.target!==TARGET||receipt.boundary?.readOnly!==true||
      receipt.boundary?.formSubmitAllowed!==false||
      receipt.boundary?.paymentPosted!==false||
      receipt.boundary?.checkoutCreated!==false||
      receipt.boundary?.settledRevenueVerified!==false)return held('browser_authority_boundary_invalid');
  const when=Date.parse(receipt.observedAt),now=Date.parse(at);
  if(!Number.isFinite(when)||!Number.isFinite(now)||when>now+300000||
      now-when>24*3600000)return held('browser_observation_stale_or_future');
  if(!Array.isArray(receipt.views)||receipt.views.length!==2)return held('mobile_desktop_pair_missing');
  if(receipt.verdict!=='read_only_page_ui_checks_passed')return held('browser_receipt_not_passed');
  if(!Array.isArray(receipt.blockers)||receipt.blockers.length>0)return held('browser_blockers_present');
  const byId=new Map();
  for(const view of receipt.views){
    if(!allowedStates.includes(view?.name)||byId.has(view.name))return held('browser_duplicate_or_unknown_view');
    byId.set(view.name,view);
    if(view.status!==200||view.finalOrigin!=='https://fabric.systemiacommandcenters.com'||
      view.pageRendered!==true||view.offerNameVisible!==true||view.priceVisible!==true||
      view.emailFieldPresent!==true||view.checkoutCtaVisible!==true||
      view.checkoutFormActionCorrect!==true||view.checkoutFormMethodPost!==true||
      view.canonicalMatches!==true||view.ogImageAllowed!==true)return held('browser_page_form_or_metadata_missing');
    if(view.paymentPosted!==false||view.formSubmitted!==false||view.checkoutCreated!==false||
      view.providerSettlementVerified!==false)return held('browser_side_effect_boundary_broken');
    if(!view.screenshotPath||!new RegExp('^'+view.name+'-website-audit\\.png$').test(view.screenshotPath)||
      !SHA.test(view.screenshotSha256||''))return held('browser_screenshot_digest_missing');
    if(!Array.isArray(view.errors)||view.errors.length||
      !Array.isArray(view.blockedNonReadMethods)||view.blockedNonReadMethods.length){
      return held('browser_errors_or_nonread_traffic_present');
    }
  }
  if([...allowedStates].some(id=>!byId.has(id)))return held('required_view_missing');
  return {schema:'evercraft.influence-lab.browser-acceptance.v1',state:'untrusted_report_says_ui_visible',
    reason:'read_only_browser_ui_not_checkout_or_payment',sourceAuthentication:'unverified_supplied_browser_report',
    observedAt:new Date(when).toISOString(),
    screenshotDigests:Object.fromEntries([...allowedStates].map(id=>[id,byId.get(id).screenshotSha256])),
    mobileAndDesktopVisuallyObserved:true,ctaAndFormDisplayed:true,
    ogImageFetchedAndVerified:false,checkoutCreated:false,paymentSettled:false,
    fulfillmentVerified:false,releaseAuthorized:false};
}
