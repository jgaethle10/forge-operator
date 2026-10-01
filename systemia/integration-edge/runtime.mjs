import http from 'node:http';

function clean(value){ return String(value??'').trim(); }
function safeKey(value,field){
  const text=clean(value);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) throw new Error(field+'_invalid');
  return text;
}
function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store'
  });
  res.end(data);
}
async function readBody(req,maxBytes){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>maxBytes) throw new Error('integration_edge_body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function normalizeOrigin(value,{allowLoopbackProof=false}={}){
  const raw=clean(value);
  if(!raw) return '';
  const url=new URL(raw);
  if(url.username||url.password) throw new Error('integration_edge_origin_credentials_forbidden');
  const host=url.hostname.toLowerCase();
  const loopback=host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]';
  if(loopback){
    if(!allowLoopbackProof) throw new Error('integration_edge_loopback_forbidden');
    if(!['http:','https:'].includes(url.protocol)) throw new Error('integration_edge_origin_protocol_invalid');
  }else if(url.protocol!=='https:'){
    throw new Error('integration_edge_https_required');
  }
  if(host==='base44.app'||host.endsWith('.base44.app')) throw new Error('integration_edge_base44_origin_forbidden');
  return url.origin;
}
function errorStatus(error){
  const code=String(error?.message||error||'integration_edge_error');
  if(code.includes('authorization_required')) return 401;
  if(code.includes('not_found')||code.includes('not_registered')) return 404;
  if(code.includes('expired')||code.includes('consumed')||code.includes('conflict')) return 409;
  if(code.includes('too_large')) return 413;
  if(code.includes('invalid')||code.includes('required')||code.includes('mismatch')||code.includes('forbidden')||code.includes('outside_replay_window')) return 400;
  return 500;
}

export async function startIntegrationEdge({
  host='127.0.0.1',
  port=0,
  publicOrigin='',
  allowLoopbackProof=false,
  connectorGateway,
  webhookGateway,
  authorizeConnectorBegin=async()=>false,
  maxBodyBytes=8*1024*1024
}={}){
  if(!connectorGateway) throw new Error('integration_edge_connector_gateway_required');
  if(!webhookGateway) throw new Error('integration_edge_webhook_gateway_required');
  if(typeof authorizeConnectorBegin!=='function') throw new Error('integration_edge_authorizer_required');

  let origin=normalizeOrigin(publicOrigin,{allowLoopbackProof});
  let server=null;
  const startedAt=new Date().toISOString();

  const handler=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://integration-edge.local');
      if(req.method==='GET'&&url.pathname==='/health'){
        return send(res,200,{
          schema:'evercraft.integration-edge.health.v1',
          ok:Boolean(server?.listening),
          service:'evercraft-integration-edge',
          runtime:'Evercraft Compute',
          public_origin:origin||null,
          connector:connectorGateway.health(),
          webhook:webhookGateway.health(),
          oauth_callback_state_protected:true,
          webhook_signature_verified:true,
          base44_callback_origin_allowed:false,
          started_at:startedAt
        });
      }

      const begin=url.pathname.match(/^\/v1\/connectors\/([^/]+)\/([^/]+)\/authorize$/);
      if(begin&&req.method==='POST'){
        const appKey=safeKey(decodeURIComponent(begin[1]),'app_key');
        const provider=safeKey(decodeURIComponent(begin[2]),'connector_provider');
        const admitted=await authorizeConnectorBegin({request:req,appKey,provider});
        if(admitted!==true) throw new Error('connector_begin_authorization_required');
        const bytes=await readBody(req,maxBodyBytes);
        const body=bytes.length?JSON.parse(bytes.toString('utf8')):{};
        const redirectUri=origin+
          '/v1/connectors/'+encodeURIComponent(appKey)+'/'+encodeURIComponent(provider)+'/callback';
        const begun=await connectorGateway.beginAuthorization(appKey,provider,{
          redirectUri,
          scopes:Array.isArray(body.scopes)?body.scopes:[],
          providerContext:body.provider_context||{}
        });
        return send(res,200,{
          ok:true,
          authorization_url:begun.authorization_url,
          state:begun.state,
          expires_at:begun.expires_at,
          receipt_hash:begun.receipt.receipt_hash
        });
      }

      const callback=url.pathname.match(/^\/v1\/connectors\/([^/]+)\/([^/]+)\/callback$/);
      if(callback&&req.method==='GET'){
        const appKey=safeKey(decodeURIComponent(callback[1]),'app_key');
        const provider=safeKey(decodeURIComponent(callback[2]),'connector_provider');
        const code=clean(url.searchParams.get('code'));
        const state=clean(url.searchParams.get('state'));
        if(!code) throw new Error('connector_authorization_code_required');
        if(!state) throw new Error('connector_oauth_state_required');
        const redirectUri=origin+
          '/v1/connectors/'+encodeURIComponent(appKey)+'/'+encodeURIComponent(provider)+'/callback';
        const completed=await connectorGateway.completeAuthorization(appKey,provider,{
          state,
          authorizationCode:code,
          redirectUri
        });
        return send(res,200,{
          ok:true,
          connected:true,
          provider:completed.connection.provider,
          connection_id:completed.connection.connection_id,
          provider_account_ref:completed.connection.provider_account_ref,
          scopes:completed.connection.scopes,
          authorization_receipt_hash:completed.authorization_receipt.receipt_hash,
          credential_value_emitted:false
        });
      }

      const webhook=url.pathname.match(/^\/v1\/webhooks\/([^/]+)\/([^/]+)$/);
      if(webhook&&req.method==='POST'){
        const appKey=safeKey(decodeURIComponent(webhook[1]),'app_key');
        const routeKey=safeKey(decodeURIComponent(webhook[2]),'webhook_route');
        const body=await readBody(req,maxBodyBytes);
        const delivered=await webhookGateway.handle({
          appKey,
          routeKey,
          headers:req.headers,
          body,
          now:new Date()
        });
        return send(res,200,{
          ok:true,
          status:delivered.status,
          replayed:delivered.replayed===true,
          event_id:delivered.event_id,
          delivery_receipt_hash:
            delivered.receipt?.receipt_hash||
            delivered.delivery_receipt_hash||
            null
        });
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const status=errorStatus(error);
      return send(res,status,{
        ok:false,
        error:String(error?.message||error||'integration_edge_error'),
        detail:status>=500?'Integration edge request failed.':undefined
      });
    }
  };

  server=http.createServer((req,res)=>{
    handler(req,res).catch((error)=>{
      if(!res.headersSent) send(res,500,{ok:false,error:'integration_edge_unhandled'});
      else res.destroy(error);
    });
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  if(!origin){
    if(!allowLoopbackProof){
      await new Promise((resolve)=>server.close(resolve));
      throw new Error('integration_edge_public_origin_required');
    }
    origin='http://'+host+':'+actualPort;
  }

  return {
    schema:'evercraft.integration-edge.runtime.v1',
    service:'evercraft-integration-edge',
    origin,
    health_path:'/health',
    connector_authorize_template:'/v1/connectors/{app_key}/{provider}/authorize',
    connector_callback_template:'/v1/connectors/{app_key}/{provider}/callback',
    webhook_template:'/v1/webhooks/{app_key}/{route_key}',
    close:()=>new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))
  };
}
