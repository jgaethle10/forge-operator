import crypto from "node:crypto";
export function buildCanaryReceipt(input={}){
 const checks={
  node_count:Number(input.nodes?.length||0)>=2,
  distinct_failure_domains:new Set((input.nodes||[]).map(n=>n.failure_domain).filter(Boolean)).size>=2,
  udp53:(input.nodes||[]).every(n=>n.udp53===true),
  tcp53:(input.nodes||[]).every(n=>n.tcp53===true),
  parent_delegation:input.parent_delegation===true,
  aa:input.authoritative===true,
  no_recursion:input.recursion_available===false,
  signed_snapshot:input.snapshot_signature_verified===true,
  tls:input.tls?.trusted===true&&input.tls?.hostname_match===true,
  http_identity:input.http?.logical_uri==="evercraft://edge/canary",
  rollback:input.rollback_verified===true
 };
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 const body={schema:"evercraft.edge.canary-receipt.v1",state:failed.length?"hold":"passed",checks,failed,evidence:input.evidence||{},observed_at:new Date().toISOString()};
 return {...body,receipt_hash:"sha256:"+crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
