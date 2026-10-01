#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const clean=(v)=>String(v??'').trim();

export function planProductionCapacity({
  radar,
  chromebook={
    authorized:true,
    online:false,
    public_ingress_ready:false,
    node_identity_ready:false,
    outbound_compute_ready:false,
  },
  broker={
    ready:false,
    authorized_node_count:0,
  },
}={}){
  if(radar?.schema!=='evercraft.saban.production-capacity-radar.v1'){
    throw new Error('production_capacity_radar_required');
  }
  const byRole=new Map((radar.roles||[]).map(r=>[r.role,r]));
  const ingressMarket=byRole.get('public_ingress');
  const rivetMarket=byRole.get('rivet_runtime');
  const alievMarket=byRole.get('aliev_source_store');

  const roles=[];

  roles.push({
    role:'public_ingress',
    preferred_source:
      chromebook.authorized===true&&chromebook.online===true&&chromebook.public_ingress_ready===true
        ? 'chromebook_operator_edge'
        : 'commercial_capacity',
    current_state:
      chromebook.authorized===true&&chromebook.online===true&&chromebook.public_ingress_ready===true
        ? 'satisfied'
        : 'unsatisfied',
    commercial_fallback_available:Number(ingressMarket?.eligible_offer_count||0)>0,
    selected_commercial_candidate:ingressMarket?.selected_candidate||null,
    acquisition_gate:
      Number(ingressMarket?.eligible_offer_count||0)>0
        ? 'quote_credentials_and_demand_scoped_authority_required'
        : 'no_candidate',
  });

  roles.push({
    role:'rivet_runtime',
    preferred_source:
      broker.ready===true&&Number(broker.authorized_node_count||0)>0
        ? 'evercraft_broker'
        : chromebook.authorized===true&&chromebook.online===true&&chromebook.outbound_compute_ready===true
          ? 'chromebook_outbound_compute'
          : 'commercial_capacity',
    current_state:
      broker.ready===true&&Number(broker.authorized_node_count||0)>0
        ? 'satisfied'
        : chromebook.authorized===true&&chromebook.online===true&&chromebook.outbound_compute_ready===true
          ? 'satisfied'
          : 'unsatisfied',
    commercial_fallback_available:Number(rivetMarket?.eligible_offer_count||0)>0,
    selected_commercial_candidate:rivetMarket?.selected_candidate||null,
    acquisition_gate:
      Number(rivetMarket?.eligible_offer_count||0)>0
        ? 'quote_credentials_and_demand_scoped_authority_required'
        : 'no_candidate',
  });

  roles.push({
    role:'aliev_source_store',
    preferred_source:
      broker.ready===true&&Number(broker.authorized_node_count||0)>0
        ? 'evercraft_broker'
        : 'commercial_capacity',
    current_state:
      broker.ready===true&&Number(broker.authorized_node_count||0)>0
        ? 'satisfied'
        : 'unsatisfied',
    persistent_storage_required:true,
    commercial_fallback_available:Number(alievMarket?.eligible_offer_count||0)>0,
    selected_commercial_candidate:alievMarket?.selected_candidate||null,
    acquisition_gate:
      Number(alievMarket?.eligible_offer_count||0)>0
        ? 'quote_credentials_and_demand_scoped_authority_required'
        : 'no_candidate',
  });

  const body={
    schema:'evercraft.saban.production-capacity-plan.v1',
    state:roles.every(r=>r.current_state==='satisfied')
      ? 'ready'
      : roles.every(r=>r.current_state==='satisfied'||r.commercial_fallback_available===true)
        ? 'fillable'
        : 'blocked',
    roles,
    chromebook:{
      authorized:chromebook.authorized===true,
      online:chromebook.online===true,
      public_ingress_ready:chromebook.public_ingress_ready===true,
      node_identity_ready:chromebook.node_identity_ready===true,
      outbound_compute_ready:chromebook.outbound_compute_ready===true,
      sole_production_dependency:false,
    },
    broker:{
      ready:broker.ready===true,
      authorized_node_count:Number(broker.authorized_node_count||0),
    },
    policy:{
      owned_or_authorized_capacity_first:true,
      commercial_capacity_only_for_unsatisfied_roles:true,
      visibility_is_not_authorization:true,
      no_market_order_created:true,
      no_paid_lease_created:true,
      spend_authority_required:true,
    },
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

const direct=process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href;
if(direct){
  const radarFile=clean(process.argv[2]);
  if(!radarFile||!fs.existsSync(radarFile)){
    throw new Error('usage: node production-capacity-plan.mjs <radar.json> [chromebook.json]');
  }
  const radar=JSON.parse(fs.readFileSync(radarFile,'utf8'));
  const chromebookFile=clean(process.argv[3]);
  const observation=chromebookFile&&fs.existsSync(chromebookFile)
    ? JSON.parse(fs.readFileSync(chromebookFile,'utf8'))
    : null;
  const chromebook=observation?.chromebook||observation||undefined;
  const broker=observation?.broker||undefined;
  console.log(JSON.stringify(planProductionCapacity({radar,chromebook,broker}),null,2));
}
