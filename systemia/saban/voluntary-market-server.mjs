import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES=64*1024;

function bearer(req){
  const raw=String(req.headers.authorization||'');
  return raw.startsWith('Bearer ')?raw.slice(7).trim():'';
}

function providerId(req,url){
  return String(
    req.headers['x-evercraft-provider-id']||
    url.searchParams.get('provider_id')||
    ''
  ).trim();
}

function sameSecret(a,b){
  const aa=Buffer.from(String(a||''));
  const bb=Buffer.from(String(b||''));
  return aa.length===bb.length&&aa.length>0&&timingSafeEqual(aa,bb);
}

async function readJson(req){
  const chunks=[];
  let total=0;
  for await(const chunk of req){
    total+=chunk.length;
    if(total>MAX_BODY_BYTES) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  try{
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{
    throw new Error('invalid_json');
  }
}

function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':String(data.length),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  res.end(data);
}

export async function startVoluntaryMarketServer({
  market,
  host='127.0.0.1',
  port=0,
  registrationToken='',
}={}){
  if(!market||typeof market.registerProvider!=='function'){
    throw new Error('voluntary_market_required');
  }
  const loopback=['127.0.0.1','::1','localhost'].includes(String(host));
  if(!loopback&&!registrationToken){
    throw new Error('registration_token_required_for_non_loopback_server');
  }

  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/', 'http://local');
    try{
      if(req.method==='GET'&&url.pathname==='/healthz'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.saban.voluntary-market-server-health.v1',
          registered_providers:market.providers.size,
          active_offers:market.offers.size,
        });
      }

      if(req.method==='POST'&&url.pathname==='/v1/providers/register'){
        if(registrationToken&&!sameSecret(
          req.headers['x-evercraft-registration-token'],
          registrationToken
        )){
          return send(res,401,{ok:false,error:'registration_authority_required'});
        }
        const body=await readJson(req);
        const registered=market.registerProvider(body);
        return send(res,201,{
          ...registered,
          provider_token:registered.provider_token,
        });
      }

      const id=providerId(req,url);
      const provider=market.authenticateProvider(id,bearer(req));
      if(!provider){
        return send(res,401,{ok:false,error:'provider_auth_required'});
      }

      if(req.method==='POST'&&url.pathname==='/v1/offers'){
        const body=await readJson(req);
        if(String(body?.offer?.provider_id||'')!==id){
          return send(res,403,{ok:false,error:'provider_identity_mismatch'});
        }
        const admission=market.submitSignedOffer(body);
        return send(res,201,{ok:true,admission});
      }

      if(req.method==='GET'&&url.pathname==='/v1/proposals'){
        const waitMs=Math.max(
          100,
          Math.min(30_000,Number(url.searchParams.get('wait_ms')||20_000))
        );
        const proposal=await market.nextProviderProposal(id,{timeoutMs:waitMs});
        return send(res,200,{ok:true,proposal});
      }

      const responseMatch=url.pathname.match(/^\/v1\/proposals\/([^/]+)\/respond$/);
      if(req.method==='POST'&&responseMatch){
        const proposalId=decodeURIComponent(responseMatch[1]);
        const body=await readJson(req);
        market.respondToProposal({
          provider_id:id,
          proposal_id:proposalId,
          decision:body?.decision||body,
        });
        return send(res,200,{ok:true});
      }

      const offerMatch=url.pathname.match(/^\/v1\/offers\/([^/]+)$/);
      if(req.method==='DELETE'&&offerMatch){
        const offerId=decodeURIComponent(offerMatch[1]);
        const revoked=market.revokeOffer({
          provider_id:id,
          offer_id:offerId,
        });
        return send(res,revoked?200:404,{ok:revoked});
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=String(error?.message||error);
      const client=[
        'request_body_too_large',
        'invalid_json',
        'voluntary_offer_identity_required',
        'voluntary_provider_not_registered',
        'voluntary_offer_nonce_required',
        'voluntary_offer_expired',
        'voluntary_offer_signature_invalid',
        'voluntary_proposal_not_pending',
      ].includes(message);
      return send(res,client?400:500,{
        ok:false,
        error:message,
      });
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string'){
    throw new Error('voluntary_market_server_bind_failed');
  }
  return {
    schema:'evercraft.saban.voluntary-market-server.v1',
    url:'http://'+host+':'+address.port,
    close:()=>new Promise((resolve)=>server.close(()=>resolve())),
  };
}
