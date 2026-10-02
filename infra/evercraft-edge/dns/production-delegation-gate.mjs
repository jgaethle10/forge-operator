#!/usr/bin/env node
import fs from 'node:fs';
import {selectDnsNodes} from '../saban/placement.mjs';

export function evaluateProductionDelegation({
  nodes=[],
  tcpAuthorityProofs={},
  domainControl=null
}={}){
  const placement=selectDnsNodes(nodes,{replicas:2});
  const selected=placement.selected||[];
  const tcpProofRows=selected.map(row=>{
    const proof=tcpAuthorityProofs?.[row.node_id]||null;
    return {
      node_id:row.node_id,
      verified:proof?.verified===true &&
        proof?.transport==='tcp53' &&
        proof?.parsed?.aa===true &&
        proof?.parsed?.ra===false &&
        proof?.parsed?.noerror===true &&
        proof?.parsed?.has_expected_txt===true
    };
  });
  const domainReady=
    domainControl?.delegation_control?.state==='verified' &&
    domainControl?.mutation_challenge?.state==='verified' &&
    domainControl?.edge_eligible===true;

  const ready=
    placement.ready===true &&
    selected.length===2 &&
    tcpProofRows.length===2 &&
    tcpProofRows.every(x=>x.verified) &&
    domainReady;

  const blockers=[];
  if(placement.ready!==true) blockers.push('two_distinct_live_attested_zero_cost_public_dns_nodes_required');
  for(const row of tcpProofRows){
    if(!row.verified) blockers.push('direct_tcp53_authority_proof_missing:'+row.node_id);
  }
  if(domainControl?.delegation_control?.state!=='verified') blockers.push('delegation_control_unverified');
  if(domainControl?.mutation_challenge?.state!=='verified') blockers.push('fresh_dns_mutation_challenge_unverified');
  if(domainControl?.edge_eligible!==true) blockers.push('domain_not_edge_eligible');

  return {
    schema:'evercraft.edge.production-delegation-gate.v1',
    ready,
    selected_nodes:selected,
    direct_tcp53_authority:tcpProofRows,
    domain_control_ready:domainReady,
    blockers:[...new Set(blockers)],
    policy:{
      two_distinct_failure_domains_required:true,
      direct_external_dns_over_tcp_required:true,
      udp53_required:true,
      attestation_required:true,
      current_authorization_required:true,
      zero_cost_bootstrap_policy:true,
      fresh_domain_control_mutation_required:true
    }
  };
}

if(process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href){
  const input=process.argv[2];
  if(!input) throw new Error('usage: production-delegation-gate.mjs <input.json>');
  const body=JSON.parse(fs.readFileSync(input,'utf8'));
  const result=evaluateProductionDelegation(body);
  console.log(JSON.stringify(result,null,2));
  if(!result.ready) process.exitCode=2;
}
