import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify as verifySignature,
} from 'node:crypto';
import {
  ComputeNegotiationSession,
  createComputeLeaseFromAgreement,
} from '../negotiation-protocol.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const stable=(value)=>{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort().map((key)=>[key,stable(value[key])])
    );
  }
  return value;
};
const canonical=(value)=>JSON.stringify(stable(value));

function cleanOffer(input={}){
  return {
    schema:'evercraft.saban.voluntary-compute-offer.v1',
    provider_id:String(input.provider_id||'').trim(),
    offer_id:String(input.offer_id||'').trim(),
    access_class:String(input.access_class||'voluntary_compute').trim(),
    resources:structuredClone(input.resources||{}),
    workload_classes:[...(input.workload_classes||[])].map(String),
    economics:{
      zero_cost:input.economics?.zero_cost===true,
      hourly_usd:input.economics?.hourly_usd==null
        ? null:Number(input.economics.hourly_usd),
      minimum_hourly_usd:input.economics?.minimum_hourly_usd==null
        ? null:Number(input.economics.minimum_hourly_usd),
      terms_ref:input.economics?.terms_ref||null,
    },
    placement:structuredClone(input.placement||{}),
    trust:structuredClone(input.trust||{}),
    execution:{
      transport:String(input.execution?.transport||'unknown'),
      endpoint:input.execution?.endpoint?String(input.execution.endpoint):null,
    },
    available_until:String(
      input.available_until||
      new Date(Date.now()+15*60_000).toISOString()
    ),
    created_at:String(input.created_at||new Date().toISOString()),
    nonce:String(input.nonce||''),
  };
}

function priceTerms(demand,offer){
  const duration=Number(demand.duration_seconds||3600);
  const offeredHourly=offer.economics.hourly_usd;
  const hourly=offer.economics.zero_cost?0:offeredHourly;
  const total=hourly==null?null:hourly*(duration/3600);
  return {
    resources:structuredClone(demand.resources),
    workload_class:demand.workload_class,
    duration_seconds:duration,
    economics:{
      zero_cost:offer.economics.zero_cost===true,
      hourly_usd:hourly,
      total_usd:total,
      terms_ref:offer.economics.terms_ref||null,
    },
    execution:structuredClone(offer.execution),
    metadata:{
      voluntary_offer_id:offer.offer_id,
    },
  };
}

function normalizeAsComputeOffer(offer,{quoted=false,agreement=null,transcript=null}={}){
  const hourly=offer.economics.zero_cost?0:offer.economics.hourly_usd;
  return {
    offer_id:quoted?offer.offer_id+':agreed':offer.offer_id,
    provider_id:offer.provider_id,
    market:'evercraft-voluntary',
    access_class:offer.access_class,
    endpoint:offer.execution.endpoint,
    resources:structuredClone(offer.resources),
    placement:{
      region:offer.placement?.region||null,
      country:offer.placement?.country||null,
      public_ingress:offer.placement?.public_ingress===true,
      persistent_storage:offer.placement?.persistent_storage===true,
    },
    trust:{
      uptime_7d:Number(offer.trust?.uptime_7d||0),
      audited:offer.trust?.audited===true,
      valid_version:offer.trust?.valid_version!==false,
      attested:true,
    },
    economics:{
      zero_cost:offer.economics.zero_cost===true,
      quoted,
      hourly_usd:hourly,
      total_usd:null,
      native_price:null,
    },
    quote_required:!quoted,
    metadata:{
      voluntary_offer_id:offer.offer_id,
      execution:structuredClone(offer.execution),
      agreement,
      transcript,
    },
  };
}

export class VoluntaryComputeMarket {
  constructor({maxRounds=6,leaseResolver=null}={}){
    this.market='evercraft-voluntary';
    this.maxRounds=Math.max(1,Number(maxRounds)||6);
    this.leaseResolver=typeof leaseResolver==='function'?leaseResolver:null;
    this.providers=new Map();
    this.offers=new Map();
  }

  registerProvider({
    provider_id,
    public_key_pem,
    negotiator=null,
    leaseFactory=null,
  }={}){
    const id=String(provider_id||'').trim();
    if(!id) throw new Error('provider_id_required');
    if(!public_key_pem) throw new Error('provider_public_key_required');
    const key=createPublicKey(public_key_pem);
    this.providers.set(id,{
      provider_id:id,
      public_key:key,
      public_key_pem:String(public_key_pem),
      fingerprint:sha(String(public_key_pem)),
      negotiator:typeof negotiator==='function'?negotiator:null,
      leaseFactory:typeof leaseFactory==='function'?leaseFactory:null,
      provider_token:randomBytes(32).toString('hex'),
      proposal_queue:[],
      proposal_waiters:[],
      response_waiters:new Map(),
      registered_at:new Date().toISOString(),
    });
    const result={
      schema:'evercraft.saban.voluntary-provider-registration.v1',
      provider_id:id,
      registered_at:this.providers.get(id).registered_at,
      fingerprint:sha(String(public_key_pem)),
    };
    Object.defineProperty(result,'provider_token',{
      value:this.providers.get(id).provider_token,
      enumerable:false,
      writable:false,
    });
    return result;
  }

  authenticateProvider(providerId,token){
    const provider=this.providers.get(String(providerId||''));
    if(!provider) return null;
    const expected=Buffer.from(provider.provider_token);
    const observed=Buffer.from(String(token||''));
    if(expected.length!==observed.length) return null;
    let diff=0;
    for(let i=0;i<expected.length;i+=1) diff|=expected[i]^observed[i];
    return diff===0?provider:null;
  }

  async nextProviderProposal(providerId,{timeoutMs=20_000}={}){
    const provider=this.providers.get(String(providerId||''));
    if(!provider) throw new Error('voluntary_provider_not_registered');
    if(provider.proposal_queue.length){
      return provider.proposal_queue.shift();
    }
    return await new Promise((resolve)=>{
      const waiter={resolve,timer:null};
      waiter.timer=setTimeout(()=>{
        const index=provider.proposal_waiters.indexOf(waiter);
        if(index>=0) provider.proposal_waiters.splice(index,1);
        resolve(null);
      },Math.max(100,Math.min(30_000,Number(timeoutMs)||20_000)));
      provider.proposal_waiters.push(waiter);
    });
  }

  respondToProposal({provider_id,proposal_id,decision}={}){
    const provider=this.providers.get(String(provider_id||''));
    if(!provider) throw new Error('voluntary_provider_not_registered');
    const key=String(proposal_id||'');
    const waiter=provider.response_waiters.get(key);
    if(!waiter) throw new Error('voluntary_proposal_not_pending');
    provider.response_waiters.delete(key);
    clearTimeout(waiter.timer);
    waiter.resolve(structuredClone(decision||{action:'reject',reason:'empty_provider_response'}));
    return true;
  }

  async #askRemoteProvider(provider,payload,{timeoutMs=20_000}={}){
    const proposalId=randomUUID();
    const message={
      schema:'evercraft.saban.voluntary-negotiation-request.v1',
      proposal_request_id:proposalId,
      provider_id:provider.provider_id,
      payload:structuredClone(payload),
      created_at:new Date().toISOString(),
    };
    const waiterPromise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        provider.response_waiters.delete(proposalId);
        reject(new Error('voluntary_provider_response_timeout'));
      },Math.max(100,Math.min(60_000,Number(timeoutMs)||20_000)));
      provider.response_waiters.set(proposalId,{resolve,reject,timer});
    });
    const waiter=provider.proposal_waiters.shift();
    if(waiter){
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }else{
      provider.proposal_queue.push(message);
    }
    return await waiterPromise;
  }

  submitSignedOffer({offer:raw,signature_base64}={}){
    const offer=cleanOffer(raw);
    if(!offer.provider_id||!offer.offer_id) throw new Error('voluntary_offer_identity_required');
    const provider=this.providers.get(offer.provider_id);
    if(!provider) throw new Error('voluntary_provider_not_registered');
    if(!offer.nonce) throw new Error('voluntary_offer_nonce_required');
    if(Date.parse(offer.available_until)<=Date.now()) throw new Error('voluntary_offer_expired');

    const ok=verifySignature(
      null,
      Buffer.from(canonical(offer)),
      provider.public_key,
      Buffer.from(String(signature_base64||''),'base64')
    );
    if(!ok) throw new Error('voluntary_offer_signature_invalid');

    const accepted={
      ...offer,
      signature_verified:true,
      offer_hash:sha(offer),
      admitted_at:new Date().toISOString(),
    };
    this.offers.set(offer.offer_id,accepted);
    return {
      schema:'evercraft.saban.voluntary-offer-admission.v1',
      offer_id:offer.offer_id,
      provider_id:offer.provider_id,
      offer_hash:accepted.offer_hash,
      signature_verified:true,
      receipt_hash:sha(accepted),
    };
  }

  revokeOffer({provider_id,offer_id}={}){
    const offer=this.offers.get(String(offer_id||''));
    if(!offer||offer.provider_id!==String(provider_id||'')) return false;
    this.offers.delete(offer.offer_id);
    return true;
  }

  async discover({demand}={}){
    const offers=[];
    for(const offer of this.offers.values()){
      if(Date.parse(offer.available_until)<=Date.now()) continue;
      if(
        offer.workload_classes.length &&
        !offer.workload_classes.includes(String(demand?.workload_class||''))
      ) continue;
      offers.push(normalizeAsComputeOffer(offer));
    }
    const body={
      schema:'evercraft.saban.market-discovery.v1',
      market:this.market,
      registered_provider_count:this.providers.size,
      active_signed_offer_count:offers.length,
      observed_at:new Date().toISOString(),
    };
    return {offers,receipt:{...body,receipt_hash:sha(body)}};
  }

  async requestQuotes({demand,offer:computeOffer}={}){
    const offerId=String(computeOffer?.metadata?.voluntary_offer_id||computeOffer?.offer_id||'');
    const offer=this.offers.get(offerId);
    if(!offer) throw new Error('voluntary_offer_not_found_or_expired');
    const provider=this.providers.get(offer.provider_id);
    if(!provider) throw new Error('voluntary_provider_not_registered');

    const session=new ComputeNegotiationSession({
      demand_id:demand.demand_id,
      market:this.market,
      provider_id:offer.provider_id,
      max_rounds:this.maxRounds,
      expires_at:offer.available_until,
    });

    const initial=session.propose({
      issuer:'provider',
      terms:priceTerms(demand,offer),
    });

    let latest=initial;
    const maxHourly=demand.economics?.max_hourly_usd;
    const offeredHourly=latest.terms.economics.hourly_usd;

    if(
      !offer.economics.zero_cost &&
      maxHourly!=null &&
      offeredHourly!=null &&
      offeredHourly>maxHourly
    ){
      latest=session.counter({
        issuer:'requestor',
        terms:{
          ...latest.terms,
          economics:{
            ...latest.terms.economics,
            hourly_usd:Number(maxHourly),
            total_usd:Number(maxHourly)*(Number(demand.duration_seconds||3600)/3600),
          },
        },
      });
    }

    if(latest.issuer==='requestor'){
      for(let i=0;i<this.maxRounds;i+=1){
        const payload={
          demand:structuredClone(demand),
          proposal:structuredClone(latest),
          transcript:session.transcript(),
        };
        const decision=provider.negotiator
          ? await provider.negotiator(payload)
          : await this.#askRemoteProvider(provider,payload);
        const action=String(decision?.action||'accept').toLowerCase();
        if(action==='reject'){
          session.reject({issuer:'provider',reason:decision?.reason||'provider_rejected'});
          const transcript=session.transcript();
          return {
            schema:'evercraft.saban.voluntary-quote-round.v1',
            offers:[],
            transcript,
            receipt:{receipt_hash:transcript.receipt_hash},
          };
        }
        if(action==='counter'){
          latest=session.counter({
            issuer:'provider',
            terms:decision.terms||latest.terms,
          });
          const proposedHourly=latest.terms.economics?.hourly_usd;
          if(
            demand.economics?.max_hourly_usd!=null &&
            proposedHourly!=null &&
            proposedHourly>Number(demand.economics.max_hourly_usd)
          ){
            if(session.entries.filter((e)=>e.type==='proposal').length>=this.maxRounds){
              session.reject({issuer:'requestor',reason:'round_limit_without_budget_match'});
              break;
            }
            latest=session.counter({
              issuer:'requestor',
              terms:{
                ...latest.terms,
                economics:{
                  ...latest.terms.economics,
                  hourly_usd:Number(demand.economics.max_hourly_usd),
                  total_usd:Number(demand.economics.max_hourly_usd)*
                    (Number(demand.duration_seconds||3600)/3600),
                },
              },
            });
            continue;
          }
        }
        break;
      }
    }

    if(session.state==='rejected'){
      const transcript=session.transcript();
      return {
        schema:'evercraft.saban.voluntary-quote-round.v1',
        offers:[],
        transcript,
        receipt:{receipt_hash:transcript.receipt_hash},
      };
    }

    session.accept({issuer:'provider',proposal_id:session.latestProposal().proposal_id});
    session.accept({issuer:'requestor',proposal_id:session.latestProposal().proposal_id});
    const agreement=session.agreement();
    const transcript=session.transcript();

    const agreed=structuredClone(offer);
    const economics=agreement.terms.economics||{};
    agreed.economics={
      ...agreed.economics,
      zero_cost:economics.zero_cost===true,
      hourly_usd:economics.hourly_usd,
    };
    const normalized=normalizeAsComputeOffer(agreed,{
      quoted:true,
      agreement,
      transcript,
    });
    normalized.economics.total_usd=economics.total_usd??null;

    return {
      schema:'evercraft.saban.voluntary-quote-round.v1',
      offers:[normalized],
      agreement,
      transcript,
      receipt:{
        receipt_hash:sha({
          agreement_hash:agreement.agreement_hash,
          transcript_hash:transcript.receipt_hash,
        }),
      },
    };
  }

  async lease({demand,offer,quote,authority}={}){
    const agreement=offer?.metadata?.agreement||quote?.agreement;
    if(!agreement) throw new Error('voluntary_mutual_agreement_required');
    if(agreement.demand_id!==demand.demand_id) throw new Error('voluntary_agreement_demand_mismatch');
    if(
      agreement.terms?.economics?.zero_cost!==true &&
      authority?.allow_spend!==true
    ){
      throw new Error('voluntary_spend_authority_required');
    }

    const voluntaryOfferId=
      offer?.metadata?.voluntary_offer_id||
      agreement.terms?.metadata?.voluntary_offer_id;
    const source=this.offers.get(String(voluntaryOfferId||''));
    if(!source) throw new Error('voluntary_source_offer_unavailable');
    const provider=this.providers.get(source.provider_id);
    if(!provider) throw new Error('voluntary_provider_unavailable');

    let runtime=null;
    const resolver=provider.leaseFactory||this.leaseResolver;
    if(resolver){
      runtime=await resolver({
        demand:structuredClone(demand),
        agreement:structuredClone(agreement),
        offer:structuredClone(source),
        provider:{
          provider_id:provider.provider_id,
          fingerprint:provider.fingerprint,
          public_key_pem:provider.public_key_pem,
        },
      });
    }

    const endpoint=runtime?.execution_endpoint||source.execution.endpoint||null;
    const transport=runtime?.transport||source.execution.transport||'unknown';
    const lease=createComputeLeaseFromAgreement(agreement,{
      execution_endpoint:endpoint,
      transport,
      ttl_seconds:demand.duration_seconds,
    });

    const result={
      ...lease,
      market:this.market,
      execution_ready:runtime?.execution_ready===true,
      zero_cost:agreement.terms?.economics?.zero_cost===true,
      receipt:lease.receipt_hash,
    };
    if(runtime?.authority){
      Object.defineProperty(result,'runtime_authority',{
        value:runtime.authority,
        enumerable:false,
        writable:false,
      });
    }
    return result;
  }
}

export function createVoluntaryMarketAdapter(options={}){
  return new VoluntaryComputeMarket(options);
}

export {
  canonical as canonicalVoluntaryOffer,
  cleanOffer as prepareVoluntaryOffer,
};
