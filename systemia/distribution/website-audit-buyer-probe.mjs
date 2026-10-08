#!/usr/bin/env node
// Independent read-only public offer inspection. Not a payment-provider or buyer proof.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WEBSITE_AUDIT_URL='https://fabric.systemiacommandcenters.com/offers/website-audit';
const LIMIT_BYTES=200000;
const toHash=(v)=>'sha256:'+createHash('sha256').update(v).digest('hex');

export async function inspectWebsiteAuditBuyerPage({
  request=fetch, now=new Date(), timeoutMs=12000,
}={}){
  const at=new Date(now);
  if(!Number.isFinite(at.getTime()))throw Error('valid_observation_time_required');
  const receipt={
    schema:'evercraft.systemia.website-audit-external-buyer-probe.v1',
    observed_at:at.toISOString(),
    checked_from:'independent_get_only_client',
    url:WEBSITE_AUDIT_URL, state:'held', verified:false,
    html_sha256:null, http_status:null, reason:'not_checked',
    buyer_page_verified:false, checkout_verified:false, payment_verified:false,
    distribution_authorized:false, outreach_authorized:false,
    publication_authorized:false, shipping_verified:false,
    source_evidence_not_release_authority:true,
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await request(WEBSITE_AUDIT_URL,{
      method:'GET',redirect:'manual',signal:controller.signal,
      headers:{'accept':'text/html','user-agent':'Evercraft-Website-Audit-Independent-ReadOnly/1.0'},
    });
    receipt.http_status=Number(response.status);
    if(response.status!==200){
      receipt.reason=response.status>=300&&response.status<400?'redirect_not_verified':'http_'+response.status;
      return receipt;
    }
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')){receipt.reason='not_html';return receipt;}
    const advertised=Number(response.headers.get('content-length')||0);
    if(advertised>LIMIT_BYTES){receipt.reason='oversized_content';return receipt;}
    const html=await response.text();
    if(Buffer.byteLength(html,'utf8')>LIMIT_BYTES){receipt.reason='oversized_content';return receipt;}
    receipt.html_sha256=toHash(html);
    const hasBrand=/Evercraft/i.test(html);
    const hasOffer=/Quick Win Audit/i.test(html)&&/website/i.test(html);
    const hasPrice=/\\$49(?:\\b|<)/.test(html);
    const hasCheckout=html.includes('/api/offers/website-audit/checkout')&&/method=["']?post/i.test(html);
    const hasAuthority=/Evercraft Payments/i.test(html);
    const unsafe=/(?:guaranteed rankings|guaranteed new customers|payment successfully received|checkout already verified)/i.test(html);
    if(!hasBrand||!hasOffer||!hasPrice||!hasCheckout||!hasAuthority||unsafe){
      receipt.reason=!hasBrand?'brand_missing':!hasOffer?'offer_identity_missing':!hasPrice?'price_missing':
        !hasCheckout?'buyer_form_missing':!hasAuthority?'payments_boundary_missing':'unsupported_claim';
      return receipt;
    }
    receipt.state='externally_verified_buyer_page_only';
    receipt.verified=true;
    receipt.buyer_page_verified=true;
    receipt.reason='identity_price_and_checkout_form_visible_not_checkout_proved';
    return receipt;
  }catch(err){
    receipt.reason='network_or_tls_unavailable';
    receipt.error_code=String(err?.cause?.code||err?.code||err?.name||'fetch_failed').slice(0,80);
    return receipt;
  }finally{clearTimeout(timer);}
}

export function formatWebsiteAuditBuyerProbe(receipt){
  const status=receipt.buyer_page_verified?'Page independently visible. Checkout not verified.':'HELD: '+receipt.reason;
  return [
    '## Systemia $49 Website Audit buyer path',
    '',
    '**'+status+'**',
    '',
    '| Gate | Evidence |',
    '| --- | --- |',
    '| Public HTML + correct $49 page/form | '+(receipt.buyer_page_verified?'Confirmed by this GET only':'Not confirmed')+' |',
    '| Buyer checkout creates order | Not checked |',
    '| Provider-settled payment | Not checked |',
    '| Clip publication / qualified visitors | Not checked |',
    '| Shipping completion | Not checked |',
    '',
    'This run never sends traffic, creates checkout sessions, contacts prospects, publishes posts, or confirms customer revenue.',
    '',
  ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const output=process.argv[2]||'website-audit-external-buyer-probe.json';
  const receipt=await inspectWebsiteAuditBuyerPage();
  await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,formatWebsiteAuditBuyerProbe(receipt));
  process.stdout.write(JSON.stringify({state:receipt.state,verified:receipt.verified,reason:receipt.reason,http_status:receipt.http_status,checkout_verified:false,payment_verified:false})+'\n');
  if(process.argv.includes('--strict')&&!receipt.verified)process.exitCode=1;
}
