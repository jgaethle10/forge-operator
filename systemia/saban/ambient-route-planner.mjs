import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(v)=>[...new Set((v||[]).map(x=>String(x).trim()).filter(Boolean))];

function normalizeLink(input={}){
  const link={
    link_id:String(input.link_id||'').trim(),
    from:String(input.from||'').trim(),
    to:String(input.to||'').trim(),
    protocol:String(input.protocol||'').trim().toLowerCase(),
    access_class:String(input.access_class||'authorized_compute'),
    authorization_ref:input.authorization_ref?String(input.authorization_ref):null,
    read_only:input.read_only===true,
    attested:input.attested===true,
    zero_cost:input.zero_cost!==false,
    latency_ms:Math.max(0,Number(input.latency_ms||0)),
    bandwidth_mbps:Math.max(0,Number(input.bandwidth_mbps||0)),
    observed_at:input.observed_at||new Date().toISOString(),
    bidirectional:input.bidirectional===true,
  };
  if(!link.link_id||!link.from||!link.to||!link.protocol){
    throw new Error('ambient_route_link_identity_required');
  }
  return link;
}

function expandedLinks(links=[]){
  const out=[];
  for(const raw of links){
    const link=normalizeLink(raw);
    out.push(link);
    if(link.bidirectional){
      out.push({...link,link_id:link.link_id+':reverse',from:link.to,to:link.from,bidirectional:false});
    }
  }
  return out;
}

function authorizedFor(link,mode){
  if(mode==='observe'){
    if(link.access_class==='public_observation'||link.access_class==='open_protocol'){
      return link.read_only===true;
    }
  }
  return (
    ['authorized_compute','voluntary_compute'].includes(link.access_class) &&
    Boolean(link.authorization_ref)
  );
}

function edgeCost(link){
  const bandwidthPenalty=link.bandwidth_mbps>0
    ? Math.min(1000,1000/link.bandwidth_mbps)
    : 1000;
  const attestationPenalty=link.attested?0:50;
  return link.latency_ms+bandwidthPenalty+attestationPenalty+10;
}

function shortestRoute({source,target,links,mode,maxHops,minBandwidthMbps,allowedProtocols,excludedLinkIds=new Set()}){
  const adjacency=new Map();
  for(const link of links){
    if(excludedLinkIds.has(link.link_id))continue;
    if(!authorizedFor(link,mode))continue;
    if(allowedProtocols.size&&!allowedProtocols.has(link.protocol))continue;
    if(minBandwidthMbps>0&&link.bandwidth_mbps<minBandwidthMbps)continue;
    const arr=adjacency.get(link.from)||[];
    arr.push(link);
    adjacency.set(link.from,arr);
  }

  const queue=[{node:source,cost:0,hops:[],visited:new Set([source])}];
  let best=null;
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost||a.node.localeCompare(b.node));
    const current=queue.shift();
    if(current.node===target){
      best=current;
      break;
    }
    if(current.hops.length>=maxHops)continue;
    for(const link of adjacency.get(current.node)||[]){
      if(current.visited.has(link.to))continue;
      const visited=new Set(current.visited);
      visited.add(link.to);
      queue.push({
        node:link.to,
        cost:current.cost+edgeCost(link),
        hops:[...current.hops,link],
        visited,
      });
    }
  }
  return best;
}

function publicRoute(route){
  if(!route)return null;
  const hops=route.hops.map(link=>({
    link_id:link.link_id,
    from:link.from,
    to:link.to,
    protocol:link.protocol,
    access_class:link.access_class,
    read_only:link.read_only,
    attested:link.attested,
    zero_cost:link.zero_cost,
    latency_ms:link.latency_ms,
    bandwidth_mbps:link.bandwidth_mbps,
    authorization_present:Boolean(link.authorization_ref),
    authorization_value_exposed:false,
  }));
  return {
    hop_count:hops.length,
    cost:Number(route.cost.toFixed(6)),
    total_latency_ms:hops.reduce((n,h)=>n+h.latency_ms,0),
    bottleneck_bandwidth_mbps:hops.length
      ? Math.min(...hops.map(h=>h.bandwidth_mbps||0))
      : null,
    zero_cost:hops.every(h=>h.zero_cost===true),
    fully_attested:hops.every(h=>h.attested===true),
    hops,
  };
}

export function planAmbientRoute({
  source,
  target,
  links=[],
  mode='control',
  max_hops=5,
  min_bandwidth_mbps=0,
  allowed_protocols=[],
  require_fallback=false,
  require_attested=false,
}={}){
  const src=String(source||'').trim();
  const dst=String(target||'').trim();
  if(!src||!dst) throw new Error('ambient_route_source_and_target_required');
  if(!['observe','control','compute','private_data'].includes(mode)){
    throw new Error('ambient_route_mode_invalid');
  }

  const expanded=expandedLinks(links);
  const filtered=require_attested?expanded.filter(x=>x.attested===true):expanded;
  const allowed=new Set(uniq(allowed_protocols).map(x=>x.toLowerCase()));
  const primary=shortestRoute({
    source:src,target:dst,links:filtered,mode,
    maxHops:Math.max(1,Math.floor(Number(max_hops||5))),
    minBandwidthMbps:Math.max(0,Number(min_bandwidth_mbps||0)),
    allowedProtocols:allowed,
  });

  let fallback=null;
  if(primary){
    const primaryIds=new Set(primary.hops.map(x=>x.link_id.replace(/:reverse$/,'')));
    const excluded=new Set();
    for(const link of expanded){
      if(primaryIds.has(link.link_id.replace(/:reverse$/,''))) excluded.add(link.link_id);
    }
    fallback=shortestRoute({
      source:src,target:dst,links:filtered,mode,
      maxHops:Math.max(1,Math.floor(Number(max_hops||5))),
      minBandwidthMbps:Math.max(0,Number(min_bandwidth_mbps||0)),
      allowedProtocols:allowed,
      excludedLinkIds:excluded,
    });
  }

  const primaryPublic=publicRoute(primary);
  const fallbackPublic=publicRoute(fallback);
  const ready=Boolean(primaryPublic)&&(!require_fallback||Boolean(fallbackPublic));

  const body={
    schema:'evercraft.saban.ambient-route-plan.v1',
    source:src,
    target:dst,
    mode,
    state:ready?'ready':'held',
    primary:primaryPublic,
    fallback:fallbackPublic,
    fallback_required:require_fallback===true,
    all_control_hops_authorized:mode==='observe'||Boolean(primaryPublic),
    credentials_embedded:false,
    visibility_is_not_authorization:true,
    cross_hop_authority_never_inferred:true,
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
