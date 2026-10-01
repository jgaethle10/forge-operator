#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const clean=(v)=>String(v??'').trim();

function ambientRole(ambient,role){
  const entry=ambient?.roles?.[role]||ambient?.[role]||null;
  return {
    ready:Number(entry?.eligible_count||entry?.count||0)>0,
    eligible_count:Number(entry?.eligible_count||entry?.count||0),
    selected_candidate:entry?.selected_candidate||entry?.selected_offer||null,
  };
}

function marketRole(radar,role){
  const r=(radar?.roles||[]).find(x=>x.role===role);
  return {
    available:Number(r?.eligible_offer_count||0)>0,
    eligible_count:Number(r?.eligible_offer_count||0),
    selected_candidate:r?.selected_candidate||null,
  };
}

function unresolvedRole({
  role,
  ambient,
  market,
  commercialCapacityAllowed,
  extra={},
}){
  if(ambient.ready){
    return {
      role,
      preferred_source:'ambient_zero_cost_capacity',
      current_state:'satisfied',
      zero_cost:true,
      ambient_offer_count:ambient.eligible_count,
      selected_ambient_candidate:ambient.selected_candidate,
      commercial_fallback_available:market.available,
      selected_commercial_candidate:market.selected_candidate,
      acquisition_gate:'none',
      ...extra,
    };
  }
  return {
    role,
    preferred_source:'authorized_capacity_required',
    current_state:'unsatisfied',
    zero_cost:true,
    ambient_offer_count:ambient.eligible_count,
    selected_ambient_candidate:null,
    commercial_fallback_available:market.available,
    selected_commercial_candidate:market.selected_candidate,
    acquisition_gate:market.available
      ? (commercialCapacityAllowed
          ? 'explicit_commercial_authority_required'
          : 'commercial_disabled_by_zero_spend_policy')
      : 'no_candidate',
    ...extra,
  };
}

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
  ambient={roles:{}},
  commercialCapacityAllowed=false,
}={}){
  if(radar?.schema!=='evercraft.saban.production-capacity-radar.v1'){
    throw new Error('production_capacity_radar_required');
  }

  const ingressMarket=marketRole(radar,'public_ingress');
  const rivetMarket=marketRole(radar,'rivet_runtime');
  const alievMarket=marketRole(radar,'aliev_source_store');
  const ingressAmbient=ambientRole(ambient,'public_ingress');
  const rivetAmbient=ambientRole(ambient,'rivet_runtime');
  const alievAmbient=ambientRole(ambient,'aliev_source_store');

  const roles=[];

  if(chromebook.authorized===true&&chromebook.online===true&&chromebook.public_ingress_ready===true){
    roles.push({
      role:'public_ingress',
      preferred_source:'chromebook_operator_edge',
      current_state:'satisfied',
      zero_cost:true,
      ambient_offer_count:ingressAmbient.eligible_count,
      commercial_fallback_available:ingressMarket.available,
      selected_commercial_candidate:ingressMarket.selected_candidate,
      acquisition_gate:'none',
    });
  }else{
    roles.push(unresolvedRole({
      role:'public_ingress',
      ambient:ingressAmbient,
      market:ingressMarket,
      commercialCapacityAllowed,
    }));
  }

  if(broker.ready===true&&Number(broker.authorized_node_count||0)>0){
    roles.push({
      role:'rivet_runtime',
      preferred_source:'evercraft_broker',
      current_state:'satisfied',
      zero_cost:true,
      ambient_offer_count:rivetAmbient.eligible_count,
      commercial_fallback_available:rivetMarket.available,
      selected_commercial_candidate:rivetMarket.selected_candidate,
      acquisition_gate:'none',
    });
  }else if(chromebook.authorized===true&&chromebook.online===true&&chromebook.outbound_compute_ready===true){
    roles.push({
      role:'rivet_runtime',
      preferred_source:'chromebook_outbound_compute',
      current_state:'satisfied',
      zero_cost:true,
      ambient_offer_count:rivetAmbient.eligible_count,
      commercial_fallback_available:rivetMarket.available,
      selected_commercial_candidate:rivetMarket.selected_candidate,
      acquisition_gate:'none',
    });
  }else{
    roles.push(unresolvedRole({
      role:'rivet_runtime',
      ambient:rivetAmbient,
      market:rivetMarket,
      commercialCapacityAllowed,
    }));
  }

  if(broker.ready===true&&Number(broker.authorized_node_count||0)>0){
    roles.push({
      role:'aliev_source_store',
      preferred_source:'evercraft_broker',
      current_state:'satisfied',
      zero_cost:true,
      persistent_storage_required:true,
      ambient_offer_count:alievAmbient.eligible_count,
      commercial_fallback_available:alievMarket.available,
      selected_commercial_candidate:alievMarket.selected_candidate,
      acquisition_gate:'none',
    });
  }else{
    roles.push(unresolvedRole({
      role:'aliev_source_store',
      ambient:alievAmbient,
      market:alievMarket,
      commercialCapacityAllowed,
      extra:{persistent_storage_required:true},
    }));
  }

  const allSatisfied=roles.every(r=>r.current_state==='satisfied');
  const commercialFillable=commercialCapacityAllowed&&roles.every(
    r=>r.current_state==='satisfied'||r.commercial_fallback_available===true
  );

  const body={
    schema:'evercraft.saban.production-capacity-plan.v2',
    state:allSatisfied
      ? 'ready_zero_spend'
      : commercialFillable
        ? 'commercial_fillable_with_explicit_authority'
        : 'zero_spend_capacity_needed',
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
    ambient:{
      public_ingress_offer_count:ingressAmbient.eligible_count,
      rivet_runtime_offer_count:rivetAmbient.eligible_count,
      aliev_source_store_offer_count:alievAmbient.eligible_count,
    },
    policy:{
      zero_spend_default:true,
      commercial_capacity_allowed:commercialCapacityAllowed===true,
      owned_or_authorized_capacity_first:true,
      ambient_authorized_capacity_before_commercial:true,
      commercial_capacity_visibility_only:commercialCapacityAllowed!==true,
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
    throw new Error('usage: node production-capacity-plan.mjs <radar.json> [observation.json] [ambient.json]');
  }
  const radar=JSON.parse(fs.readFileSync(radarFile,'utf8'));
  const observationFile=clean(process.argv[3]);
  const observation=observationFile&&fs.existsSync(observationFile)
    ? JSON.parse(fs.readFileSync(observationFile,'utf8'))
    : null;
  const ambientFile=clean(process.argv[4]);
  const ambient=ambientFile&&fs.existsSync(ambientFile)
    ? JSON.parse(fs.readFileSync(ambientFile,'utf8'))
    : undefined;
  const chromebook=observation?.chromebook||observation||undefined;
  const broker=observation?.broker||undefined;
  const commercialCapacityAllowed=process.env.SABAN_ALLOW_COMMERCIAL_CAPACITY==='1';
  console.log(JSON.stringify(planProductionCapacity({
    radar,chromebook,broker,ambient,commercialCapacityAllowed
  }),null,2));
}
