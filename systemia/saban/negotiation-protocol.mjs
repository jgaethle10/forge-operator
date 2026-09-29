import { createHash } from 'node:crypto';
import {
  evaluateComputeOffer,
  normalizeComputeDemand,
  normalizeComputeOffer,
} from './compute-exchange.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const finite=(value,fallback=null)=>{
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
};

const negotiableReasons=new Set([
  'insufficient_cpu',
  'insufficient_memory',
  'insufficient_storage',
  'insufficient_gpu_count',
  'required_gpu_model_missing',
  'hourly_budget_exceeded',
  'total_budget_exceeded',
]);

function agreementAuthorityAllows(authority,demand,proposal){
  if(!authority||authority.schema!=='evercraft.saban.compute-authority.v1'){
    return {ok:false,reason:'agreement_authority_missing'};
  }
  if(authority.approved!==true) return {ok:false,reason:'agreement_authority_not_approved'};
  if(authority.demand_id!==demand.demand_id){
    return {ok:false,reason:'agreement_authority_demand_mismatch'};
  }
  const allowed=new Set((authority.allowed_markets||[]).map((x)=>String(x).toLowerCase()));
  if(allowed.size&&!allowed.has(String(proposal.market).toLowerCase())){
    return {ok:false,reason:'agreement_market_not_allowed'};
  }
  const ceiling=authority.max_total_usd==null?null:Number(authority.max_total_usd);
  if(
    ceiling!=null &&
    proposal.economics?.total_usd!=null &&
    Number(proposal.economics.total_usd)>ceiling
  ){
    return {ok:false,reason:'agreement_budget_exceeded'};
  }
  if(authority.expires_at&&Date.parse(authority.expires_at)<=Date.now()){
    return {ok:false,reason:'agreement_authority_expired'};
  }
  return {ok:true,reason:'authorized'};
}

export function normalizeComputeProposal(input={}){
  const offer=normalizeComputeOffer(input.offer||input);
  const body={
    schema:'evercraft.saban.compute-proposal.v1',
    proposal_id:String(input.proposal_id||offer.offer_id).trim(),
    previous_proposal_id:input.previous_proposal_id?
      String(input.previous_proposal_id).trim():null,
    demand_id:String(input.demand_id||'').trim(),
    issuer:String(input.issuer||'provider').trim().toLowerCase(),
    market:offer.market,
    provider_id:offer.provider_id,
    round:Math.max(0,Math.floor(finite(input.round,0))),
    state:String(input.state||'draft').trim().toLowerCase(),
    offer,
    expires_at:input.expires_at||null,
    observed_at:input.observed_at||new Date().toISOString(),
    source_receipt:input.source_receipt||null,
  };
  if(!body.proposal_id) throw new Error('proposal_id_required');
  if(!body.demand_id) throw new Error('proposal_demand_id_required');
  if(!['provider','requestor'].includes(body.issuer)) throw new Error('proposal_issuer_invalid');
  return {...body,proposal_hash:sha(body)};
}

export function buildComputeCounterProposal({
  demand:demandInput,
  proposal:proposalInput,
  round=null,
}={}){
  const demand=demandInput?.schema==='evercraft.saban.compute-demand.v1'
    ? structuredClone(demandInput)
    : normalizeComputeDemand(demandInput||{});
  const proposal=proposalInput?.schema==='evercraft.saban.compute-proposal.v1'
    ? proposalInput
    : normalizeComputeProposal(proposalInput||{});
  const decision=evaluateComputeOffer(demand,proposal.offer);

  if(decision.eligible) return null;
  if(decision.reasons.some((reason)=>!negotiableReasons.has(reason))){
    return {
      negotiable:false,
      reasons:decision.reasons,
      counter:null,
    };
  }

  const targetOffer=structuredClone(proposal.offer);
  targetOffer.resources={
    ...targetOffer.resources,
    cpu_units:Math.max(targetOffer.resources.cpu_units,demand.resources.cpu_units),
    memory_mb:Math.max(targetOffer.resources.memory_mb,demand.resources.memory_mb),
    storage_gb:Math.max(targetOffer.resources.storage_gb,demand.resources.storage_gb),
    gpu_count:Math.max(targetOffer.resources.gpu_count,demand.resources.gpu_count),
    gpu_models:demand.resources.gpu_models.length?
      [...demand.resources.gpu_models]:
      targetOffer.resources.gpu_models,
  };
  if(demand.economics.max_hourly_usd!=null){
    targetOffer.economics.hourly_usd=Math.min(
      targetOffer.economics.hourly_usd??demand.economics.max_hourly_usd,
      demand.economics.max_hourly_usd
    );
  }
  if(demand.economics.max_total_usd!=null){
    targetOffer.economics.total_usd=Math.min(
      targetOffer.economics.total_usd??demand.economics.max_total_usd,
      demand.economics.max_total_usd
    );
  }
  targetOffer.economics.quoted=true;

  return {
    negotiable:true,
    reasons:decision.reasons,
    counter:normalizeComputeProposal({
      proposal_id:`${proposal.proposal_id}:counter:${Number(round??proposal.round+1)}`,
      previous_proposal_id:proposal.proposal_id,
      demand_id:demand.demand_id,
      issuer:'requestor',
      market:proposal.market,
      provider_id:proposal.provider_id,
      round:Number(round??proposal.round+1),
      state:'counter',
      offer:targetOffer,
      expires_at:proposal.expires_at,
      source_receipt:proposal.proposal_hash,
    }),
  };
}

export async function negotiateComputeAgreement({
  demand:demandInput,
  session,
  agreementAuthority=null,
  maxRounds=3,
}={}){
  if(!session||typeof session.open!=='function'||typeof session.counter!=='function'){
    throw new Error('negotiation_session_required');
  }
  const demand=demandInput?.schema==='evercraft.saban.compute-demand.v1'
    ? structuredClone(demandInput)
    : normalizeComputeDemand(demandInput||{});
  const events=[];
  let proposal=normalizeComputeProposal(await session.open({demand}));
  events.push({type:'proposal.received',proposal_hash:proposal.proposal_hash,round:proposal.round});

  for(let round=0;round<=Math.max(0,Number(maxRounds));round+=1){
    const decision=evaluateComputeOffer(demand,proposal.offer);
    if(decision.eligible){
      const gate=agreementAuthorityAllows(agreementAuthority,demand,proposal);
      if(!gate.ok){
        const body={
          schema:'evercraft.saban.compute-negotiation-session.v1',
          status:'agreement_held',
          reason:gate.reason,
          demand_hash:demand.demand_hash,
          proposal,
          agreement:null,
          events,
          completed_at:new Date().toISOString(),
        };
        return {...body,receipt_hash:sha(body)};
      }
      if(typeof session.agree!=='function'){
        throw new Error('negotiation_agreement_operation_required');
      }
      const agreement=await session.agree({demand,proposal,authority:agreementAuthority});
      events.push({
        type:'agreement.accepted',
        proposal_hash:proposal.proposal_hash,
        agreement_receipt:agreement?.receipt||agreement?.receipt_hash||null,
      });
      const body={
        schema:'evercraft.saban.compute-negotiation-session.v1',
        status:'agreed',
        demand_hash:demand.demand_hash,
        proposal,
        agreement,
        events,
        completed_at:new Date().toISOString(),
      };
      return {...body,receipt_hash:sha(body)};
    }

    if(round>=Number(maxRounds)){
      break;
    }
    const next=buildComputeCounterProposal({demand,proposal,round:round+1});
    if(!next?.negotiable||!next.counter){
      events.push({type:'proposal.rejected',reasons:decision.reasons});
      break;
    }

    events.push({
      type:'counter.sent',
      proposal_hash:next.counter.proposal_hash,
      previous_proposal_id:proposal.proposal_id,
      reasons:next.reasons,
    });
    const response=await session.counter({
      demand,
      proposal,
      counter:next.counter,
    });
    if(!response){
      events.push({type:'counter.no_response'});
      break;
    }
    proposal=normalizeComputeProposal(response);
    events.push({type:'proposal.received',proposal_hash:proposal.proposal_hash,round:proposal.round});
  }

  if(typeof session.close==='function'){
    await session.close({demand,proposal,reason:'no_agreement'});
  }
  const body={
    schema:'evercraft.saban.compute-negotiation-session.v1',
    status:'no_agreement',
    demand_hash:demand.demand_hash,
    proposal,
    agreement:null,
    events,
    completed_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
