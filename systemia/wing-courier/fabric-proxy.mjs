// Optional Wing Courier path inside the EXISTING Evercraft Fabric HTTPS edge.
// It is disabled by default. It only relays an exact, authenticated private
// API subset to a loopback-only broker. It cannot connect to arbitrary hosts.
// Do not expose via an untrusted HTTP-facing proxy or use this for customer
// Messenger attachments, payments, or release authority.
import http from 'node:http';
import {Transform} from 'node:stream';

export const WING_COURIER_FABRIC_PREFIX='/api/internal/wing-courier';
const BROKER_HOST='127.0.0.1',BROKER_PORT=8791;
const EXPECTED_HOST='fabric.systemiacommandcenters.com';
const ID=/^[a-f0-9]{32}$/;
const WING=/^[a-z][a-z0-9-]{1,47}$/;
const MAX_ALLOWED_BYTES=3*1024**3+131072;
const DEFAULT_MAX_REQUEST_BYTES=512*1024*1024;
function respond(res,status,body){
 const raw=Buffer.from(JSON.stringify(body));
 res.writeHead(status,{'content-type':'application/json',
  'content-length':raw.length,'cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
 res.end(raw);
}
export function routeWingCourierPath(value){
 let u;
 try{u=new URL(String(value||'/'),'http://fabric.local');}catch{return null}
 const base=WING_COURIER_FABRIC_PREFIX;
 if(u.pathname!==base&&!u.pathname.startsWith(base+'/'))return null;
 const suffix=u.pathname.slice(base.length);
 const match=(pathname,method)=>{
  if(method==='POST'&&pathname==='/v1/envelopes')return true;
  if(method==='GET'&&pathname==='/v1/inbox')return true;
  const parts=/^\/v1\/envelopes\/([a-f0-9]{32})\/(blob|ack)$/.exec(pathname);
  if(!parts||!ID.test(parts[1]))return false;
  return (parts[2]==='blob'&&['GET','PUT'].includes(method))||
   (parts[2]==='ack'&&method==='POST');
 };
 return {suffix,search:u.search,query:u.searchParams,allowedMethod:match};
}
export function createWingCourierFabricProxy({enabled=false,
 approvedHost=EXPECTED_HOST,brokerHost=BROKER_HOST,brokerPort=BROKER_PORT,
 timeoutMs=120000,maxRequestBytes=DEFAULT_MAX_REQUEST_BYTES,
 maxActiveStreams=4}={}){
 if(![true,false].includes(enabled))throw Error('wing_fabric_enabled_boolean_required');
 if(![EXPECTED_HOST,'127.0.0.1'].includes(approvedHost))throw Error('wing_fabric_approved_host_invalid');
 if(brokerHost!==BROKER_HOST||
   (approvedHost===EXPECTED_HOST&&brokerPort!==BROKER_PORT)||
   !Number.isInteger(brokerPort)||brokerPort<1||brokerPort>65535)
  throw Error('wing_fabric_broker_loopback_route_fixed');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000)
  throw Error('wing_fabric_timeout_invalid');
 if(!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1024||maxRequestBytes>MAX_ALLOWED_BYTES)
  throw Error('wing_fabric_request_cap_invalid');
 if(!Number.isSafeInteger(maxActiveStreams)||maxActiveStreams<1||maxActiveStreams>64)
  throw Error('wing_fabric_stream_cap_invalid');
 let activeStreams=0;
 async function handle(req,res){
  const route=routeWingCourierPath(req.url);
  if(!route)return false;
  if(!enabled){respond(res,404,{error:'not_found'});return true;}
  const host=String(req.headers.host||'').toLowerCase().replace(/:\d+$/,'');
  if(host!==approvedHost){respond(res,404,{error:'not_found'});return true;}
  if(!route.allowedMethod(route.suffix,req.method)){
   respond(res,404,{error:'not_found'});return true;
  }
  if(route.suffix==='/v1/inbox'){
   if(route.query.size!==1||!WING.test(route.query.get('wing')||'')){
    respond(res,400,{error:'invalid_inbox_wing'});return true;
   }
  }else if(route.search){
   respond(res,400,{error:'unexpected_query'});return true;
  }
  // Forward no cookies, browser origins, forwarded IPs, arbitrary hostnames,
  // credentials embedded in URLs or unauthorised secondary protocol headers.
  const headers={};
  for(const key of ['authorization','content-type','content-length','accept']){
   if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
  }
  if(!headers.authorization){
   respond(res,401,{error:'wing_authentication_required'});return true;
  }
  if(!/^Bearer [\x21-\x7e]{32,512}$/.test(headers.authorization)){
   respond(res,401,{error:'wing_authentication_required'});return true;
  }
  const declared=headers['content-length'];
  if(declared!==undefined&&(!/^\d+$/.test(declared)||
     !Number.isSafeInteger(Number(declared)))){
   respond(res,400,{error:'invalid_request_length'});return true;
  }
  if(declared!==undefined&&Number(declared)>maxRequestBytes){
   respond(res,413,{error:'wing_request_too_large'});return true;
  }
  if(activeStreams>=maxActiveStreams){
   respond(res,429,{error:'wing_route_busy'});return true;
  }
  activeStreams++;
  let released=false,stopped=false;
  const release=()=>{if(!released){released=true;activeStreams--;}};
  res.once('close',release);
  const limiter=new Transform({
   transform(chunk,encoding,callback){
    this.bytes=(this.bytes||0)+chunk.length;
    if(this.bytes>maxRequestBytes)
     callback(Error('wing_fabric_request_too_large'));
    else callback(null,chunk);
   }
  });
  const upstream=http.request({
   host:brokerHost,port:brokerPort,method:req.method,
   path:route.suffix+route.search,headers,timeout:timeoutMs,
  },(response)=>{
   if(stopped){response.destroy();return}
   const allowed={};
   for(const key of ['content-type','content-length','x-content-type-options','referrer-policy']){
    const v=response.headers[key];if(typeof v==='string')allowed[key]=v;
   }
   allowed['cache-control']='no-store';
   res.writeHead(response.statusCode||502,allowed);
   response.pipe(res);
   response.on('error',()=>res.destroy());
  });
  function stop(status,error){
   if(stopped)return;
   stopped=true;
   if(!res.headersSent)respond(res,status,{error});
   else res.destroy();
   req.unpipe(limiter);limiter.unpipe(upstream);
   limiter.destroy();upstream.destroy();
   release();
  }
  upstream.on('timeout',()=>stop(504,'wing_private_broker_timeout'));
  upstream.on('error',()=>stop(503,'wing_private_broker_unavailable'));
  limiter.on('error',()=>stop(413,'wing_request_too_large'));
  req.on('aborted',()=>{stopped=true;limiter.destroy();upstream.destroy();release();});
  req.on('error',()=>stop(400,'wing_request_stream_failed'));
  req.pipe(limiter).pipe(upstream);
  return true;
 }
 return {handle,enabled,externalPublicDeploymentVerified:false,
  brokerAuthenticatedReady:false};
}
