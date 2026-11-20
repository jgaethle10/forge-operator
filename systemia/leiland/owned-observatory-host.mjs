// Leiland + KAIDANCE read-only observatory on an Evercraft-owned loopback runtime.
// The existing Evercraft edge/Caddy supplies TLS and public hostname admission.
// This process has no write route, scheduler, private inference access, or DNS authority.
import http from 'node:http';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessPublicPulse} from '../../public/kaidance/pulse-source.mjs';
import {assessLeilandFeed} from '../../scripts/probe-leiland-owned-release.mjs';
import {titleSafe} from '../../public/live/work-source.mjs';

export const LEILAND_HOST_SCHEMA='evercraft.leiland.owned-observatory-host.v1';
export const STATIC_PATHS=Object.freeze({
 '/leiland/index.html':'leiland/index.html',
 '/leiland/style.css':'leiland/style.css',
 '/leiland/brain.js':'leiland/brain.js',
 '/leiland/pulse-bridge.mjs':'leiland/pulse-bridge.mjs',
 '/kaidance/index.html':'kaidance/index.html',
 '/kaidance/style.css':'kaidance/style.css',
 '/kaidance/app.mjs':'kaidance/app.mjs',
 '/kaidance/work-source.mjs':'kaidance/work-source.mjs',
 '/kaidance/pulse-source.mjs':'kaidance/pulse-source.mjs',
 '/kaidance/mark.svg':'kaidance/mark.svg',
 '/systemia/index.html':'systemia/index.html',
 '/systemia/social-card.svg':'systemia/social-card.svg',
 '/headquarters/mark.svg':'headquarters/mark.svg'
});
// Defensive final server boundary. A publisher's write permission is not
// blanket permission to make arbitrary JSON public.
const PULSE_FIELDS=Object.freeze([
 'schema','state','cycle_number','last_completed_cycle','heartbeat_target_seconds',
 'admitted_count','held_count','coverage_receipt_valid','field_attestation_verified',
 'observed_at','published_at'
]);
export function approvedPublicProjection(relative,bytes,now=Date.now()){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>20000)return false;
 let record;
 try{record=JSON.parse(bytes.toString('utf8'))}catch{return false}
 if(!record||typeof record!=='object'||Array.isArray(record))return false;
 if(relative==='kaidance/pulse.json'){
  if(Object.keys(record).length!==PULSE_FIELDS.length||Object.keys(record).some(key=>!PULSE_FIELDS.includes(key)))return false;
  return assessPublicPulse(record,now).ok===true;
 }
 if(relative==='leiland/feed.json'){
  try{
   assessLeilandFeed(record,now);
   // Browser defense-in-depth is not a substitute for public-source review.
   // Reject sensitive or mutated event titles before they leave the owned host.
   return record.events.every(event=>titleSafe(event.title)===event.title);
  }catch{return false}
 }
 return false;
}

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const SECURITY={
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'x-frame-options':'DENY',
 'cross-origin-resource-policy':'same-origin',
 'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"
};
const SYSTEMIA_SECURITY={...SECURITY,
 'content-security-policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"};
const fail=message=>{throw Error(message)};
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)};
const mime=file=>MIME[path.extname(file)]||'application/octet-stream';
const safeSend=(res,method,status,bytes,mimeType,headers={})=>{
 const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 res.writeHead(status,{...SECURITY,'content-type':mimeType,'content-length':body.length,
   'cache-control':'no-store',...headers});
 res.end(method==='HEAD'?undefined:body);
};
async function rootDirectory(value,tag){
 if(typeof value!=='string'||!path.isAbsolute(value))fail(tag+'_absolute_path_required');
 const full=path.resolve(value);
 const stat=await fs.lstat(full);
 if(!stat.isDirectory()||stat.isSymbolicLink())fail(tag+'_directory_invalid');
 const real=await fs.realpath(full);
 if(real!==full)fail(tag+'_directory_symlink_forbidden');
 return real;
}
async function readAllowed(root,relative,maxBytes){
 const name=path.resolve(root,relative);
 if(!inside(root,name))return null;
 let file;
 try{
  const stat=await fs.lstat(name);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxBytes)return null;
  const actual=await fs.realpath(name);
  if(!inside(root,actual)||actual!==name)return null;
  file=await fs.open(name,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  const opened=await file.stat();
  if(!opened.isFile()||opened.size!==stat.size||opened.size<1||opened.size>maxBytes)return null;
  return await file.readFile();
 }catch(error){
  if(['ENOENT','ENOTDIR','ELOOP','EACCES'].includes(error.code))return null;
  throw error;
 }finally{await file?.close()}
}
export async function startLeilandObservatory({host='127.0.0.1',port=0,
 publicRoot,publicationRoot,releaseSha=null}={}){
 if(host!=='127.0.0.1'&&host!=='::1')fail('leiland_host_must_bind_loopback');
 if(!Number.isInteger(port)||port<0||port>65535)fail('leiland_port_invalid');
 if(releaseSha!==null&&!(typeof releaseSha==='string'&&/^[a-f0-9]{40}$/i.test(releaseSha)))fail('release_commit_sha_invalid');
 const staticRoot=await rootDirectory(publicRoot,'public');
 const dynamicRoot=await rootDirectory(publicationRoot,'publication');
 if(staticRoot===dynamicRoot||inside(staticRoot,dynamicRoot)||inside(dynamicRoot,staticRoot))
  fail('publication_root_must_be_separate_from_source_checkout');
 for(const [route,relative] of Object.entries(STATIC_PATHS)){
  if(!await readAllowed(staticRoot,relative,1048576))fail('missing_required_static_asset_'+route.slice(1).replaceAll('/','_'));
 }
 const server=http.createServer((req,res)=>{
  void (async()=>{
  const method=req.method||'GET';
  if(method!=='GET'&&method!=='HEAD'){
   safeSend(res,method,405,'Method not allowed','text/plain; charset=utf-8',{'allow':'GET, HEAD'});return;
  }
  let url;
  try{url=new URL(req.url||'/','http://localhost')}catch{
   safeSend(res,method,400,'Bad request','text/plain; charset=utf-8');return;
  }
  const pathname=url.pathname;
  if(/[%\\\u0000-\u001f]/.test(pathname)||pathname.includes('//')||req.url?.startsWith('//')){
   safeSend(res,method,400,'Bad request','text/plain; charset=utf-8');return;
  }
  if(pathname==='/'){
   safeSend(res,method,302,'','text/plain; charset=utf-8',{'location':'/leiland/'});return;
  }
  if(pathname==='/leiland/'||pathname==='/kaidance/'||pathname==='/systemia/'){
   const target=pathname+'index.html';
   const bytes=await readAllowed(staticRoot,STATIC_PATHS[target],1048576);
   safeSend(res,method,200,bytes,'text/html; charset=utf-8',
    pathname==='/systemia/'?SYSTEMIA_SECURITY:{});return;
  }
  if(pathname==='/healthz'){
   const body=JSON.stringify({schema:LEILAND_HOST_SCHEMA,ok:true,
    transport:'loopback_only',public_runtime_authorized:false,external_https_verified:false,
    live_ai_inference_claim:false,source_commit:releaseSha});
   safeSend(res,method,200,body,'application/json; charset=utf-8');return;
  }
  let bytes=null,extension=pathname,policy={};
  if(pathname==='/kaidance/pulse.json'){
   bytes=await readAllowed(dynamicRoot,'kaidance/pulse.json',16000);
   // An expired but well-formed pulse is allowed: the viewer must show it as
   // stale instead of inventing success. Invalid data cannot leave the server.
   if(bytes&&!approvedPublicProjection('kaidance/pulse.json',bytes)){
    safeSend(res,method,503,'Public pulse not approved','text/plain; charset=utf-8');return;
   }
   policy={'cache-control':'no-store, max-age=0'};
  }else if(pathname==='/leiland/feed.json'){
   bytes=await readAllowed(dynamicRoot,'leiland/feed.json',20000);
   if(!bytes)bytes=await readAllowed(staticRoot,'leiland/feed.json',20000);
   if(bytes&&!approvedPublicProjection('leiland/feed.json',bytes)){
    safeSend(res,method,503,'Public activity feed not approved','text/plain; charset=utf-8');return;
   }
   policy={'cache-control':'no-store, max-age=0'};
  }else if(Object.hasOwn(STATIC_PATHS,pathname)){
   bytes=await readAllowed(staticRoot,STATIC_PATHS[pathname],1048576);
   if(pathname.startsWith('/systemia/'))policy=SYSTEMIA_SECURITY;
   else policy={'cache-control':'public, max-age=60, must-revalidate'};
  }
  if(!bytes){
   safeSend(res,method,404,'Not found','text/plain; charset=utf-8');return;
  }
  safeSend(res,method,200,bytes,mime(extension),policy);
  })().catch(()=>{
   if(!res.headersSent)safeSend(res,req.method||'GET',503,'Public observatory unavailable','text/plain; charset=utf-8');
   else res.destroy();
  });
 });
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,host,()=>{server.removeListener('error',reject);resolve()});
  });
 }catch(error){server.close();throw error}
 const addr=server.address();
 return {server,origin:'http://'+(host==='::1'?'[::1]':host)+':'+addr.port,
  close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const publicRoot=process.env.LEILAND_STATIC_PUBLIC_ROOT;
  const publicationRoot=process.env.LEILAND_PUBLICATION_ROOT;
  const port=Number(process.env.LEILAND_PORT||8795);
  const releaseSha=process.env.LEILAND_RELEASE_SHA||null;
  const instance=await startLeilandObservatory({publicRoot,publicationRoot,port,releaseSha});
  // Identity/protocol only. A local listener is NOT a live public URL.
  console.log(JSON.stringify({schema:LEILAND_HOST_SCHEMA,local_origin:instance.origin,
   transport:'loopback_only',external_https_verified:false,release_sha:releaseSha}));
 }catch(error){console.error('LEILAND_OWNED_HOST_HELD:',error.message);process.exitCode=1}
}
