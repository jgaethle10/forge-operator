import {pathToFileURL} from 'node:url';
import fs from 'node:fs';

export const WEBSITE_AUDIT_OFFER_URL='https://fabric.systemiacommandcenters.com/offers/website-audit';
const ORIGIN=new URL(WEBSITE_AUDIT_OFFER_URL).origin;
const MAX_CAPTURE=131072;

function noPaymentDoctrine(){
  return {readOnlyHttpGet:true,checkoutCreated:false,paymentAttempted:false,
    providerSettlementVerified:false,deliveryVerified:false,publicPublishingAuthorized:false};
}
/** Only transport-observed HTTP reachability. Never interprets it as commercial fulfillment. */
export async function observeWebsiteAuditDoor({transport=fetch,at=new Date().toISOString()}={}){
  const report={schema:'evercraft.influence-lab.website-audit-http-observation.v1',
    requestUrl:WEBSITE_AUDIT_OFFER_URL,observedAt:at,method:'GET',
    status:'held',httpStatus:null,contentType:null,nonempty:false,
    firstPartyFinalUrl:false,rawHtmlOfferPriceSeen:null,rawHtmlOfferNameSeen:null,
    rawHtmlCtaVerified:false,checkoutVerified:false,rightsState:'not_applicable',
    evidenceKind:'read_only_http_transport_observation',origin:ORIGIN,
    bodySampleBytes:0,sampledOnly:true,reason:'request_not_started',
    boundaries:noPaymentDoctrine()};
  try{
    const response=await transport(WEBSITE_AUDIT_OFFER_URL,{
      method:'GET',redirect:'manual',
      signal:AbortSignal.timeout(12000),
      headers:{accept:'text/html', 'user-agent':'Evercraft-InfluenceLab-BuyerDoorProbe/1.0'},
    });
    report.httpStatus=response.status;
    report.contentType=response.headers.get('content-type')||'';
    report.firstPartyFinalUrl=new URL(response.url||WEBSITE_AUDIT_OFFER_URL).origin===ORIGIN;
    if(response.status>=300&&response.status<400){
      report.reason='redirect_requires_independent_review';return report;
    }
    if(response.status!==200){
      report.reason='http_status_not_200';return report;
    }
    if(!report.firstPartyFinalUrl){
      report.reason='origin_untrusted';return report;
    }
    if(!/text\/html/i.test(report.contentType)){
      report.reason='response_not_html';return report;
    }
    const reader=response.body?.getReader?.();
    if(!reader){report.reason='response_body_unavailable';return report;}
    const chunks=[];
    let total=0;
    while(total<MAX_CAPTURE){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value?.length)continue;
      const available=Math.min(value.length,MAX_CAPTURE-total);
      chunks.push(Buffer.from(value.subarray(0,available)));
      total+=available;
      if(available<value.length)break;
    }
    try{await reader.cancel();}catch{}
    report.bodySampleBytes=total;
    report.nonempty=total>0;
    if(!report.nonempty){report.reason='html_body_empty';return report;}
    const snippet=Buffer.concat(chunks).toString('utf8');
    report.rawHtmlOfferNameSeen=/quick win audit|website audit/i.test(snippet);
    report.rawHtmlOfferPriceSeen=/(\$|&#36;|USD\s*)\s*49(?:\b|<)/i.test(snippet);
    report.status='readable_http_only';
    report.reason='http_200_html_sample_observed_no_commerce_verification';
    return report;
  }catch(err){
    report.reason='transport_error';
    report.errorKind=err?.name==='TimeoutError'?'timeout':'unreachable_or_transport_failed';
    return report;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const i=process.argv.indexOf('--out');
  if(i<0||!process.argv[i+1]){console.error('usage: node offer-door-probe.mjs --out <receipt.json>');process.exitCode=2;}
  else{
    const result=await observeWebsiteAuditDoor();
    // The receipt is a low-trust observation, never checkout or payment evidence.
    fs.writeFileSync(process.argv[i+1],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({status:result.status,httpStatus:result.httpStatus,reason:result.reason,
      checkoutVerified:false,providerSettlementVerified:false}));
  }
}
