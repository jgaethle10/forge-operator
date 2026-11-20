// Optional Wing Courier path inside the EXISTING Evercraft Fabric HTTPS edge.
// It is disabled by default. It only relays an exact, authenticated private
// API subset to a loopback-only broker. It cannot connect to arbitrary hosts.
// Do not expose via an untrusted HTTP-facing proxy or use this for customer
// Messenger attachments, payments, or release authority.
import http from 'node:http';

export const WING_COURIER_FABRIC_PREFIX='/api/internal/wing-courier';
const BROKER_HOST='127.0.0.1',BROKER_PORT=8791;
const EXPECTED_HOST='fabric.systemiacommandcenters.com';
const ID=/^[a-f0-9]{32}$/;
const WING=/^[a-z][a-z0-9-]{1,47}$/;
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
 timeoutMs=120000}={}){
 if(![true,false].includes(enabled))throw Error('wing_fabric_enabled_boolean_required');
 if(![EXPECTED_HOST,'127.0.0.1'].includes(approvedHost))throw Error('wing_fabric_approved_host_invalid');
 if(brokerHost!==BROKER_HOST||brokerPort!==BROKER_PORT)
  throw Error('wing_fabric_broker_loopback_route_fixed');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000)
  throw Error('wing_fabric_timeout_invalid');
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
  const upstream=http.request({
   host:BROKER_HOST,port:BROKER_PORT,method:req.method,
   path:route.suffix+route.search,headers,timeout:timeoutMs,
  },(response)=>{
   const allowed={};
   for(const key of ['content-type','content-length','x-content-type-options','referrer-policy']){
    const v=response.headers[key];if(typeof v==='string')allowed[key]=v;
   }
   allowed['cache-control']='no-store';
   res.writeHead(response.statusCode||502,allowed);
   response.pipe(res);
   response.on('error',()=>res.destroy());
  });
  upstream.on('timeout',()=>upstream.destroy(new Error('timeout')));
  upstream.on('error',()=>{
   if(!res.headersSent)respond(res,503,{error:'wing_private_broker_unavailable'});
   else res.destroy();
  });
  req.on('aborted',()=>upstream.destroy());
  req.pipe(upstream);
  return true;
 }
 return {handle,enabled,externalPublicDeploymentVerified:false,
  brokerAuthenticatedReady:false};
}
