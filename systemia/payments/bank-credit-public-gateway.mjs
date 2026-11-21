/**
 * Evercraft Payments | public-only bank-credit buyer page gateway.
 *
 * The private banking runtime listens on its own LOOPBACK port. This distinct
 * loopback listener exposes only read-only, opaque signed buyer GET/HEAD
 * pages. The private operator API is never handled or proxied by this gateway,
 * even under a broad/wrong public reverse-proxy rule.
 *
 * Deployment must reverse proxy ONLY to this public listener. Neither this
 * module nor the private runtime serves a production domain on its own.
 */
import http from 'node:http';

const BUYER_PATH=/^\/pay\/bank\/bpr_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;
const RESPONSE_LIMIT=200_000;
const HEADERS={
 'cache-control':'private, no-store, no-cache',
 'referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff',
 'x-robots-tag':'noindex, nofollow, noarchive',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
const error=(res,code,label,head=false)=>{
 res.writeHead(code,{...HEADERS,'content-type':'text/plain; charset=utf-8'});
 res.end(head?'':label);
};
function verifiedPrivateUrl(value){
 let parsed;
 try{parsed=new URL(value)}catch{throw Error('bank_credit_private_target_invalid')}
 if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||
   !/^\d{1,5}$/.test(parsed.port)||
   Number(parsed.port)<1||Number(parsed.port)>65535||
   parsed.username||parsed.password||parsed.pathname!=='/'||
   parsed.search||parsed.hash)throw Error('bank_credit_private_target_invalid');
 return parsed.origin;
}
export async function startBankCreditPublicGateway({
 host='127.0.0.1',port=0,privateRuntimeUrl,
}={}){
 if(host!=='127.0.0.1')throw Error('bank_credit_public_gateway_loopback_only');
 const upstream=verifiedPrivateUrl(privateRuntimeUrl);
 const server=http.createServer(async(req,res)=>{
  const isHead=req.method==='HEAD';
  if(req.method!=='GET'&&!isHead)return error(res,405,'Method not allowed');
  if(typeof req.url!=='string'||req.url.length>240||
    !BUYER_PATH.test(req.url))return error(res,404,'Not found',isHead);
  let response;
  try{
   response=await fetch(upstream+req.url,{
    method:'GET',redirect:'manual',
    headers:{accept:'text/html, application/json'},
    signal:AbortSignal.timeout(5000),
   });
   if(![200,404,410].includes(response.status))
    return error(res,502,'Buyer page temporarily unavailable',isHead);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>RESPONSE_LIMIT)
    return error(res,502,'Buyer page temporarily unavailable',isHead);
   const contentType=response.headers.get('content-type')||'';
   if(response.status===200 && !/^text\/html(?:;|$)/i.test(contentType))
    return error(res,502,'Buyer page temporarily unavailable',isHead);
   if(response.status!==200 && !/^application\/json(?:;|$)/i.test(contentType))
    return error(res,502,'Buyer page temporarily unavailable',isHead);
   res.writeHead(response.status,{
    ...HEADERS,'content-type':contentType,
   });
   res.end(isHead?undefined:bytes);
  }catch{
   return error(res,502,'Buyer page temporarily unavailable',isHead);
  }
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,resolve);
 });
 return {
  url:'http://'+host+':'+server.address().port,
  close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
 };
}
