export function evaluateEdgeCapacity(nodes=[]){
 const rejected=[];
 const eligible=[];
 for(const node of nodes){
  const labels=new Set((node.placement_labels||node.capacity?.placement_labels||[]).map(x=>String(x).toLowerCase()));
  const workload=new Set((node.supported_workloads||node.capacity?.supported_workloads||[]).map(String));
  let reason=null;
  if(node.authorized!==true) reason="not_authorized";
  else if(node.connected!==true) reason="not_connected";
  else if(node.attestation_verified!==true && node.attestation?.verified!==true) reason="attestation_missing";
  else if(!labels.has("public-ingress")) reason="public_ingress_label_missing";
  else if(node.zero_cost!==true) reason="not_zero_cost";
  else if(node.udp53!==true || node.tcp53!==true) reason="dns_ports_unproven";
  else if(workload.size && !workload.has("systemia.evercraft-edge-dns.v1")) reason="workload_unsupported";
  if(reason) rejected.push({node_id:node.node_id||null,reason});
  else eligible.push(node);
 }
 const selected=[]; const domains=new Set();
 for(const node of eligible){
  const d=String(node.failure_domain||node.capacity?.failure_domain||node.network_provider||"");
  if(!d||domains.has(d)) continue;
  selected.push(node); domains.add(d);
  if(selected.length===2) break;
 }
 return {
  schema:"evercraft.edge.capacity-admission.v1",
  state:selected.length===2?"ready":"capacity_needed",
  selected:selected.map(n=>({node_id:n.node_id,endpoint:n.endpoint||n.capacity_endpoint||null,failure_domain:n.failure_domain||n.capacity?.failure_domain||n.network_provider||null})),
  rejected,
  missing_count:Math.max(0,2-selected.length)
 };
}
