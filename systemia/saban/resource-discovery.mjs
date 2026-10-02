import { randomBytes } from 'node:crypto';
import { discoverEligibleCapacity } from '../yard/capacity-resolver.mjs';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';

async function requestJson(url,{method='GET',headers={},body=null}={},timeoutMs=1500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(100,Number(timeoutMs||1500)));
  try{
    const response=await fetch(url,{
      method,
      signal:controller.signal,
      headers:{'content-type':'application/json',...headers},
      body:body==null?undefined:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(`${response.status}:${payload.error||'request_failed'}`);
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

function authorityFor(row,{allocatorToken='',allocatorTokens={}}={}){
  return String(
    allocatorTokens?.[row.node_id]||
    allocatorTokens?.[row.endpoint]||
    allocatorToken||
    ''
  );
}

function normalizeModels(values){
  return [...new Set((values||[])
    .map((value)=>String(value||'').trim().toLowerCase())
    .filter(Boolean)
  )];
}

export async function discoverResourceFieldCandidates({
  need,
  discovery={},
  allocatorToken='',
  allocatorTokens={},
  timeoutMs=1500,
}={}){
  if(!need?.workload_class) throw new Error('resource_discovery_workload_class_required');

  const resolution=await discoverEligibleCapacity({
    workloadClass:need.workload_class,
    requiredPlacementLabels:need.required_labels||[],
    requireAttestation:true,
    discovery,
    endpointTimeoutMs:timeoutMs,
  });

  const candidates=[];
  const rejected=[];
  const runtimeAuthorities=new Map();

  for(const row of resolution.candidates||[]){
    if(row.eligible!==true){
      rejected.push({
        node_id:row.node_id||null,
        endpoint:row.endpoint||null,
        reason:row.reason||'capacity_ineligible',
      });
      continue;
    }

    const token=authorityFor(row,{allocatorToken,allocatorTokens});
    if(!token){
      rejected.push({
        node_id:row.node_id,
        endpoint:row.endpoint,
        reason:'allocator_authority_missing',
      });
      continue;
    }

    try{
      const capacity=await requestJson(`${row.endpoint}/v1/capacity`,{},timeoutMs);
      const nonce=randomBytes(24).toString('hex');
      const issued=await requestJson(
        `${row.endpoint}/v1/attest`,
        {
          method:'POST',
          headers:{authorization:`Bearer ${token}`},
          body:{nonce},
        },
        timeoutMs
      );
      const verified=verifyNodeAttestation({
        attestation:issued.attestation,
        expectedNonce:nonce,
        expectedNodeId:row.node_id,
      });
      if(!verified.ok){
        rejected.push({
          node_id:row.node_id,
          endpoint:row.endpoint,
          reason:`attestation_failed:${verified.reason}`,
        });
        continue;
      }

      const signedLabels=(verified.placement_labels||[])
        .map((value)=>String(value).trim().toLowerCase())
        .sort();
      const liveLabels=(capacity.placement_labels||[])
        .map((value)=>String(value).trim().toLowerCase())
        .sort();
      if(JSON.stringify(signedLabels)!==JSON.stringify(liveLabels)){
        rejected.push({
          node_id:row.node_id,
          endpoint:row.endpoint,
          reason:'placement_label_attestation_mismatch',
        });
        continue;
      }

      const hint=capacity.capacity_hint||{};
      const candidate={
        candidate_id:String(row.node_id),
        source_kind:'enrolled_peer',
        authority:'explicit_grant',
        connected:true,
        attested:true,
        spawn_capable:false,
        resources:{
          cpu_units:Number(hint.cpu_units||0),
          memory_mb:Number(hint.memory_mb||0),
          storage_gb:Number(hint.storage_gb||0),
          gpu_units:Number(hint.gpu_units||hint.gpu_count||0),
          vram_mb:Number(hint.vram_mb||0),
          gpu_models:normalizeModels(hint.gpu_models),
        },
        workloads:Array.isArray(capacity.supported_workloads)
          ? capacity.supported_workloads.map(String)
          : [],
        labels:liveLabels,
        transports:['evercraft.capacity.v1'],
        ready_seconds:0,
        hourly_usd:capacity.zero_cost===true?0:0,
        acquisition_usd:0,
        failure_domain:String(capacity.failure_domain||row.node_id),
        metadata:{
          capacity_endpoint:String(row.endpoint),
          runtime:String(capacity.runtime||'Evercraft Compute'),
          platform:String(capacity.platform||''),
          device_fingerprint:String(verified.device_fingerprint||''),
          discovery_receipt:resolution.receipt_hash,
          authority_basis:'allocator_token_plus_device_attestation',
          zero_cost:capacity.zero_cost===true,
        },
      };
      candidates.push(candidate);
      runtimeAuthorities.set(candidate.candidate_id,{
        capacity_endpoint:String(row.endpoint),
        allocator_token:token,
      });
    }catch(error){
      rejected.push({
        node_id:row.node_id,
        endpoint:row.endpoint,
        reason:String(error?.message||error),
      });
    }
  }

  return {
    schema:'evercraft.saban.resource-discovery.v1',
    candidates,
    rejected,
    runtime_authorities:runtimeAuthorities,
    discovered_count:Number(resolution.discovered_count||0),
    yard_eligible_count:Number(resolution.eligible_count||0),
    attested_authorized_count:candidates.length,
    resolution_receipt:resolution.receipt_hash,
    observed_at:new Date().toISOString(),
  };
}
