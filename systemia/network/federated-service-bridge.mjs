import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const sha=(value)=>createHash('sha256').update(String(value||'')).digest('hex');

function assertRelayUrl(value){
  const url=new URL(String(value||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)){
    throw new Error('federated_service_relay_requires_https_or_loopback');
  }
  return url.toString();
}

function allowedRequestHeaders(headers={}){
  const allowed=new Set([
    'accept','content-type','authorization','mcp-session-id','last-event-id',
    'x-evercraft-browser-claim','origin','referer','user-agent',
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .map(([k,v])=>[String(k).toLowerCase(),Array.isArray(v)?v.join(', '):String(v??'')])
      .filter(([k,v])=>allowed.has(k)&&v&&v.length<=8192)
  );
}

function allowedResponseHeaders(headers={}){
  const allowed=new Set([
    'content-type','cache-control','content-security-policy','referrer-policy',
    'x-content-type-options','x-frame-options','location','mcp-session-id',
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .map(([k,v])=>[String(k).toLowerCase(),String(v??'')])
      .filter(([k,v])=>allowed.has(k)&&v&&v.length<=8192)
  );
}

async function readBody(req,maxBytes){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('federated_service_bridge_request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function startFederatedServiceBridge({
  relayUrl,
  relayToken,
  host='127.0.0.1',
  port=0,
  maxBodyBytes=8*1024*1024,
}={}){
  const relay=assertRelayUrl(relayUrl);
  const relayTokenHash=sha(relayToken);
  if(!relayTokenHash||!String(relayToken||'')){
    throw new Error('federated_service_relay_token_required');
  }
  if(!['127.0.0.1','localhost','::1'].includes(String(host||'').toLowerCase())){
    throw new Error('federated_service_bridge_must_bind_loopback');
  }

  let deploymentReceiptRef='';
  let requests=0;
  let lastUpstreamStatus=null;
  let lastError=null;
  const instanceId='federated_bridge_'+sha(relay+Date.now()).slice(0,20);

  const server=http.createServer(async(req,res)=>{
    try{
      const method=String(req.method||'GET').toUpperCase();
      if(method==='GET'&&String(req.url||'')==='/__evercraft/health'){
        const body=Buffer.from(JSON.stringify(health()));
        res.writeHead(200,{
          'content-type':'application/json',
          'content-length':String(body.length),
          'cache-control':'no-store',
        });
        res.end(body);
        return;
      }
      if(!['GET','HEAD','POST','DELETE','OPTIONS'].includes(method)){
        res.writeHead(405,{'content-type':'application/json'});
        res.end(JSON.stringify({error:'method_not_allowed'}));
        return;
      }
      const raw=await readBody(req,maxBodyBytes);
      const response=await fetch(relay,{
        method:'POST',
        headers:{
          authorization:'Bearer '+String(relayToken),
          'content-type':'application/json',
        },
        body:JSON.stringify({
          method,
          path:String(req.url||'/'),
          headers:allowedRequestHeaders(req.headers),
          body_base64:raw.toString('base64'),
        }),
        redirect:'manual',
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload||payload.ok!==true){
        const error=new Error(payload?.error||('relay_http_'+response.status));
        error.status=response.status;
        throw error;
      }
      const body=Buffer.from(String(payload.body_base64||''),'base64');
      if(body.length>maxBodyBytes) throw new Error('federated_service_bridge_response_too_large');
      requests+=1;
      lastUpstreamStatus=Number(payload.status||502);
      lastError=null;
      const headers=allowedResponseHeaders(payload.headers||{});
      headers['content-length']=String(body.length);
      res.writeHead(lastUpstreamStatus,headers);
      if(method==='HEAD') res.end();
      else res.end(body);
    }catch(error){
      lastError=String(error?.message||error);
      const body=Buffer.from(JSON.stringify({error:'federated_service_upstream_unavailable'}));
      res.writeHead(502,{
        'content-type':'application/json',
        'content-length':body.length,
        'cache-control':'no-store',
      });
      res.end(body);
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const url='http://'+(host==='::1'?'[::1]':host)+':'+actualPort;

  const health=()=>({
    ok:true,
    service:'evercraft-federated-service-bridge',
    runtime:'Evercraft Compute',
    instance_id:instanceId,
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    loopback_only:true,
    remote_transport:'evercraft.outbound-capacity.v1',
    relay_token_exposed:false,
    relay_token_persisted:false,
    request_count:requests,
    last_upstream_status:lastUpstreamStatus,
    last_error:lastError,
  });

  return {
    schema:'evercraft.federated-service-bridge.v1',
    instanceId,
    url,
    health,
    setDeploymentReceipt(value){
      const receipt=String(value||'').trim();
      if(!/^(?:sha256:)?[a-f0-9]{64}$/i.test(receipt)){
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef=receipt;
      return health();
    },
    close:async()=>await new Promise((resolve,reject)=>
      server.close((error)=>error?reject(error):resolve())
    ),
  };
}
