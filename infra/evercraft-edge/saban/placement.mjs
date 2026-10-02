import crypto from "node:crypto";

export function selectDnsNodes(nodes,{replicas=2}={}){
  const eligible=(nodes||[]).filter(n=>{
    const labels=new Set((n.placement_labels||[]).map(x=>String(x).toLowerCase()));
    const workloads=new Set((n.supported_workloads||[]).map(String));
    return n.authorized===true &&
      n.connected===true &&
      n.attestation?.verified===true &&
      labels.has("public-ingress") &&
      n.zero_cost===true &&
      n.public_ingress===true &&
      n.udp53===true &&
      n.tcp53===true &&
      workloads.has("systemia.evercraft-edge-dns.v1");
  });
  const selected=[];
  const domains=new Set();
  for(const node of eligible){
    const domain=String(node.failure_domain||node.network_provider||"");
    if(!domain||domains.has(domain)) continue;
    selected.push(node); domains.add(domain);
    if(selected.length===replicas) break;
  }
  return {
    ready:selected.length===replicas,
    required:replicas,
    selected:selected.map(n=>({node_id:n.node_id,endpoint:n.endpoint,failure_domain:n.failure_domain||n.network_provider||null})),
    reason:selected.length===replicas?null:"insufficient_distinct_attested_zero_cost_public_nodes"
  };
}

export function placementReceipt(result){
  const body={schema:"evercraft.edge.dns-placement-receipt.v1",...result};
  return {...body,receipt_hash:"sha256:"+crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
