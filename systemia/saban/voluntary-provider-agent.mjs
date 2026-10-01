import { randomBytes, sign } from 'node:crypto';
import {
  prepareVoluntaryOffer,
  canonicalVoluntaryOffer,
} from './markets/voluntary.mjs';

function endpoint(base,path){
  return String(base||'').replace(/\/$/,'')+path;
}

async function jsonRequest(url,{
  method='GET',
  headers={},
  body=null,
  timeoutMs=30_000,
}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      method,
      signal:controller.signal,
      headers:{
        accept:'application/json',
        ...(body?{'content-type':'application/json'}:{}),
        ...headers,
      },
      body:body?JSON.stringify(body):undefined,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      throw new Error(
        'voluntary_market_http_'+response.status+':'+
        String(payload?.error||'request_failed')
      );
    }
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

function resourcesFit(offer,terms){
  const offered=offer.resources||{};
  const requested=terms?.resources||{};
  return (
    Number(requested.cpu_units||0)<=Number(offered.cpu_units||0) &&
    Number(requested.memory_mb||0)<=Number(offered.memory_mb||0) &&
    Number(requested.storage_gb||0)<=Number(offered.storage_gb||0) &&
    Number(requested.gpu_count||0)<=Number(offered.gpu_count||0)
  );
}

export class VoluntaryProviderAgent {
  constructor({
    marketUrl,
    registrationToken='',
    identity,
    offer,
    pollWaitMs=20_000,
  }={}){
    if(!marketUrl) throw new Error('voluntary_market_url_required');
    const parsedMarketUrl=new URL(String(marketUrl));
    const localMarket=['127.0.0.1','::1','localhost'].includes(parsedMarketUrl.hostname);
    if(parsedMarketUrl.protocol!=='https:'&&!localMarket){
      throw new Error('voluntary_market_https_required');
    }
    if(!identity?.node_id||!identity?.public_key_pem||!identity?.private_key_pem){
      throw new Error('voluntary_provider_device_identity_required');
    }
    this.marketUrl=String(marketUrl).replace(/\/$/,'');
    this.registrationToken=String(registrationToken||'');
    this.identity=identity;
    this.offerTemplate=structuredClone(offer||{});
    this.pollWaitMs=Math.max(1000,Math.min(30_000,Number(pollWaitMs)||20_000));
    this.providerToken='';
    this.offer=null;
    this.running=false;
    this.lastDecision=null;
    this.lastError=null;
    this.negotiationCount=0;
  }

  async register(){
    const payload=await jsonRequest(
      endpoint(this.marketUrl,'/v1/providers/register'),
      {
        method:'POST',
        headers:this.registrationToken
          ? {'x-evercraft-registration-token':this.registrationToken}
          : {},
        body:{
          provider_id:this.identity.node_id,
          public_key_pem:this.identity.public_key_pem,
        },
      }
    );
    this.providerToken=String(payload.provider_token||'');
    if(!this.providerToken) throw new Error('voluntary_provider_token_missing');
    return {
      schema:'evercraft.saban.voluntary-provider-agent-registration.v1',
      provider_id:this.identity.node_id,
      fingerprint:payload.fingerprint||this.identity.fingerprint||null,
      registered_at:payload.registered_at||new Date().toISOString(),
    };
  }

  async publishOffer(){
    if(!this.providerToken) await this.register();
    const prepared=prepareVoluntaryOffer({
      ...this.offerTemplate,
      provider_id:this.identity.node_id,
      offer_id:String(
        this.offerTemplate.offer_id||
        this.identity.node_id+'-voluntary-capacity'
      ),
      created_at:new Date().toISOString(),
      available_until:this.offerTemplate.available_until||
        new Date(Date.now()+15*60_000).toISOString(),
      nonce:randomBytes(18).toString('hex'),
    });
    const signature=sign(
      null,
      Buffer.from(canonicalVoluntaryOffer(prepared)),
      this.identity.private_key_pem
    ).toString('base64');

    const payload=await jsonRequest(
      endpoint(this.marketUrl,'/v1/offers'),
      {
        method:'POST',
        headers:{
          authorization:'Bearer '+this.providerToken,
          'x-evercraft-provider-id':this.identity.node_id,
        },
        body:{
          offer:prepared,
          signature_base64:signature,
        },
      }
    );
    this.offer=prepared;
    return payload.admission;
  }

  decide({proposal}={}){
    if(!this.offer) throw new Error('voluntary_offer_not_published');
    const terms=proposal?.terms||{};
    if(!resourcesFit(this.offer,terms)){
      return {action:'reject',reason:'requested_resources_exceed_offer'};
    }
    if(
      this.offer.workload_classes.length &&
      !this.offer.workload_classes.includes(String(terms.workload_class||''))
    ){
      return {action:'reject',reason:'workload_not_offered'};
    }
    if(this.offer.economics.zero_cost){
      return {action:'accept'};
    }

    const requested=Number(terms.economics?.hourly_usd);
    const floor=Number(
      this.offer.economics.minimum_hourly_usd ??
      this.offer.economics.hourly_usd ??
      0
    );
    if(Number.isFinite(requested)&&requested>=floor){
      return {action:'accept'};
    }
    return {
      action:'counter',
      terms:{
        ...terms,
        economics:{
          ...terms.economics,
          zero_cost:false,
          hourly_usd:floor,
          total_usd:floor*(Number(terms.duration_seconds||3600)/3600),
          terms_ref:this.offer.economics.terms_ref||null,
        },
      },
    };
  }

  async pollOnce(){
    if(!this.offer) await this.publishOffer();
    const query=
      '/v1/proposals?provider_id='+
      encodeURIComponent(this.identity.node_id)+
      '&wait_ms='+this.pollWaitMs;
    const payload=await jsonRequest(
      endpoint(this.marketUrl,query),
      {
        headers:{
          authorization:'Bearer '+this.providerToken,
        },
        timeoutMs:this.pollWaitMs+5000,
      }
    );
    if(!payload.proposal) return null;
    const decision=this.decide(payload.proposal.payload||{});
    await jsonRequest(
      endpoint(
        this.marketUrl,
        '/v1/proposals/'+encodeURIComponent(
          payload.proposal.proposal_request_id
        )+'/respond?provider_id='+encodeURIComponent(this.identity.node_id)
      ),
      {
        method:'POST',
        headers:{
          authorization:'Bearer '+this.providerToken,
        },
        body:{decision},
      }
    );
    this.lastDecision={
      action:decision.action,
      at:new Date().toISOString(),
      proposal_request_id:payload.proposal.proposal_request_id,
    };
    this.negotiationCount+=1;
    return this.lastDecision;
  }

  start(){
    if(this.running) return;
    this.running=true;
    const loop=async()=>{
      while(this.running){
        try{
          await this.pollOnce();
          this.lastError=null;
        }catch(error){
          this.lastError=String(error?.message||error);
          await new Promise((resolve)=>setTimeout(resolve,1000));
        }
      }
    };
    this.loopPromise=loop();
  }

  async revoke(){
    if(!this.providerToken||!this.offer) return false;
    const payload=await jsonRequest(
      endpoint(
        this.marketUrl,
        '/v1/offers/'+encodeURIComponent(this.offer.offer_id)+
        '?provider_id='+encodeURIComponent(this.identity.node_id)
      ),
      {
        method:'DELETE',
        headers:{
          authorization:'Bearer '+this.providerToken,
        },
      }
    );
    this.offer=null;
    return payload.ok===true;
  }

  async close(){
    this.running=false;
    try{ await this.revoke(); }catch{}
  }

  status(){
    return {
      schema:'evercraft.saban.voluntary-provider-agent-status.v1',
      provider_id:this.identity.node_id,
      registered:Boolean(this.providerToken),
      offer_id:this.offer?.offer_id||null,
      running:this.running,
      negotiation_count:this.negotiationCount,
      last_decision:this.lastDecision,
      last_error:this.lastError,
      secrets_exposed:false,
    };
  }
}
