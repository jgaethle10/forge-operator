import { createHash, randomBytes } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const id=(prefix)=>`${prefix}-${randomBytes(8).toString('hex')}`;
const now=()=>new Date().toISOString();

export function normalizeNegotiationTerms(input={}){
  const body={
    schema:'evercraft.saban.compute-terms.v1',
    cpu_units:Math.max(0.001,Number(input.cpu_units||1)),
    memory_mb:Math.max(1,Math.floor(Number(input.memory_mb||512))),
    storage_gb:Math.max(0,Number(input.storage_gb||0)),
    gpu_count:Math.max(0,Math.floor(Number(input.gpu_count||0))),
    duration_seconds:Math.max(60,Math.floor(Number(input.duration_seconds||3600))),
    hourly_usd:input.hourly_usd==null?0:Math.max(0,Number(input.hourly_usd)),
    total_usd:input.total_usd==null?null:Math.max(0,Number(input.total_usd)),
    workload_class:String(input.workload_class||'saban.multiplier-assignment.v1'),
  };
  if(body.total_usd==null){
    body.total_usd=Number((body.hourly_usd*(body.duration_seconds/3600)).toFixed(9));
  }
  return body;
}

export function createComputeProposal({
  demand_id,
  provider_id,
  market,
  terms,
  parent_proposal_id=null,
  round=1,
  expires_at=null,
}={}){
  if(!demand_id) throw new Error('proposal_demand_id_required');
  if(!provider_id) throw new Error('proposal_provider_id_required');
  const body={
    schema:'evercraft.saban.compute-proposal.v1',
    proposal_id:id('proposal'),
    demand_id:String(demand_id),
    provider_id:String(provider_id),
    market:String(market||'unknown').toLowerCase(),
    parent_proposal_id:parent_proposal_id?String(parent_proposal_id):null,
    round:Math.max(1,Math.floor(Number(round||1))),
    terms:normalizeNegotiationTerms(terms),
    state:'pending',
    created_at:now(),
    expires_at:expires_at||new Date(Date.now()+120000).toISOString(),
  };
  return {...body,proposal_hash:sha(body)};
}

export function counterComputeProposal(proposal,counterTerms){
  if(proposal?.schema!=='evercraft.saban.compute-proposal.v1'){
    throw new Error('proposal_schema_invalid');
  }
  if(proposal.state!=='pending') throw new Error('proposal_not_pending');
  return createComputeProposal({
    demand_id:proposal.demand_id,
    provider_id:proposal.provider_id,
    market:proposal.market,
    parent_proposal_id:proposal.proposal_id,
    round:Number(proposal.round||1)+1,
    terms:{...proposal.terms,...counterTerms},
    expires_at:new Date(Date.now()+120000).toISOString(),
  });
}

export function createComputeAgreement({
  proposal,
  lease_seconds=null,
}={}){
  if(proposal?.schema!=='evercraft.saban.compute-proposal.v1'){
    throw new Error('agreement_proposal_invalid');
  }
  const duration=Math.max(
    60,
    Math.min(
      Number(proposal.terms?.duration_seconds||3600),
      Number(lease_seconds||proposal.terms?.duration_seconds||3600)
    )
  );
  const body={
    schema:'evercraft.saban.compute-agreement.v1',
    agreement_id:id('agreement'),
    proposal_id:proposal.proposal_id,
    demand_id:proposal.demand_id,
    provider_id:proposal.provider_id,
    market:proposal.market,
    terms:structuredClone(proposal.terms),
    state:'active',
    started_at:now(),
    expires_at:new Date(Date.now()+duration*1000).toISOString(),
  };
  return {...body,agreement_hash:sha(body)};
}

export function agreementUsable(agreement,{
  provider_id=null,
  workload_class=null,
}={}){
  if(agreement?.schema!=='evercraft.saban.compute-agreement.v1'){
    return {ok:false,reason:'agreement_schema_invalid'};
  }
  if(agreement.state!=='active') return {ok:false,reason:'agreement_not_active'};
  if(Date.parse(agreement.expires_at)<=Date.now()) return {ok:false,reason:'agreement_expired'};
  if(provider_id&&agreement.provider_id!==provider_id){
    return {ok:false,reason:'agreement_provider_mismatch'};
  }
  if(workload_class&&agreement.terms?.workload_class!==workload_class){
    return {ok:false,reason:'agreement_workload_mismatch'};
  }
  return {ok:true,reason:'agreement_active'};
}
