// Evercraft Worlds owned vault: isolated, unlisted, capability-protected scene persistence.
// No accounts, third-party storage, or unrestricted filesystem access.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {decodeSharedScene,encodeSharedScene} from '../../public/worlds/share-scene.mjs';

export const VAULT_SCHEMA='evercraft.worlds.vault.v1';
const WORLD_ID=/^[a-f0-9]{32}$/;
const MAX_BODY=12000;
const MAX_WORLDS=2000;
function checkedPublicOrigin(value){
 if(!value)return null;
 let url;try{url=new URL(String(value));}catch{throw Error('worlds_vault_public_origin_invalid');}
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.origin!==String(value).replace(/\/$/,''))throw Error('worlds_vault_public_origin_invalid');
 return url.origin;
}
function assertWriteOrigin(req,publicOrigin){
 const supplied=req.headers.origin;
 if(!supplied)return;
 let origin;try{origin=new URL(supplied);if(origin.origin!==supplied)throw Error('not_exact_origin');}
 catch{throw new VaultError(403,'cross_origin_write_denied');}
 const expected=publicOrigin||'http://'+req.headers.host;
 if(supplied!==expected)throw new VaultError(403,'cross_origin_write_denied');
}

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8'};
class VaultError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const digest=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');return x.length===y.length&&timingSafeEqual(x,y);};
function send(res,status,data,headers={}){
 const body=Buffer.from(JSON.stringify(data));
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':body.length,
 'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
 res.end(body);
}
async function readBody(req){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))throw new VaultError(415,'json_content_type_required');
 let size=0,chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new VaultError(413,'scene_too_large');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new VaultError(400,'invalid_json');}
}
function validScene(body){
 if(!body||typeof body.scene_token!=='string')throw new VaultError(400,'scene_token_required');
 try{
  const world=decodeSharedScene(body.scene_token);
  const canonical=encodeSharedScene(world);
  if(body.scene_token!==canonical)throw Error('noncanonical');
  return canonical;
 }catch{throw new VaultError(422,'invalid_scene');}
}
function within(root,target){
 const rel=path.relative(root,target);
 return !rel.startsWith('..')&&!path.isAbsolute(rel);
}
export async function startWorldsVault({host='127.0.0.1',port=0,publicRoot=path.resolve('public'),dataRoot='',maxWorlds=MAX_WORLDS,publicOrigin=''}={}){
 if(!['127.0.0.1','::1','localhost'].includes(host))throw Error('worlds_vault_must_bind_loopback');
 const expectedOrigin=checkedPublicOrigin(publicOrigin);
 if(!dataRoot)throw Error('worlds_vault_data_root_required');
 const assetRoot=await fs.realpath(publicRoot);
 await fs.mkdir(dataRoot,{recursive:true,mode:0o700});
 const vaultRoot=await fs.realpath(dataRoot);
 if(within(assetRoot,vaultRoot)||within(vaultRoot,assetRoot))throw Error('worlds_vault_data_must_be_outside_public');
 if(!Number.isInteger(maxWorlds)||maxWorlds<1||maxWorlds>MAX_WORLDS)throw Error('worlds_vault_capacity_invalid');
 const locks=new Map(),createWindows=new Map();
 const fileFor=id=>path.join(vaultRoot,id+'.json');
 async function readRecord(id){
  if(!WORLD_ID.test(id))throw new VaultError(404,'world_not_found');
  try{return JSON.parse(await fs.readFile(fileFor(id),'utf8'));}
  catch(e){if(e.code==='ENOENT')throw new VaultError(404,'world_not_found');throw e;}
 }
 async function serialize(id,fn){
  const previous=locks.get(id)||Promise.resolve();
  const run=previous.catch(()=>{}).then(fn);
  locks.set(id,run);
  try{return await run;}finally{if(locks.get(id)===run)locks.delete(id);}
 }
 async function atomicSave(id,record,{create=false}={}){
  const final=fileFor(id),tmp=fileFor(id)+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   await fs.writeFile(tmp,JSON.stringify(record),{mode:0o600,flag:'wx'});
   if(create){
    // Exclusive link prevents a generated ID from overwriting an existing world.
    await fs.link(tmp,final);
   }else{
    await fs.rename(tmp,final);
   }
  }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 }
 async function createWorld(scene){
  let count=0;
  for(const name of await fs.readdir(vaultRoot)){if(/^[a-f0-9]{32}\.json$/.test(name))count++;}
  if(count>=maxWorlds)throw new VaultError(507,'vault_capacity_reached');
  const now=new Date().toISOString(),id=randomBytes(16).toString('hex'),editToken=randomBytes(32).toString('hex');
  const record={schema:VAULT_SCHEMA,id,version:1,scene_token:scene,edit_hash:digest(editToken),created_at:now,updated_at:now};
  await atomicSave(id,record,{create:true});
  return {world_id:id,version:1,edit_token:editToken,created_at:now};
 }
 async function serveStatic(req,res,pathname){
  if(!pathname.startsWith('/worlds/')||req.method!=='GET')throw new VaultError(404,'route_not_found');
  const relative=pathname.slice('/worlds/'.length)||'index.html';
  if(relative.split('/').some(x=>x==='.'||x==='..'||x.startsWith('.'))||relative.includes('\\'))throw new VaultError(404,'route_not_found');
  const target=path.resolve(assetRoot,'worlds',relative);
  if(!within(path.join(assetRoot,'worlds'),target))throw new VaultError(404,'route_not_found');
  let real,stat;
  try{real=await fs.realpath(target);stat=await fs.lstat(target);}catch{throw new VaultError(404,'route_not_found');}
  if(!within(path.join(assetRoot,'worlds'),real)||stat.isSymbolicLink()||!stat.isFile())throw new VaultError(404,'route_not_found');
  const bytes=await fs.readFile(real);
  res.writeHead(200,{'content-type':MIME[path.extname(real)]||'application/octet-stream','content-length':bytes.length,
  'cache-control':'public, max-age=60','x-content-type-options':'nosniff'});res.end(bytes);
 }
 const server=http.createServer(async(req,res)=>{
  try{
   const method=req.method||'GET',url=new URL(req.url||'/', 'http://local.invalid');
   const pathname=decodeURIComponent(url.pathname);
   if(pathname==='/worlds/api/health'&&method==='GET')return send(res,200,{schema:VAULT_SCHEMA,ok:true,mode:'owned-durable-vault',unlisted:true});
   if(pathname==='/worlds/api/worlds'&&method==='POST'){
    assertWriteOrigin(req,expectedOrigin);
    const source=req.socket.remoteAddress||'unknown',now=Date.now();
    const old=(createWindows.get(source)||[]).filter(t=>now-t<600000);
    if(old.length>=10)throw new VaultError(429,'creation_rate_limited');
    old.push(now);createWindows.set(source,old);
    const scene=validScene(await readBody(req)),created=await createWorld(scene);
    return send(res,201,{schema:VAULT_SCHEMA,...created},{etag:'"1"'});
   }
   const match=pathname.match(/^\/worlds\/api\/worlds\/([a-f0-9]{32})$/);
   if(match&&method==='GET'){
    const row=await readRecord(match[1]);
    return send(res,200,{schema:VAULT_SCHEMA,world_id:row.id,version:row.version,scene_token:row.scene_token,updated_at:row.updated_at},{etag:'"'+row.version+'"'});
   }
   if(match&&method==='PUT'){
    assertWriteOrigin(req,expectedOrigin);
    const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
    if(!/^[a-f0-9]{64}$/.test(token))throw new VaultError(401,'edit_capability_required');
    const body=await readBody(req),scene=validScene(body);
    const updated=await serialize(match[1],async()=>{
      const existing=await readRecord(match[1]);
      if(!equal(digest(token),existing.edit_hash))throw new VaultError(403,'edit_capability_invalid');
      if(req.headers['if-match']!=='"'+existing.version+'"')throw new VaultError(409,'world_version_conflict');
      const next={...existing,version:existing.version+1,scene_token:scene,updated_at:new Date().toISOString()};
      await atomicSave(match[1],next);
      return next;
    });
    return send(res,200,{schema:VAULT_SCHEMA,world_id:updated.id,version:updated.version,updated_at:updated.updated_at},{etag:'"'+updated.version+'"'});
   }
   if(pathname.startsWith('/worlds/api/'))throw new VaultError(404,'api_route_not_found');
   if(pathname==='/worlds')return void(res.writeHead(308,{location:'/worlds/'}),res.end());
   await serveStatic(req,res,pathname);
  }catch(e){const status=e instanceof VaultError?e.status:500;send(res,status,{error:e instanceof VaultError?e.code:'worlds_vault_internal_error'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 const addr=server.address();
 return {url:'http://'+(host==='0.0.0.0'?'127.0.0.1':host)+':'+addr.port,
  close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?'':process.argv[i+1]||'';};
 const config={host:arg('host')||'127.0.0.1',port:Number(arg('port')||8788),
  publicRoot:arg('public-root')||path.resolve('public'),dataRoot:arg('data-root'),publicOrigin:arg('public-origin')};
 startWorldsVault(config).then(s=>{process.stdout.write(JSON.stringify({status:'listening',url:s.url})+'\n');})
 .catch(e=>{process.stderr.write(String(e.message)+'\n');process.exitCode=1;});
}
