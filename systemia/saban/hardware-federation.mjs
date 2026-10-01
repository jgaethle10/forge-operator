import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(values)=>[...new Set((values||[]).map((v)=>String(v).trim()).filter(Boolean))];

function resourceHint(node){
  const hint=node?.capacity?.capacity_hint||{};
  return {
    cpu_units:Math.max(0,Number(hint.cpu_units||0)),
    memory_mb:Math.max(0,Number(hint.memory_mb||0)),
    storage_gb:Math.max(0,Number(hint.storage_gb||0)),
  };
}

function labels(node){
  return new Set((node?.capacity?.placement_labels||[])
    .map((v)=>String(v).trim().toLowerCase())
    .filter(Boolean));
}

function workloads(node){
  return new Set((node?.capacity?.supported_workloads||[]).map(String));
}

function serviceReady(node,key){
  const value=node?.capacity?.capacity_hint?.services?.[key];
  return value===true||value?.ready===true;
}

export function normalizeFederationRole(input={}){
  const body={
    role_id:String(input.role_id||'').trim(),
    required_workloads:uniq(input.required_workloads),
    required_labels:uniq(input.required_labels).map((v)=>v.toLowerCase()),
    forbidden_labels:uniq(input.forbidden_labels).map((v)=>v.toLowerCase()),
    required_services:uniq(input.required_services),
    resources:{
      cpu_units:Math.max(0,Number(input.resources?.cpu_units||0)),
      memory_mb:Math.max(0,Number(input.resources?.memory_mb||0)),
      storage_gb:Math.max(0,Number(input.resources?.storage_gb||0)),
    },
    require_attestation:input.require_attestation!==false,
    public_ingress_required:input.public_ingress_required===true,
    preferred_node_ids:uniq(input.preferred_node_ids),
  };
  if(!body.role_id) throw new Error('federation_role_id_required');
  return body;
}

export function evaluateNodeForFederationRole(node,roleInput){
  const role=roleInput?.role_id?normalizeFederationRole(roleInput):normalizeFederationRole(roleInput||{});
  const reasons=[];
  const capacity=node?.capacity||{};
  const nodeLabels=labels(node);
  const nodeWorkloads=workloads(node);
  const hint=resourceHint(node);

  if(node?.connected!==true) reasons.push('node_not_connected');
  if(capacity.protocol!=='evercraft.capacity.v1') reasons.push('capacity_protocol_mismatch');
  if(capacity.runtime!=='Evercraft Compute') reasons.push('runtime_mismatch');
  if(role.require_attestation&&capacity.attestation_supported!==true) reasons.push('attestation_not_supported');
  if(role.require_attestation&&String(capacity.device_fingerprint||'')!==String(node?.device_fingerprint||'')){
    reasons.push('device_fingerprint_mismatch');
  }
  if(role.required_workloads.some((key)=>!nodeWorkloads.has(key))) reasons.push('workload_unsupported');
  if(role.required_labels.some((key)=>!nodeLabels.has(key))) reasons.push('required_label_missing');
  if(role.forbidden_labels.some((key)=>nodeLabels.has(key))) reasons.push('forbidden_label_present');
  if(role.required_services.some((key)=>!serviceReady(node,key))) reasons.push('service_capability_not_ready');
  if(role.public_ingress_required){
    const edge=capacity.capacity_hint?.services?.public_edge;
    if(!(edge?.ready===true&&edge?.public_https===true)) reasons.push('public_https_required');
  }
  if(hint.cpu_units<role.resources.cpu_units) reasons.push('insufficient_cpu');
  if(hint.memory_mb<role.resources.memory_mb) reasons.push('insufficient_memory');
  if(hint.storage_gb<role.resources.storage_gb) reasons.push('insufficient_storage');

  const preferred=role.preferred_node_ids.includes(String(node?.node_id||''));
  const freshness=Date.parse(String(node?.last_seen_at||''))||0;
  const slack=
    Math.max(0,hint.cpu_units-role.resources.cpu_units)*1000+
    Math.max(0,hint.memory_mb-role.resources.memory_mb)+
    Math.max(0,hint.storage_gb-role.resources.storage_gb)*25;

  return {
    eligible:reasons.length===0,
    reasons,
    preferred,
    freshness,
    slack,
    node_id:String(node?.node_id||''),
    device_fingerprint:String(node?.device_fingerprint||''),
    resources:hint,
    role,
  };
}

function allocationKey(plan){
  return [...plan.entries()]
    .map(([roleId,nodeId])=>`${roleId}:${nodeId}`)
    .sort()
    .join('|');
}

export function planHardwareFederation({
  federation_id='evercraft-hardware-federation',
  nodes=[],
  roles=[],
  prefer_fewer_nodes=true,
}={}){
  const normalizedRoles=(roles||[]).map(normalizeFederationRole);
  const uniqueRoleIds=new Set(normalizedRoles.map((r)=>r.role_id));
  if(uniqueRoleIds.size!==normalizedRoles.length) throw new Error('duplicate_federation_role_id');

  const normalizedNodes=(nodes||[])
    .filter((node)=>node&&typeof node==='object')
    .map((node)=>({
      ...node,
      node_id:String(node.node_id||''),
      device_fingerprint:String(node.device_fingerprint||''),
    }));

  const candidates=new Map();
  const rejectedByRole={};
  for(const role of normalizedRoles){
    const evaluated=normalizedNodes.map((node)=>evaluateNodeForFederationRole(node,role));
    candidates.set(role.role_id,evaluated.filter((x)=>x.eligible));
    rejectedByRole[role.role_id]=evaluated
      .filter((x)=>!x.eligible)
      .map((x)=>({
        node_id:x.node_id,
        device_fingerprint:x.device_fingerprint,
        reasons:x.reasons,
      }));
  }

  const constrained=[...normalizedRoles].sort((a,b)=>{
    const ac=candidates.get(a.role_id)?.length||0;
    const bc=candidates.get(b.role_id)?.length||0;
    return ac-bc||b.resources.memory_mb-a.resources.memory_mb||a.role_id.localeCompare(b.role_id);
  });

  const initialResidual=new Map(normalizedNodes.map((node)=>[
    node.node_id,
    resourceHint(node),
  ]));

  let best=null;
  const assignment=new Map();

  function scoreCurrent(){
    const used=[...new Set(assignment.values())];
    let preference=0;
    let freshness=0;
    let slack=0;
    for(const role of normalizedRoles){
      const nodeId=assignment.get(role.role_id);
      const candidate=(candidates.get(role.role_id)||[]).find((x)=>x.node_id===nodeId);
      if(candidate?.preferred) preference+=1;
      freshness+=candidate?.freshness||0;
      slack+=candidate?.slack||0;
    }
    return {
      used_nodes:used.length,
      preference,
      freshness,
      slack,
      key:allocationKey(assignment),
    };
  }

  function better(a,b){
    if(!b) return true;
    if(prefer_fewer_nodes&&a.used_nodes!==b.used_nodes) return a.used_nodes<b.used_nodes;
    if(a.preference!==b.preference) return a.preference>b.preference;
    if(a.freshness!==b.freshness) return a.freshness>b.freshness;
    if(a.slack!==b.slack) return a.slack>b.slack;
    return a.key<b.key;
  }

  function search(index,residual){
    if(index>=constrained.length){
      const score=scoreCurrent();
      if(better(score,best?.score)){
        best={
          score,
          assignment:new Map(assignment),
          residual:new Map([...residual.entries()].map(([k,v])=>[k,{...v}])),
        };
      }
      return;
    }

    const role=constrained[index];
    const roleCandidates=[...(candidates.get(role.role_id)||[])].sort((a,b)=>
      Number(b.preferred)-Number(a.preferred) ||
      b.freshness-a.freshness ||
      a.slack-b.slack ||
      a.node_id.localeCompare(b.node_id)
    );

    for(const candidate of roleCandidates){
      const remaining=residual.get(candidate.node_id);
      if(!remaining) continue;
      if(remaining.cpu_units<role.resources.cpu_units) continue;
      if(remaining.memory_mb<role.resources.memory_mb) continue;
      if(remaining.storage_gb<role.resources.storage_gb) continue;

      const next=new Map(residual);
      next.set(candidate.node_id,{
        cpu_units:remaining.cpu_units-role.resources.cpu_units,
        memory_mb:remaining.memory_mb-role.resources.memory_mb,
        storage_gb:remaining.storage_gb-role.resources.storage_gb,
      });
      assignment.set(role.role_id,candidate.node_id);
      search(index+1,next);
      assignment.delete(role.role_id);
    }
  }

  if(constrained.every((role)=>(candidates.get(role.role_id)||[]).length>0)){
    search(0,initialResidual);
  }

  const assignedRoles=[];
  const selectedNodeIds=new Set();
  if(best){
    for(const role of normalizedRoles){
      const nodeId=best.assignment.get(role.role_id);
      const node=normalizedNodes.find((n)=>n.node_id===nodeId);
      selectedNodeIds.add(nodeId);
      assignedRoles.push({
        role_id:role.role_id,
        node_id:nodeId,
        device_fingerprint:String(node?.device_fingerprint||''),
        requirements:role,
      });
    }
  }

  const impossibleRoles=normalizedRoles
    .filter((role)=>(candidates.get(role.role_id)||[]).length===0)
    .map((role)=>role.role_id);

  const body={
    schema:'evercraft.saban.hardware-federation-plan.v1',
    federation_id:String(federation_id||'evercraft-hardware-federation'),
    state:best?'ready':'held',
    topology:best
      ? (selectedNodeIds.size===1?'single_node':'federated')
      : 'unresolved',
    role_count:normalizedRoles.length,
    selected_node_count:selectedNodeIds.size,
    assignments:assignedRoles,
    impossible_roles:impossibleRoles,
    rejected_by_role:rejectedByRole,
    resources_are_role_local:true,
    cross_node_memory_aggregation:false,
    visible_device_implies_authorization:false,
    generated_at:new Date().toISOString(),
  };

  return {...body,receipt_hash:sha(body)};
}

export function evercraftEdgeFederationRoles({
  controlRoomMemoryMb=3072,
  controlRoomCpuUnits=2,
}={}){
  return [
    {
      role_id:'public_ingress',
      required_workloads:['systemia.public-edge.v1'],
      required_labels:['public-edge','gateway'],
      forbidden_labels:['outbound-only','private'],
      required_services:['public_edge'],
      public_ingress_required:true,
      require_attestation:true,
      resources:{cpu_units:0.5,memory_mb:512,storage_gb:1},
    },
    {
      role_id:'fabric',
      required_workloads:['systemia.specialist-handoff-mcp.v1'],
      require_attestation:true,
      resources:{cpu_units:0.5,memory_mb:512,storage_gb:1},
    },
    {
      role_id:'control_room',
      required_workloads:['systemia.evercraft-web-browser.v1'],
      required_services:['evercraft_web_browser'],
      require_attestation:true,
      resources:{
        cpu_units:Math.max(1,Number(controlRoomCpuUnits||2)),
        memory_mb:Math.max(1024,Number(controlRoomMemoryMb||3072)),
        storage_gb:2,
      },
    },
  ];
}
