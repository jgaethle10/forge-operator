import { createHash } from 'node:crypto';
import { performanceProfile, rankPerformanceAdjustment } from './performance-learning.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(values)=>[...new Set((values||[]).map(v=>String(v).trim()).filter(Boolean))];

function clamp01(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
}

export function normalizeFabricTask(input={}){
  const taskId=String(input.task_id||'').trim();
  if(!taskId) throw new Error('fabric_task_id_required');
  const alreadyNormalized=input?.schema==='evercraft.saban.fabric-task.v1';
  const shape=String(input.execution_shape||'atomic').trim();
  if(!['atomic','shardable'].includes(shape)) throw new Error('fabric_task_execution_shape_invalid');

  const shardCount=shape==='shardable'
    ? Math.max(1,Math.floor(Number(input.shard_count||1)))
    : 1;
  const replicas=Math.max(1,Math.floor(Number(input.replicas||1)));
  const resources=alreadyNormalized
    ? (input.resources_per_execution||{})
    : (input.resources||{});
  const trustInput=alreadyNormalized?(input.trust||{}):input;
  const continuityInput=alreadyNormalized?(input.continuity||{}):input;
  const energyInput=alreadyNormalized?(input.energy||{}):input;
  const dataInput=alreadyNormalized?(input.data||{}):input;

  const body={
    schema:'evercraft.saban.fabric-task.v1',
    task_id:taskId,
    workload_class:String(input.workload_class||'').trim(),
    execution_shape:shape,
    shard_count:shardCount,
    replicas,
    resources_per_execution:{
      cpu_units:Math.max(0,Number(resources.cpu_units||0)),
      memory_mb:Math.max(0,Number(resources.memory_mb||0)),
      storage_gb:Math.max(0,Number(resources.storage_gb||0)),
    },
    required_labels:uniq(input.required_labels).map(x=>x.toLowerCase()),
    required_locality_tags:uniq(input.required_locality_tags).map(x=>x.toLowerCase()),
    forbidden_device_classes:uniq(input.forbidden_device_classes).map(x=>x.toLowerCase()),
    allowed_device_classes:uniq(input.allowed_device_classes).map(x=>x.toLowerCase()),
    trust:{
      require_attestation:trustInput.require_attestation!==false,
      allowed_access_classes:uniq(
        trustInput.allowed_access_classes?.length
          ? trustInput.allowed_access_classes
          : ['authorized_compute']
      ),
      private_data:trustInput.private_data===true,
      minimum_uptime_7d:clamp01(trustInput.minimum_uptime_7d,0),
    },
    continuity:{
      preemptible:continuityInput.preemptible===true,
      checkpointable:continuityInput.checkpointable===true,
      require_distinct_failure_domains:
        continuityInput.require_distinct_failure_domains!==false&&replicas>1,
      failure_domain_axes:
        continuityInput.require_distinct_failure_domains!==false&&replicas>1
          ? uniq(
              continuityInput.failure_domain_axes?.length
                ? continuityInput.failure_domain_axes
                : ['failure_domain']
            ).map(x=>x.toLowerCase())
          : [],
      max_observation_age_ms:Math.max(
        1000,
        Number(continuityInput.max_observation_age_ms||300000)
      ),
      require_always_on:continuityInput.require_always_on===true,
    },
    energy:{
      max_power_budget_watts:energyInput.max_power_budget_watts==null
        ? null
        : Math.max(0,Number(energyInput.max_power_budget_watts)),
      thermal_tolerance:String(energyInput.thermal_tolerance||'device_defined'),
      prefer_lower_power:energyInput.prefer_lower_power!==false,
    },
    data:{
      input_bytes:Math.max(0,Number(dataInput.input_bytes||0)),
      output_bytes:Math.max(0,Number(dataInput.output_bytes||0)),
      local_only:dataInput.local_only===true,
    },
    created_at:input.created_at||new Date().toISOString(),
  };
  if(!body.workload_class) throw new Error('fabric_task_workload_class_required');
  if(body.continuity.preemptible&&!body.continuity.checkpointable){
    throw new Error('preemptible_task_must_be_checkpointable');
  }
  return {...body,task_hash:sha(body)};
}

function normalizeOffer(raw={}){
  if(raw.schema!=='evercraft.saban.compute-offer.v1'){
    throw new Error('fabric_offer_schema_invalid');
  }
  return {
    ...raw,
    access_class:String(raw.access_class||''),
    provider_id:String(raw.provider_id||''),
    resources:{
      cpu_units:Math.max(0,Number(raw.resources?.cpu_units||0)),
      memory_mb:Math.max(0,Number(raw.resources?.memory_mb||0)),
      storage_gb:Math.max(0,Number(raw.resources?.storage_gb||0)),
    },
    trust:{
      uptime_7d:clamp01(raw.trust?.uptime_7d,0),
      attested:raw.trust?.attested===true,
      valid_version:raw.trust?.valid_version!==false,
      audited:raw.trust?.audited===true,
    },
    metadata:raw.metadata&&typeof raw.metadata==='object'?raw.metadata:{},
    placement:raw.placement&&typeof raw.placement==='object'?raw.placement:{},
  };
}

function offerFailureDomain(offer){
  return String(
    offer.metadata?.failure_domain||
    offer.metadata?.gateway_identity||
    offer.metadata?.site_id||
    offer.metadata?.network_id||
    offer.provider_id
  );
}

function offerFailureDomains(offer){
  const explicit=offer.metadata?.failure_domains&&typeof offer.metadata.failure_domains==='object'
    ? Object.fromEntries(
        Object.entries(offer.metadata.failure_domains)
          .map(([axis,value])=>[
            String(axis).trim().toLowerCase(),
            String(value??'').trim().toLowerCase(),
          ])
          .filter(([axis,value])=>axis&&value)
      )
    : {};
  return {
    failure_domain:offerFailureDomain(offer),
    ...explicit,
  };
}

function offerLocalityTags(offer){
  return new Set([
    ...(offer.metadata?.placement_labels||[]),
    ...(offer.metadata?.locality_tags||[]),
    offer.placement?.region,
    offer.placement?.country,
  ].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
}

function evaluateOffer(task,offer,nowMs,performanceLedger=null){
  const reasons=[];
  const workloads=new Set((offer.metadata?.supported_workloads||[]).map(String));
  const labels=new Set((offer.metadata?.placement_labels||[]).map(x=>String(x).toLowerCase()));
  const locality=offerLocalityTags(offer);
  const deviceClass=String(offer.metadata?.device_class||'unknown').toLowerCase();
  const dutyCycle=String(offer.metadata?.duty_cycle||'').toLowerCase();
  const observedAt=Date.parse(String(offer.observed_at||''))||0;
  const ageMs=Math.max(0,nowMs-observedAt);
  const failureDomains=offerFailureDomains(offer);
  let performance=null;
  if(performanceLedger){
    const profile=performanceProfile(performanceLedger,{
      device_id:offer.metadata?.device_id||offer.provider_id,
      workload_class:task.workload_class,
      now:new Date(nowMs),
    });
    performance=rankPerformanceAdjustment(profile);
    if(performance.circuit_open===true){
      reasons.push('performance_circuit_open');
    }
  }

  if(!task.trust.allowed_access_classes.includes(offer.access_class)) reasons.push('access_class_not_allowed');
  if(task.trust.require_attestation&&offer.trust.attested!==true) reasons.push('attestation_required');
  if(task.trust.private_data&&offer.access_class!=='authorized_compute') reasons.push('private_data_requires_authorized_compute');
  if(offer.trust.valid_version!==true) reasons.push('valid_version_required');
  if(offer.trust.uptime_7d<task.trust.minimum_uptime_7d) reasons.push('uptime_below_floor');
  if(ageMs>task.continuity.max_observation_age_ms) reasons.push('offer_stale');

  if(
    !workloads.has(task.workload_class) &&
    offer.metadata?.generic_container_runtime!==true
  ) reasons.push(workloads.size?'workload_unsupported':'workload_capability_unknown');

  if(offer.metadata?.conformance_required===true){
    const verified=new Set((offer.metadata?.verified_workloads||[]).map(String));
    if(!verified.has(task.workload_class)){
      reasons.push('workload_not_conformance_verified');
    }else{
      const expiry=Date.parse(String(offer.metadata?.conformance_expires_at||''));
      if(!Number.isFinite(expiry)||nowMs>=expiry) reasons.push('workload_conformance_expired');
    }
  }
  if(task.required_labels.some(x=>!labels.has(x))) reasons.push('required_label_missing');
  if(task.required_locality_tags.some(x=>!locality.has(x))) reasons.push('required_locality_missing');
  if(task.allowed_device_classes.length&&!task.allowed_device_classes.includes(deviceClass)){
    reasons.push('device_class_not_allowed');
  }
  if(task.forbidden_device_classes.includes(deviceClass)) reasons.push('device_class_forbidden');

  const r=task.resources_per_execution;
  if(offer.resources.cpu_units<r.cpu_units) reasons.push('insufficient_cpu');
  if(offer.resources.memory_mb<r.memory_mb) reasons.push('insufficient_memory');
  if(offer.resources.storage_gb<r.storage_gb) reasons.push('insufficient_storage');

  if(task.continuity.require_always_on&&['opportunistic','sleepy','intermittent'].includes(dutyCycle)){
    reasons.push('always_on_required');
  }
  if(!task.continuity.preemptible&&['opportunistic','sleepy','intermittent'].includes(dutyCycle)){
    reasons.push('nonpreemptible_on_intermittent_device');
  }

  const power=offer.metadata?.power_budget_watts;
  if(
    task.energy.max_power_budget_watts!=null &&
    power!=null &&
    Number(power)>task.energy.max_power_budget_watts
  ) reasons.push('power_budget_exceeded');

  if(task.data.local_only&&task.required_locality_tags.length===0){
    reasons.push('local_only_requires_locality_tag');
  }
  for(const axis of task.continuity.failure_domain_axes||[]){
    if(!String(failureDomains[axis]||'').trim()){
      reasons.push('failure_domain_axis_missing:'+axis);
    }
  }

  let score=0;
  if(!reasons.length){
    if(offer.economics?.zero_cost===true) score+=10000;
    if(offer.access_class==='authorized_compute') score+=1500;
    if(offer.trust.attested) score+=1000;
    score+=Math.round(offer.trust.uptime_7d*500);
    if(offer.metadata?.micro_node===true&&r.memory_mb<=512&&r.cpu_units<=0.5) score+=300;
    if(task.continuity.preemptible&&['opportunistic','sleepy','intermittent'].includes(dutyCycle)) score+=150;
    if(task.required_locality_tags.length){
      score+=task.required_locality_tags.filter(x=>locality.has(x)).length*250;
    }
    if(task.energy.prefer_lower_power&&power!=null){
      score+=Math.max(0,250-Math.round(Number(power)*10));
    }
    score-=Math.min(500,Math.round(ageMs/1000));
    score+=Math.min(300,Math.round((offer.resources.memory_mb/Math.max(1,r.memory_mb))*10));

    if(performance){
      score+=performance.score;
      if(
        task.energy.prefer_lower_power &&
        performance.average_energy_wh!=null
      ){
        const energyPenalty=Math.min(
          1200,
          Math.round(Math.max(0,Number(performance.average_energy_wh))*400)
        );
        score-=energyPenalty;
        performance={...performance,energy_score_penalty:energyPenalty};
      }
    }
  }

  return {
    eligible:reasons.length===0,
    reasons,
    score,
    failure_domain:failureDomains.failure_domain,
    failure_domains:failureDomains,
    age_ms:ageMs,
    device_class:deviceClass,
    performance,
    offer,
  };
}

function executionUnits(task){
  const units=[];
  for(let shard=0;shard<task.shard_count;shard++){
    for(let replica=0;replica<task.replicas;replica++){
      units.push({
        unit_id:`${task.task_id}:s${shard}:r${replica}`,
        shard_index:shard,
        replica_index:replica,
      });
    }
  }
  return units;
}

export function planHeterogeneousFabric({
  tasks=[],
  offers=[],
  performanceLedger=null,
  previousPlan=null,
  stickinessScore=250,
  now=new Date(),
}={}){
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(nowMs)) throw new Error('fabric_planner_now_invalid');

  const normalizedTasks=tasks.map(normalizeFabricTask);
  const normalizedOffers=offers.map(normalizeOffer);
  const residual=new Map(normalizedOffers.map(o=>[o.offer_id,{
    cpu_units:o.resources.cpu_units,
    memory_mb:o.resources.memory_mb,
    storage_gb:o.resources.storage_gb,
    slots:o.metadata?.max_concurrency==null
      ? 1024
      : Math.max(1,Math.floor(Number(o.metadata.max_concurrency))),
  }]));
  const placements=[];
  const held=[];
  const eligibleOffersByTask={};

  const sortedTasks=[...normalizedTasks].sort((a,b)=>
    Number(b.trust.private_data)-Number(a.trust.private_data) ||
    Number(b.continuity.require_always_on)-Number(a.continuity.require_always_on) ||
    b.resources_per_execution.memory_mb-a.resources_per_execution.memory_mb ||
    a.task_id.localeCompare(b.task_id)
  );

  for(const task of sortedTasks){
    const evals=normalizedOffers
      .map(o=>evaluateOffer(task,o,nowMs,performanceLedger))
      .filter(x=>x.eligible)
      .sort((a,b)=>b.score-a.score||a.offer.offer_id.localeCompare(b.offer.offer_id));

    eligibleOffersByTask[task.task_id]=evals.map(x=>x.offer.offer_id);
    const shardDomains=new Map();

    for(const unit of executionUnits(task)){
      let chosen=null;
      const priorOfferId=previousPlan?.placements?.find(x=>x.unit_id===unit.unit_id)?.offer_id||null;
      const ranked=evals.map(candidate=>({
        ...candidate,
        effective_score:candidate.score+(candidate.offer.offer_id===priorOfferId?Math.max(0,Number(stickinessScore||0)):0),
        sticky:candidate.offer.offer_id===priorOfferId,
      })).sort((a,b)=>b.effective_score-a.effective_score||a.offer.offer_id.localeCompare(b.offer.offer_id));
      for(const candidate of ranked){
        const left=residual.get(candidate.offer.offer_id);
        if(!left||left.slots<1) continue;
        const r=task.resources_per_execution;
        if(left.cpu_units<r.cpu_units||left.memory_mb<r.memory_mb||left.storage_gb<r.storage_gb) continue;

        const domains=shardDomains.get(unit.shard_index)||new Map();
        if(task.continuity.require_distinct_failure_domains){
          const collides=(task.continuity.failure_domain_axes||[]).some(axis=>{
            const used=domains.get(axis)||new Set();
            return used.has(candidate.failure_domains?.[axis]);
          });
          if(collides) continue;
        }
        chosen={candidate,left,domains};
        break;
      }

      if(!chosen){
        held.push({
          task_id:task.task_id,
          unit_id:unit.unit_id,
          shard_index:unit.shard_index,
          replica_index:unit.replica_index,
          reason:'no_eligible_capacity',
          candidate_rejections:normalizedOffers.map(o=>{
            const ev=evaluateOffer(task,o,nowMs,performanceLedger);
            return {offer_id:o.offer_id,reasons:ev.reasons};
          }),
        });
        continue;
      }

      const {candidate,left,domains}=chosen;
      const r=task.resources_per_execution;
      left.cpu_units-=r.cpu_units;
      left.memory_mb-=r.memory_mb;
      left.storage_gb-=r.storage_gb;
      left.slots-=1;
      for(const axis of task.continuity.failure_domain_axes||[]){
        const used=domains.get(axis)||new Set();
        used.add(candidate.failure_domains?.[axis]);
        domains.set(axis,used);
      }
      shardDomains.set(unit.shard_index,domains);

      placements.push({
        task_id:task.task_id,
        unit_id:unit.unit_id,
        shard_index:unit.shard_index,
        replica_index:unit.replica_index,
        offer_id:candidate.offer.offer_id,
        provider_id:candidate.offer.provider_id,
        device_id:candidate.offer.metadata?.device_id||null,
        market:candidate.offer.market,
        access_class:candidate.offer.access_class,
        device_class:candidate.device_class,
        failure_domain:candidate.failure_domain,
        failure_domains:candidate.failure_domains,
        separated_failure_domain_axes:task.continuity.failure_domain_axes||[],
        score:candidate.score,
        effective_score:candidate.effective_score??candidate.score,
        sticky_reuse:candidate.sticky===true,
        performance_adjustment:candidate.performance||null,
        zero_cost:candidate.offer.economics?.zero_cost===true,
        attested:candidate.offer.trust.attested===true,
        preemptible:task.continuity.preemptible,
        checkpointable:task.continuity.checkpointable,
      });
    }
  }

  const requiredUnits=normalizedTasks.reduce((sum,t)=>sum+t.shard_count*t.replicas,0);
  const zeroCost=placements.every(p=>p.zero_cost===true);
  const body={
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    state:placements.length===requiredUnits?'ready':'held',
    task_count:normalizedTasks.length,
    required_execution_units:requiredUnits,
    placed_execution_units:placements.length,
    held_execution_units:held.length,
    selected_offer_count:new Set(placements.map(p=>p.offer_id)).size,
    placements,
    held,
    eligible_offers_by_task:eligibleOffersByTask,
    residual_capacity:[...residual.entries()].map(([offer_id,r])=>({offer_id,...r})),
    zero_cost_plan:zeroCost,
    private_data_never_expands_authority:true,
    cross_device_memory_aggregation:false,
    replica_failure_domain_separation:true,
    correlated_failure_domain_axes:true,
    performance_learning_applied:Boolean(performanceLedger),
    placement_stickiness_applied:Boolean(previousPlan),
    generated_at:new Date(nowMs).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
