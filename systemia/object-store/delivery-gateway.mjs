import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

function clean(value){ return String(value??'').trim(); }
function safeKey(value,field){
  const text=clean(value);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) throw new Error(field+'_invalid');
  return text;
}
function normalizeOrigin(value,{allowLoopbackProof=false}={}){
  const raw=clean(value);
  if(!raw) return '';
  const url=new URL(raw);
  if(url.username||url.password) throw new Error('object_delivery_origin_credentials_forbidden');
  const host=url.hostname.toLowerCase();
  const loopback=host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]';
  if(loopback){
    if(!allowLoopbackProof) throw new Error('object_delivery_loopback_forbidden');
    if(!['http:','https:'].includes(url.protocol)) throw new Error('object_delivery_origin_protocol_invalid');
  }else if(url.protocol!=='https:'){
    throw new Error('object_delivery_https_required');
  }
  if(host==='base44.app'||host.endsWith('.base44.app')){
    throw new Error('object_delivery_base44_origin_forbidden');
  }
  return url.origin;
}
function constantTimeHex(left,right){
  if(!/^[a-f0-9]{64}$/i.test(String(left||''))||!/^[a-f0-9]{64}$/i.test(String(right||''))) return false;
  const a=Buffer.from(String(left).toLowerCase(),'hex');
  const b=Buffer.from(String(right).toLowerCase(),'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function dispositionName(value){
  const raw=clean(value).replace(/[\r\n"]/g,'').slice(0,240);
  return raw||'download.bin';
}

export async function startObjectDeliveryGateway({
  objectStore,
  signingKeyProvider,
  host='127.0.0.1',
  port=0,
  publicOrigin='',
  allowLoopbackProof=false,
  defaultTtlSeconds=900,
  maxTtlSeconds=86400,
  clock=()=>new Date()
}={}){
  if(!objectStore||typeof objectStore.get!=='function') throw new Error('object_delivery_store_required');
  if(typeof signingKeyProvider!=='function') throw new Error('object_delivery_signing_key_provider_required');

  let origin=normalizeOrigin(publicOrigin,{allowLoopbackProof});
  const maxTtl=Math.max(60,Math.min(7*24*60*60,Number(maxTtlSeconds)||86400));
  const defaultTtl=Math.max(30,Math.min(maxTtl,Number(defaultTtlSeconds)||900));
  let server=null;

  async function signingKey(){
    const key=clean(await signingKeyProvider());
    if(key.length<32) throw new Error('object_delivery_signing_key_too_short');
    return key;
  }
  async function signature(appKey,objectRef,exp){
    return createHmac('sha256',await signingKey())
      .update('GET\n'+appKey+'\n'+objectRef+'\n'+exp)
      .digest('hex');
  }
  async function issueReadUrl(appKeyInput,objectRefInput,{ttlSeconds=defaultTtl}={}){
    const appKey=safeKey(appKeyInput,'app_key');
    const objectRef=safeKey(objectRefInput,'object_ref');
    objectStore.metadata(appKey,objectRef);
    const ttl=Math.max(1,Math.min(maxTtl,Number(ttlSeconds)||defaultTtl));
    const exp=Math.floor(clock().getTime()/1000)+ttl;
    const sig=await signature(appKey,objectRef,exp);
    const url=new URL(
      '/v1/objects/'+encodeURIComponent(appKey)+'/'+encodeURIComponent(objectRef),
      origin
    );
    url.searchParams.set('exp',String(exp));
    url.searchParams.set('sig',sig);
    return url.toString();
  }

  async function handler(req,res){
    try{
      const url=new URL(req.url||'/','http://object-delivery.local');
      if(req.method==='GET'&&url.pathname==='/health'){
        const data=Buffer.from(JSON.stringify({
          ok:true,
          schema:'evercraft.object-delivery.health.v1',
          signed_read_urls:true,
          raw_filesystem_paths_exposed:false,
          base44_origin_allowed:false,
          max_ttl_seconds:maxTtl
        }));
        res.writeHead(200,{'content-type':'application/json','content-length':data.length,'cache-control':'no-store'});
        return res.end(data);
      }
      const match=url.pathname.match(/^\/v1\/objects\/([^/]+)\/([^/]+)$/);
      if(!match||!['GET','HEAD'].includes(req.method||'')){
        res.writeHead(404,{'cache-control':'no-store'}); return res.end();
      }
      const appKey=safeKey(decodeURIComponent(match[1]),'app_key');
      const objectRef=safeKey(decodeURIComponent(match[2]),'object_ref');
      const expRaw=clean(url.searchParams.get('exp'));
      const sig=clean(url.searchParams.get('sig'));
      if(!/^\d{10,}$/.test(expRaw)||!/^[a-f0-9]{64}$/i.test(sig)){
        res.writeHead(403,{'cache-control':'no-store'}); return res.end();
      }
      const exp=Number(expRaw);
      const now=Math.floor(clock().getTime()/1000);
      if(!Number.isFinite(exp)||exp<now||exp-now>maxTtl){
        res.writeHead(403,{'cache-control':'no-store'}); return res.end();
      }
      const expected=await signature(appKey,objectRef,exp);
      if(!constantTimeHex(sig,expected)){
        res.writeHead(403,{'cache-control':'no-store'}); return res.end();
      }
      const {data,reference}=objectStore.get(appKey,objectRef);
      res.writeHead(200,{
        'content-type':reference.content_type||'application/octet-stream',
        'content-length':data.length,
        'content-disposition':'inline; filename="'+dispositionName(reference.name)+'"',
        'cache-control':'private, no-store',
        'x-content-type-options':'nosniff',
        'x-evercraft-object-sha256':reference.blob_sha256
      });
      if(req.method==='HEAD') return res.end();
      return res.end(data);
    }catch{
      if(!res.headersSent) res.writeHead(404,{'cache-control':'no-store'});
      return res.end();
    }
  }

  server=http.createServer((req,res)=>{handler(req,res).catch(()=>{try{res.destroy();}catch{}});});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  if(!origin){
    if(!allowLoopbackProof){
      await new Promise((resolve)=>server.close(resolve));
      throw new Error('object_delivery_public_origin_required');
    }
    origin='http://'+host+':'+actualPort;
  }

  return {
    schema:'evercraft.object-delivery.runtime.v1',
    origin,
    issueReadUrl,
    close:()=>new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))
  };
}
