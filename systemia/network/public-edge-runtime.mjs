import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash } from 'node:crypto';
import { validatePublicEdgeAdmission } from './public-edge-tls.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function isLoopback(host){
  const h=String(host||'').toLowerCase();
  return h==='127.0.0.1'||h==='localhost'||h==='::1'||h==='[::1]';
}

function sendJson(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json',
    'content-length':data.length,
    'cache-control':'no-store',
  });
  res.end(data);
}

async function readJson(req,maxBytes=256000){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

function normalizeUpstream(value,{allowPrivateUpstream=false}={}){
  const url=new URL(String(value||''));
  if(!['http:','https:'].includes(url.protocol)) throw new Error('upstream_protocol_invalid');
  const host=url.hostname.toLowerCase();
  const loopback=isLoopback(host);
  const privateV4=/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||/^169\.254\./.test(host);
  const localName=host.endsWith('.local');
  if(!loopback && !allowPrivateUpstream) throw new Error('edge_upstream_must_be_loopback');
  if(!loopback && !(privateV4||localName)) throw new Error('public_upstream_not_allowed');
  return url.origin;
}

function proxyRequest(req,res,upstreamOrigin){
  const target=new URL(req.url||'/',upstreamOrigin);
  const client=target.protocol==='https:'?https:http;
  const headers={...req.headers,host:target.host};
  delete headers.connection;
  delete headers['proxy-connection'];
  const upstream=client.request(target,{
    method:req.method,
    headers,
  },(upstreamRes)=>{
    const responseHeaders={...upstreamRes.headers};
    delete responseHeaders.connection;
    delete responseHeaders['transfer-encoding'];
    res.writeHead(upstreamRes.statusCode||502,responseHeaders);
    upstreamRes.pipe(res);
  });
  upstream.on('error',(error)=>{
    if(res.headersSent) return res.destroy(error);
    sendJson(res,502,{error:'edge_upstream_unreachable',detail:error.message});
  });
  req.pipe(upstream);
}

function safeLabel(value){
  const normalized=String(value||'')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,40);
  return normalized||'route';
}

export async function startPublicEdgeRuntime({
  controlHost='127.0.0.1',
  controlPort=0,
  controlToken='',
  mode='proof_loopback',
  publicHost='0.0.0.0',
  publicPort=443,
  baseDomain='',
  tlsKeyPath='',
  tlsCertPath='',
  allowPrivateUpstream=false,
  defaultLeaseTtlMs=3600000,
}={}){
  const instanceId='public_edge_'+randomBytes(12).toString('hex');
  const leases=new Map();
  let deploymentReceiptRef='';

  const admission=validatePublicEdgeAdmission({
    mode,
    baseDomain,
    tlsKeyPath,
    tlsCertPath,
    controlHost,
    controlToken,
    publicPort,
  });

  let tlsServer=null;
  let tlsActualPort=null;
  const normalizedDomain=String(baseDomain||'').trim().toLowerCase().replace(/^\.+|\.+$/g,'');
  if(mode==='wildcard_https'){
    if(!normalizedDomain) throw new Error('public_edge_base_domain_required');
    if(!tlsKeyPath||!tlsCertPath) throw new Error('public_edge_tls_material_required');
    const key=fs.readFileSync(tlsKeyPath);
    const cert=fs.readFileSync(tlsCertPath);
    tlsServer=https.createServer({key,cert},(req,res)=>{
      const host=String(req.headers.host||'').split(':')[0].toLowerCase();
      const lease=[...leases.values()].find(x=>x.hostname===host);
      if(!lease) return sendJson(res,404,{error:'route_not_found'});
      proxyRequest(req,res,lease.upstream_origin);
    });
    await new Promise((resolve,reject)=>{
      tlsServer.once('error',reject);
      tlsServer.listen(publicPort,publicHost,resolve);
    });
    const tlsAddress=tlsServer.address();
    tlsActualPort=typeof tlsAddress==='object'&&tlsAddress?tlsAddress.port:publicPort;
  }

  const releaseLease=async(leaseId,reason='released')=>{
    const lease=leases.get(leaseId);
    if(!lease) return false;
    if(lease.proxy_server){
      await new Promise((resolve)=>lease.proxy_server.close(()=>resolve()));
    }
    leases.delete(leaseId);
    lease.release_reason=reason;
    return true;
  };

  const control=http.createServer(async(req,res)=>{
    try{
      const authRequired=!isLoopback(controlHost)||Boolean(controlToken);
      if(authRequired){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${controlToken}`) return sendJson(res,401,{error:'unauthorized'});
      }

      if(req.method==='GET'&&req.url==='/health'){
        return sendJson(res,200,{
          ok:true,
          service:'evercraft-public-edge',
          runtime:'Evercraft Compute',
          instance_id:instanceId,
          deployment_receipt_bound:Boolean(deploymentReceiptRef),
          deployment_receipt_ref:deploymentReceiptRef||null,
          mode,
          active_routes:leases.size,
          public_https:mode==='wildcard_https',
          base_domain:mode==='wildcard_https'?normalizedDomain:null,
          tls_admission:mode==='wildcard_https'?admission.tls:null,
          public_listen_port:mode==='wildcard_https'?tlsActualPort:null,
        });
      }

      if(req.method==='GET'&&req.url==='/v1/public-route/capabilities'){
        return sendJson(res,200,{
          protocol:'evercraft.public-route.v1',
          provider:'evercraft-public-edge',
          runtime:'Evercraft Compute',
          instance_id:instanceId,
          https_required:mode==='wildcard_https',
          proof_only:mode==='proof_loopback',
          lease_supported:true,
          release_supported:true,
          hostname_mode:mode==='wildcard_https'?'wildcard_subdomain':'dedicated_loopback_port',
          base_domain:mode==='wildcard_https'?normalizedDomain:null,
        });
      }

      if(req.method==='POST'&&req.url==='/v1/public-route/leases'){
        const body=await readJson(req);
        const upstream=normalizeUpstream(body.upstream_origin,{allowPrivateUpstream});
        const deploymentId=String(body.deployment_id||'').trim();
        const deploymentReceiptHash=String(body.deployment_receipt_hash||'').trim();
        const instance=String(body.instance_id||'').trim();
        if(!deploymentId||!deploymentReceiptHash||!instance){
          return sendJson(res,422,{error:'deployment_binding_required'});
        }
        const requestedTtl=Number(body.requested_ttl_ms||defaultLeaseTtlMs);
        const ttlMs=Math.max(60000,Math.min(86400000,Number.isFinite(requestedTtl)?requestedTtl:defaultLeaseTtlMs));
        const leaseId='edge_'+randomBytes(10).toString('hex');
        const createdAt=new Date().toISOString();
        const expiresAt=new Date(Date.now()+ttlMs).toISOString();
        const base={
          protocol:'evercraft.public-route.v1',
          lease_id:leaseId,
          deployment_id:deploymentId,
          deployment_receipt_hash:deploymentReceiptHash,
          instance_id:instance,
          upstream_origin:upstream,
          created_at:createdAt,
          expires_at:expiresAt,
        };

        let origin;
        let hostname=null;
        let proxyServer=null;
        if(mode==='proof_loopback'){
          proxyServer=http.createServer((proxyReq,proxyRes)=>proxyRequest(proxyReq,proxyRes,upstream));
          await new Promise((resolve,reject)=>{
            proxyServer.once('error',reject);
            proxyServer.listen(0,'127.0.0.1',resolve);
          });
          const address=proxyServer.address();
          origin=`http://127.0.0.1:${address.port}`;
        }else{
          const requested=safeLabel(body.requested_hostname||deploymentId);
          const suffix=sha(deploymentReceiptHash).replace(/^sha256:/,'').slice(0,10);
          hostname=`${requested}-${suffix}.${normalizedDomain}`;
          const portSuffix=Number(tlsActualPort)===443?'':`:${tlsActualPort}`;
          origin=`https://${hostname}${portSuffix}`;
        }

        const lease={...base,origin,hostname,proxy_server:proxyServer};
        const publicLease={...base,origin,hostname};
        publicLease.receipt_hash=sha(publicLease);
        lease.receipt_hash=publicLease.receipt_hash;
        leases.set(leaseId,lease);
        return sendJson(res,201,publicLease);
      }

      const release=req.url?.match(/^\/v1\/public-route\/leases\/([^/]+)\/release$/);
      if(req.method==='POST'&&release){
        const body=await readJson(req);
        const released=await releaseLease(release[1],String(body.reason||'released'));
        return sendJson(res,released?200:404,{ok:released,released,lease_id:release[1]});
      }

      return sendJson(res,404,{error:'not_found'});
    }catch(error){
      return sendJson(res,500,{error:error instanceof Error?error.message:String(error)});
    }
  });

  await new Promise((resolve,reject)=>{
    control.once('error',reject);
    control.listen(controlPort,controlHost,resolve);
  });
  const address=control.address();
  const actualPort=typeof address==='object'&&address?address.port:controlPort;

  const sweeper=setInterval(()=>{
    const now=Date.now();
    for(const [id,lease] of leases){
      if(Date.parse(lease.expires_at)<=now) releaseLease(id,'expired').catch(()=>{});
    }
  },5000);
  sweeper.unref?.();

  const health=()=>({
    ok:true,
    service:'evercraft-public-edge',
    runtime:'Evercraft Compute',
    instance_id:instanceId,
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    mode,
    active_routes:leases.size,
    public_https:mode==='wildcard_https',
    base_domain:mode==='wildcard_https'?normalizedDomain:null,
    tls_admission:mode==='wildcard_https'?admission.tls:null,
    public_listen_port:mode==='wildcard_https'?tlsActualPort:null,
  });

  return {
    schema:'evercraft.public-edge.runtime.v1',
    instanceId,
    controlUrl:`http://${controlHost}:${actualPort}`,
    health,
    setDeploymentReceipt(ref){
      const value=String(ref||'').trim();
      if(!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(value)){
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef=value;
      return health();
    },
    close:async()=>{
      clearInterval(sweeper);
      for(const id of [...leases.keys()]) await releaseLease(id,'runtime_shutdown');
      if(tlsServer){
        await new Promise((resolve)=>tlsServer.close(()=>resolve()));
      }
      await new Promise((resolve,reject)=>control.close(e=>e?reject(e):resolve()));
    },
  };
}
