export function evaluatePromotion({placement,snapshot,canary}={}){
 const checks={
  redundant_distinct_nodes:placement?.ready===true&&Number(placement?.selected?.length)>=2,
  signed_snapshot:snapshot?.signature_verified===true,
  snapshot_consistent:snapshot?.replicas_consistent===true,
  udp_tcp_53:canary?.udp===true&&canary?.tcp===true,
  authoritative_answer:canary?.aa===true,
  recursion_disabled:canary?.ra===false,
  trusted_delegation:canary?.delegation===true
 };
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 return {state:failed.length?"hold":"promotable",checks,failed};
}
