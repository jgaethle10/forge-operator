// Evercraft Fabric -> Wing Courier: optional same-origin, token-preserving encrypted
// payload route. Disabled unless a private owned-host config is supplied.
// Never a generic reverse proxy and never an unguarded public broker listener.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const ROUTE='/wing-courier';
const HOST='fabric.systemiacommandcenters.com';
const SCHEMA='evercraft.fabric.wing-courier-route-config.v1';
const HEXID=/^[a-f0-9]{32}$/;
const WING=/^[a-z][a-z0-9-]{1,47}$/;
const MAX_BYTES=3*1024**3+131072;
function failure(reason){throw Error('fabric_wing_route_'+reason)}
function reply(res,status,error){
 if(res.headersSent){res.destroy();return}
 const data=Buffer.from(JSON.stringify({error}));
 res.writeHead(status,{'content-type':'application/json',
   'content-length':data.length,'cache-control':'no-store',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'x-frame-options':'DENY'});
 res.end(data);
}
function privateConfig(file){
 if(typeof file!=='string'||!path.isAbsolute(file))failure('config_absolute_required');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid())||
   st.size>4096||st.size<30)failure('config_not_private');
 let cfg;
 try{cfg=JSON.parse(fs.readFileSync(file,'utf8'))}
 catch{failure('config_json_invalid')}
 if(cfg?.schema!==SCHEMA||cfg.enabled!==true||
   cfg.publicHost!==HOST||
   !Number.isInteger(cfg.brokerPort)||cfg.brokerPort<1024||cfg.brokerPort>65535||
   !Number.isSafeInteger(cfg.maxUploadBytes)||
   cfg.maxUploadBytes<1024||cfg.maxUploadBytes>MAX_BYTES||
   !/^private:[A-Za-z0-9_./:-]{10,140}$/.test(cfg.operatorApprovalRef||''))
   failure('config_scope_invalid');
 return Object.freeze({brokerPort:cfg.brokerPort,maxUploadBytes:cfg.maxUploadBytes,
   publicHost:HOST});
}
function routePath(req){
 try{
  const raw=req.url||'/';
  if(raw.includes('#')||raw.includes('%')||raw.includes('\\'))return {candidate:false};
  const u=new URL(raw,'http://fabric.local');
  if(u.pathname!==ROUTE&&!u.pathname.startsWith(ROUTE+'/'))return {candidate:false};
  if(u.pathname===ROUTE||u.pathname===ROUTE+'/')return {candidate:true,allowed:false};
  const name=u.pathname.slice(ROUTE.length);
  if(req.method==='POST'&&name==='/v1/envelopes'&&!u.search)
   return {candidate:true,allowed:true,path:name};
  if(req.method==='PUT'&&/^\/v1\/envelopes\/[a-f0-9]{32}\/blob$/.test(name)&&!u.search)
   return {candidate:true,allowed:true,path:name};
  if(req.method==='GET'&&name==='/v1/inbox'&&u.searchParams.size===1&&
     WING.test(u.searchParams.get('wing')||''))
   return {candidate:true,allowed:true,path:name+'?wing='+u.searchParams.get('wing')};
  if(req.method==='GET'&&/^\/v1\/envelopes\/[a-f0-9]{32}\/blob$/.test(name)&&!u.search)
   return {candidate:true,allowed:true,path:name};
  if(req.method==='POST'&&/^\/v1\/envelopes\/[a-f0-9]{32}\/ack$/.test(name)&&!u.search)
   return {candidate:true,allowed:true,path:name};
  return {candidate:true,allowed:false};
 }catch{return {candidate:false}}
}
function safeHost(host){
 return typeof host==='string'&&host.trim().toLowerCase()===HOST;
}
export function createFabricWingCourierRoute({configFile=''}={}){
 const cfg=configFile?privateConfig(configFile):null;
 return {
  enabled:Boolean(cfg),
  /** true when the request belongs to this isolated route, even when disabled. */
  async handle(req,res){
   const route=routePath(req);
   if(!route.candidate)return false;
   // The shared Fabric origin MUST NOT expose broker endpoints by default.
   if(!cfg){reply(res,404,'not_found');return true}
   if(!safeHost(req.headers.host)){reply(res,404,'not_found');return true}
   if(!route.allowed){reply(res,404,'not_found');return true}
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!/^Bearer [\x21-\x7e]{32,512}$/.test(auth)){
    reply(res,403,'not_authorized');return true;
   }
   const len=req.headers['content-length'];
   if(len!==undefined&&(!/^\d+$/.test(String(len))||
       !Number.isSafeInteger(Number(len))||Number(len)>cfg.maxUploadBytes)){
    reply(res,413,'payload_rejected');return true;
   }
   const headers={
    authorization:auth,
    accept:'application/json',
    ...(typeof req.headers['content-type']==='string'
      ?{'content-type':req.headers['content-type'].slice(0,100)}:{}),
    ...(len!==undefined?{'content-length':String(len)}:{}),
   };
   const upstream=http.request({hostname:'127.0.0.1',port:cfg.brokerPort,
    method:req.method,path:route.path,headers},pres=>{
    const resultHeaders={
     'content-type':String(pres.headers['content-type']||
       'application/octet-stream').slice(0,100),
     'cache-control':'no-store',
     'x-content-type-options':'nosniff',
     'x-frame-options':'DENY',
     'referrer-policy':'no-referrer',
     ...(pres.headers['content-length']?{'content-length':pres.headers['content-length']}:{})
    };
    if(!res.headersSent)res.writeHead(pres.statusCode||502,resultHeaders);
    pres.on('error',()=>res.destroy());
    pres.pipe(res);
   });
   let count=0,stopped=false,responded=false;
   function stop(status,reason){
    if(stopped)return;stopped=true;
    req.unpipe(upstream);
    upstream.destroy();
    if(!responded){responded=true;reply(res,status,reason)}
   }
   upstream.on('error',()=>stop(503,'private_courier_unavailable'));
   upstream.setTimeout(600000,()=>stop(504,'private_courier_timeout'));
   req.on('aborted',()=>{stopped=true;upstream.destroy()});
   req.on('error',()=>stop(400,'request_stream_failed'));
   req.on('data',chunk=>{
    count+=chunk.length;
    if(count>cfg.maxUploadBytes){stop(413,'payload_rejected');return}
    if(!stopped&&!upstream.write(chunk))req.pause();
   });
   upstream.on('drain',()=>req.resume());
   req.on('end',()=>{if(!stopped)upstream.end()});
   return true;
  },
 };
}
export const FABRIC_WING_COURIER_ROUTE=ROUTE;
