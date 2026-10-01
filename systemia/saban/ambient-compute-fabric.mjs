import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(values)=>[...new Set((values||[]).map(v=>String(v).trim()).filter(Boolean))];

const SAFE_ACCESS=new Set(['authorized_compute','voluntary_compute']);

export function ambientCapabilityToComputeOffer(capability={}){
  if(capability?.schema!=='evercraft.ambient-capability.v1'){
    throw new Error('ambient_capability_schema_required');
  }
  if(!SAFE_ACCESS.has(String(capability.access_class||''))){
    throw new Error('ambient_compute_requires_authorized_or_voluntary_access');
  }
  if(capability.kind!=='compute'){
    throw new Error('ambient_compute_kind_required');
  }
  if(!capability.endpoint){
    throw new Error('ambient_compute_endpoint_required');
  }
  if(capability.access_class==='authorized_compute'&&!capability.owner_ref){
    throw new Error('ambient_compute_authorization_reference_required');
  }
  if(capability.access_class==='voluntary_compute'&&!capability.terms_ref){
    throw new Error('ambient_compute_terms_required');
  }

  const meta=capability.metadata||{};
  const resources=meta.resources||{};
  const workloads=uniq(meta.supported_workloads);
  if(!workloads.length){
    throw new Error('ambient_compute_supported_workloads_required');
  }

  const body={
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:'ambient:'+String(capability.id),
    provider_id:String(capability.id),
    market:'ambient-fabric',
    access_class:String(capability.access_class),
    endpoint:String(capability.endpoint),
    resources:{
      cpu_units:Math.max(0,Number(resources.cpu_units||0)),
      memory_mb:Math.max(0,Number(resources.memory_mb||0)),
      storage_gb:Math.max(0,Number(resources.storage_gb||0)),
      gpu_count:Math.max(0,Number(resources.gpu_count||0)),
      gpu_models:uniq(resources.gpu_models).map(x=>x.toLowerCase()),
    },
    placement:{
      region:meta.region?String(meta.region):null,
      country:meta.country?String(meta.country).toUpperCase():null,
      public_ingress:meta.public_ingress===true,
      persistent_storage:meta.persistent_storage===true,
    },
    trust:{
      uptime_7d:Math.max(0,Math.min(1,Number(meta.uptime_7d||0))),
      audited:meta.audited===true,
      valid_version:meta.valid_version!==false,
      attested:meta.attested===true,
    },
    economics:{
      zero_cost:meta.zero_cost!==false,
      quoted:true,
      hourly_usd:0,
      total_usd:0,
      native_price:null,
    },
    quote_required:false,
    metadata:{
      source:'ambient-capability',
      source_type:String(capability.source_type||'unknown'),
      device_id:meta.device_id?String(meta.device_id):null,
      device_class:String(meta.device_class||'unknown'),
      device_model:meta.device_model?String(meta.device_model):null,
      owner_ref_hash:capability.owner_ref?sha(String(capability.owner_ref)):null,
      terms_ref:capability.terms_ref||null,
      supported_workloads:workloads,
      placement_labels:uniq(meta.placement_labels).map(x=>x.toLowerCase()),
      micro_node:meta.micro_node===true,
      duty_cycle:meta.duty_cycle||null,
      power_budget_watts:meta.power_budget_watts==null?null:Number(meta.power_budget_watts),
      thermal_budget:meta.thermal_budget||null,
      authorization_required:true,
      arbitrary_code_execution:false,
      verified_workloads:uniq(meta.verified_workloads),
      conformance_receipt_hash:meta.conformance_receipt_hash||null,
      conformance_verified_at:meta.conformance_verified_at||null,
      conformance_expires_at:meta.conformance_expires_at||null,
      conformance_required:capability.source_type==='microseed-device',
    },
    observed_at:capability.observed_at||new Date().toISOString(),
  };
  return {...body,offer_hash:sha(body)};
}

export function resolveAmbientComputeOffers({
  capabilities=[],
  workloadClass='',
  requireZeroCost=true,
  requireVerifiedWorkload=false,
  now=new Date(),
}={}){
  const offers=[];
  const rejected=[];

  for(const raw of capabilities||[]){
    try{
      const offer=ambientCapabilityToComputeOffer(raw);
      if(requireZeroCost&&offer.economics.zero_cost!==true){
        rejected.push({id:String(raw?.id||''),reason:'nonzero_cost_rejected'});
        continue;
      }
      const supported=new Set(offer.metadata.supported_workloads||[]);
      if(workloadClass&&!supported.has(String(workloadClass))){
        rejected.push({id:String(raw?.id||''),reason:'workload_unsupported'});
        continue;
      }
      if(requireVerifiedWorkload){
        const verified=new Set(offer.metadata.verified_workloads||[]);
        const expiry=Date.parse(String(offer.metadata.conformance_expires_at||''));
        const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
        if(workloadClass&&!verified.has(String(workloadClass))){
          rejected.push({id:String(raw?.id||''),reason:'workload_not_conformance_verified'});
          continue;
        }
        if(!workloadClass&&verified.size===0){
          rejected.push({id:String(raw?.id||''),reason:'no_conformance_verified_workloads'});
          continue;
        }
        if(!Number.isFinite(expiry)||nowMs>=expiry){
          rejected.push({id:String(raw?.id||''),reason:'workload_conformance_expired'});
          continue;
        }
      }
      offers.push(offer);
    }catch(error){
      rejected.push({id:String(raw?.id||''),reason:String(error?.message||error)});
    }
  }

  offers.sort((a,b)=>
    Number(b.trust.attested)-Number(a.trust.attested) ||
    b.resources.memory_mb-a.resources.memory_mb ||
    b.resources.cpu_units-a.resources.cpu_units ||
    a.offer_id.localeCompare(b.offer_id)
  );

  const body={
    schema:'evercraft.saban.ambient-compute-resolution.v1',
    workload_class:String(workloadClass||''),
    zero_spend_only:requireZeroCost===true,
    conformance_required:requireVerifiedWorkload===true,
    eligible_count:offers.length,
    rejected_count:rejected.length,
    offers:offers.map(x=>({
      offer_id:x.offer_id,
      provider_id:x.provider_id,
      device_class:x.metadata.device_class,
      micro_node:x.metadata.micro_node,
      supported_workloads:x.metadata.supported_workloads,
      attested:x.trust.attested,
      resources:x.resources,
    })),
    rejected,
    resolved_at:new Date().toISOString(),
  };

  return {
    offers,
    rejected,
    receipt:{...body,receipt_hash:sha(body)},
  };
}

export const AmbientMicroWorkloads=Object.freeze([
  'systemia.health-probe.v1',
  'systemia.sensor-relay.v1',
  'systemia.queue-relay.v1',
  'systemia.telemetry-normalizer.v1',
  'systemia.content-hash.v1',
  'systemia.cache-fragment.v1',
  'systemia.chunk-transform.v1',
]);
