import { createHash, randomUUID } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const now=()=>new Date().toISOString();
const clone=(value)=>structuredClone(value);

function cleanTerms(input={}){
  return {
    resources:clone(input.resources||{}),
    economics:clone(input.economics||{}),
    duration_seconds:Number(input.duration_seconds||0)||null,
    workload_class:input.workload_class?String(input.workload_class):null,
    execution:clone(input.execution||{}),
    metadata:clone(input.metadata||{}),
  };
}

export class ComputeNegotiationSession {
  constructor({
    demand_id,
    market,
    provider_id,
    max_rounds=6,
    expires_at=null,
    session_id=null,
  }={}){
    if(!demand_id) throw new Error('demand_id_required');
    if(!market) throw new Error('market_required');
    if(!provider_id) throw new Error('provider_id_required');
    this.session_id=session_id||randomUUID();
    this.demand_id=String(demand_id);
    this.market=String(market).toLowerCase();
    this.provider_id=String(provider_id);
    this.max_rounds=Math.max(1,Math.floor(Number(max_rounds)||6));
    this.expires_at=expires_at||new Date(Date.now()+5*60_000).toISOString();
    this.entries=[];
    this.accepted=new Set();
    this.state='open';
  }

  #assertOpen(){
    if(this.state!=='open') throw new Error('negotiation_not_open');
    if(Date.parse(this.expires_at)<=Date.now()){
      this.state='expired';
      throw new Error('negotiation_expired');
    }
  }

  propose({issuer,terms,previous_proposal_id=null}={}){
    this.#assertOpen();
    const who=String(issuer||'').toLowerCase();
    if(!['requestor','provider'].includes(who)) throw new Error('invalid_proposal_issuer');
    const rounds=this.entries.filter((e)=>e.type==='proposal').length;
    if(rounds>=this.max_rounds) throw new Error('negotiation_round_limit_reached');
    if(rounds>0){
      const latest=this.latestProposal();
      if(previous_proposal_id!==latest.proposal_id){
        throw new Error('proposal_chain_mismatch');
      }
      if(latest.issuer===who) throw new Error('proposal_must_alternate_issuer');
    }else if(previous_proposal_id){
      throw new Error('initial_proposal_cannot_have_parent');
    }

    const body={
      schema:'evercraft.saban.compute-proposal.v1',
      session_id:this.session_id,
      proposal_id:randomUUID(),
      demand_id:this.demand_id,
      market:this.market,
      provider_id:this.provider_id,
      issuer:who,
      round:rounds+1,
      previous_proposal_id,
      terms:cleanTerms(terms),
      created_at:now(),
      expires_at:this.expires_at,
    };
    const entry={...body,proposal_hash:sha(body)};
    this.entries.push({type:'proposal',...entry});
    this.accepted.clear();
    return clone(entry);
  }

  counter({issuer,terms}={}){
    const latest=this.latestProposal();
    if(!latest) throw new Error('proposal_required_before_counter');
    return this.propose({
      issuer,
      terms,
      previous_proposal_id:latest.proposal_id,
    });
  }

  accept({issuer,proposal_id=null}={}){
    this.#assertOpen();
    const who=String(issuer||'').toLowerCase();
    if(!['requestor','provider'].includes(who)) throw new Error('invalid_acceptance_issuer');
    const latest=this.latestProposal();
    if(!latest) throw new Error('proposal_required_before_acceptance');
    if(proposal_id&&proposal_id!==latest.proposal_id){
      throw new Error('acceptance_not_latest_proposal');
    }
    this.accepted.add(who);
    const body={
      schema:'evercraft.saban.compute-proposal-acceptance.v1',
      session_id:this.session_id,
      proposal_id:latest.proposal_id,
      issuer:who,
      accepted_at:now(),
    };
    const entry={type:'acceptance',...body,receipt_hash:sha(body)};
    this.entries.push(entry);
    if(this.accepted.has('requestor')&&this.accepted.has('provider')){
      this.state='agreed';
    }
    return clone(entry);
  }

  reject({issuer,reason='rejected'}={}){
    this.#assertOpen();
    const who=String(issuer||'').toLowerCase();
    if(!['requestor','provider'].includes(who)) throw new Error('invalid_rejection_issuer');
    const latest=this.latestProposal();
    const body={
      schema:'evercraft.saban.compute-proposal-rejection.v1',
      session_id:this.session_id,
      proposal_id:latest?.proposal_id||null,
      issuer:who,
      reason:String(reason),
      rejected_at:now(),
    };
    const entry={type:'rejection',...body,receipt_hash:sha(body)};
    this.entries.push(entry);
    this.state='rejected';
    return clone(entry);
  }

  latestProposal(){
    return [...this.entries].reverse().find((e)=>e.type==='proposal')||null;
  }

  agreement(){
    if(this.state!=='agreed') throw new Error('mutual_acceptance_required');
    const proposal=this.latestProposal();
    const body={
      schema:'evercraft.saban.compute-agreement.v1',
      agreement_id:randomUUID(),
      session_id:this.session_id,
      demand_id:this.demand_id,
      market:this.market,
      provider_id:this.provider_id,
      proposal_id:proposal.proposal_id,
      proposal_hash:proposal.proposal_hash,
      terms:clone(proposal.terms),
      accepted_by:['requestor','provider'],
      agreed_at:now(),
      expires_at:this.expires_at,
    };
    return {...body,agreement_hash:sha(body)};
  }

  transcript(){
    const body={
      schema:'evercraft.saban.compute-negotiation-transcript.v1',
      session_id:this.session_id,
      demand_id:this.demand_id,
      market:this.market,
      provider_id:this.provider_id,
      state:this.state,
      max_rounds:this.max_rounds,
      expires_at:this.expires_at,
      entries:clone(this.entries),
    };
    return {...body,receipt_hash:sha(body)};
  }
}

export function createComputeLeaseFromAgreement(agreement,{
  execution_endpoint=null,
  transport='unknown',
  ttl_seconds=null,
}={}){
  if(agreement?.schema!=='evercraft.saban.compute-agreement.v1'){
    throw new Error('compute_agreement_required');
  }
  const ttl=Math.max(
    60,
    Math.floor(Number(ttl_seconds||agreement.terms?.duration_seconds||300))
  );
  const body={
    schema:'evercraft.saban.compute-lease.v1',
    lease_id:randomUUID(),
    agreement_id:agreement.agreement_id,
    agreement_hash:agreement.agreement_hash,
    demand_id:agreement.demand_id,
    market:agreement.market,
    provider_id:agreement.provider_id,
    execution_endpoint:execution_endpoint?String(execution_endpoint):null,
    transport:String(transport||'unknown'),
    acquired_at:now(),
    expires_at:new Date(Date.now()+ttl*1000).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
