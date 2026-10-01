import crypto from "node:crypto";

export function evaluateDomainControl({domain,registrarEvidence,dnsObservation,challenge}={}){
 const checks={
  domain_known:typeof domain==="string"&&domain.includes("."),
  registrar_evidence:["verified_receipt","verified_api","verified_account"].includes(registrarEvidence?.state),
  parent_delegation_observed:Array.isArray(dnsObservation?.parent_ns)&&dnsObservation.parent_ns.length>=2,
  authoritative_ns_reachable:dnsObservation?.authoritative_reachable===true,
  mutation_challenge:challenge?.verified===true,
  challenge_unique:challenge?.token_unique===true
 };
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 const body={schema:"evercraft.edge.domain-control-receipt.v1",domain,state:failed.length?"unverified":"verified",edge_eligible:failed.length===0,checks,failed,observed_at:new Date().toISOString()};
 return {...body,receipt_hash:"sha256:"+crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
export function makeChallenge(domain,nonce){
 if(!/^[a-z0-9.-]+$/i.test(domain||""))throw new Error("invalid domain");
 if(!/^[a-z0-9_-]{12,128}$/i.test(nonce||""))throw new Error("invalid nonce");
 return {type:"TXT",name:"_evercraft-control."+domain,value:"evercraft-domain-control="+nonce,ttl:60};
}
