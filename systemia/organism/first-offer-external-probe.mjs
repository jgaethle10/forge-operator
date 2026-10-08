#!/usr/bin/env node
// Independent, GET-only buyer-path proof. It never prepares checkout or charges.
import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OFFER_ONE_URL='https://fabric.systemiacommandcenters.com/offers/ibmi-74-deadline-xray';
const MAX_BYTES=150000;
const EXPECTED_FORM='/api/offers/ibmi-74-deadline-xray/checkout';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');

// Public DNS / TCP diagnostics only. Never ask the host to run remote shell
// commands or probe arbitrary user-supplied hosts.
export async function inspectOfferIngressTransport({
 hostname='fabric.systemiacommandcenters.com',lookup=dns.resolve4,connect=net.createConnection,
}={}){
 if(hostname!=='fabric.systemiacommandcenters.com')throw Error('host_not_allowlisted');
 const state={dns:'unknown',ipv4_count:0,tcp_443:'not_tested'};
 try{
   const ips=await lookup(hostname);
   state.ipv4_count=Array.isArray(ips)?ips.length:0;
   state.dns=state.ipv4_count?'resolved':'no_ipv4';
 }catch(e){
   state.dns='error';
   state.dns_error_code=String(e?.code||e?.name||'lookup_error').slice(0,50);
   return state;
 }
 if(state.ipv4_count===0)return state;
 state.tcp_443=await new Promise(resolve=>{
   const sock=connect({host:hostname,port:443});
   let done=false;
   const finish=(code)=>{
     if(done)return;
     done=true;sock.destroy();resolve(code);
   };
   sock.setTimeout(4000,()=>finish('timeout'));
   sock.once('connect',()=>finish('reachable'));
   sock.once('error',e=>finish(String(e?.code||'connect_error').slice(0,50)));
 });
 return state;
}

export async function inspectFirstOfferBuyerPage({request=fetch,now=new Date(),timeoutMs=12000,diagnose=inspectOfferIngressTransport}={}){
 const checkedAt=new Date(now).toISOString();
 const result={
   schema:'evercraft.systemia.offer-one.external-buyer-probe.v1',
   checked_at:checkedAt,
   checked_from:'independent_http_client',
   url:OFFER_ONE_URL,
   state:'held',
   verified:false,
   checkout_verified:false,
   payment_verified:false,
   publication_authority:false,
   http_status:null,
   html_sha256:null,
   reason:'not_probed',
 };
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
   // Redirects are never followed. No alternate host or inherited credentials.
   const response=await request(OFFER_ONE_URL,{
     method:'GET',redirect:'manual',signal:controller.signal,
     headers:{accept:'text/html','user-agent':'Evercraft-Offer-One-External-ReadOnly/1.0'}
   });
   result.http_status=Number(response.status);
   if(response.status!==200){
     result.reason=response.status>=300&&response.status<400
      ? 'redirect_not_verified'
      : 'http_'+String(response.status);
     return result;
   }
   const contentType=String(response.headers.get('content-type')||'');
   if(!contentType.toLowerCase().includes('text/html')){
     result.reason='not_html';
     return result;
   }
   const advertisedLength=Number(response.headers.get('content-length')||0);
   if(advertisedLength>MAX_BYTES){result.reason='oversized_response';return result;}
   const html=await response.text();
   if(Buffer.byteLength(html)>MAX_BYTES){result.reason='oversized_response';return result;}
   result.html_sha256=hash(html);
   const semantic=/IBM\s*i\s*7\.4/i.test(html)
     && /Deadline\s*X-Ray/i.test(html);
   // This is only page-content proof, never a quote/payment proof.
   const priced=/\$250(?:\b|<)/i.test(html);
   const form=html.includes('action="'+EXPECTED_FORM+'"') && /method="post"/i.test(html);
   const branded=/Evercraft/i.test(html);
   const risk=/(?:live checkout verified|payment successfully received|certified IBM|guaranteed upgrade)/i.test(html);
   if(!branded||!semantic||!priced||!form||risk){
     result.reason=!branded?'brand_not_present':!semantic?'specific_offer_not_present':
       !priced?'public_price_missing':!form?'buyer_checkout_form_missing':'unsupported_promise_detected';
     return result;
   }
   result.state='externally_verified_buyer_page';
   result.verified=true;
   result.reason='page_identity_price_and_form_visible';
   return result;
 }catch(error){
   result.reason='network_or_tls_unavailable';
   result.error_code=String(error?.code||error?.cause?.code||error?.name||'fetch_error').slice(0,100);
   try{
     result.ingress=await diagnose();
     if(result.ingress?.dns==='error'||result.ingress?.dns==='no_ipv4')result.reason='public_dns_unresolved';
     else if(result.ingress?.tcp_443!=='reachable')result.reason='public_tcp_443_unreachable';
     else result.reason='http_or_tls_handshake_unavailable';
   }catch{result.ingress={state:'diagnosis_unavailable'};}
   return result;
 }finally{clearTimeout(timer);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await inspectFirstOfferBuyerPage();
 await fs.writeFile(process.argv[2]||'first-offer-external-probe.json',JSON.stringify(result,null,2)+'\n');
 process.stdout.write(JSON.stringify({
   schema:result.schema,state:result.state,verified:result.verified,
   reason:result.reason,http_status:result.http_status,
   ingress:result.ingress||null,error_code:result.error_code||null,
   checkout_verified:false,payment_verified:false,
 })+'\n');
 // Held is a truthful field result, not a CI failure. Strict mode is available
 // for a later *explicitly authorized* release gate.
 if(process.argv.includes('--strict')&&!result.verified)process.exitCode=1;
}
