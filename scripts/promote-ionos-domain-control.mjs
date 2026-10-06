#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?String(process.argv[i+1]):fallback;
}
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');

export function promoteDomainControl({receipt,edgeReceipt,registry,frontDoors,evidenceRef}){
  if(receipt?.schema!=='evercraft.ionos-domain-control-challenge.v1'||receipt.verified!==true||receipt.edge_eligible!==true){
    throw new Error('verified_ionos_domain_control_receipt_required');
  }
  if(edgeReceipt?.schema!=='evercraft.operator-public-edge-observation.v1'||edgeReceipt.verified!==true||edgeReceipt.public_https_verified!==true||edgeReceipt.mcp_verified!==true){
    throw new Error('verified_owned_fabric_edge_receipt_required');
  }
  const domain=String(receipt.domain||'').toLowerCase();
  const origin=new URL(edgeReceipt.origin);
  if(origin.protocol!=='https:'||!(origin.hostname===domain||origin.hostname.endsWith('.'+domain))){
    throw new Error('owned_edge_origin_domain_mismatch');
  }
  const row=(registry.domains||[]).find(x=>String(x.domain||'').toLowerCase()===domain);
  if(!row) throw new Error('domain_not_registered_in_control_ledger');
  row.delegation_control={
    state:'verified',
    provider:'IONOS',
    parent_ns:receipt.parent_ns||[],
    observed_at:receipt.observed_at,
    evidence_ref:evidenceRef,
  };
  row.mutation_challenge={
    state:'verified',
    name:receipt.challenge_name,
    token_unique:receipt.token_unique===true,
    verifier_count:(receipt.external_verifiers||[]).filter(x=>(x.values||[]).includes(receipt.challenge_value)).length,
    observed_at:receipt.observed_at,
    evidence_ref:evidenceRef,
  };
  row.edge_eligible=true;
  row.edge_eligible_observed_at=receipt.observed_at;

  let fabric=(frontDoors.services||[]).find(x=>x.service_id==='fabric');
  if(!fabric){
    fabric={service_id:'fabric',logical_uri:'evercraft://fabric',public_hosts:[]};
    frontDoors.services=[...(frontDoors.services||[]),fabric];
  }
  fabric.public_hosts=[...new Set([...(fabric.public_hosts||[]),origin.hostname])].sort();
  fabric.public_https_verified=true;
  fabric.mcp_verified=true;
  fabric.evidence_ref=String(edgeReceipt.source?.workflow_run_id||'')?
    'GitHubActionsRun:'+String(edgeReceipt.source.workflow_run_id):
    'conformance/runtime-observation';
  frontDoors.state='public_root_control_verified';
  frontDoors.last_verified_at=receipt.observed_at;
  return {registry,frontDoors};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const receiptPath=arg('--receipt');
  const edgePath=arg('--edge-receipt','conformance/runtime-observations/2026-10-06-evercraft-fabric-operator-edge.json');
  const registryPath=arg('--registry','infra/evercraft-edge/registry/domain-control.json');
  const frontDoorsPath=arg('--front-doors','infra/evercraft-edge/registry/front-doors.json');
  const out=arg('--out','artifacts/domain-control/promotion-receipt.json');
  if(!receiptPath) throw new Error('--receipt required');
  const receipt=read(receiptPath);
  const edgeReceipt=read(edgePath);
  const registry=read(registryPath);
  const frontDoors=read(frontDoorsPath);
  const evidenceRef='GitHubActionsRun:'+String(process.env.GITHUB_RUN_ID||'local');
  const promoted=promoteDomainControl({receipt,edgeReceipt,registry,frontDoors,evidenceRef});
  write(registryPath,promoted.registry);
  write(frontDoorsPath,promoted.frontDoors);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  write(out,{
    schema:'evercraft.domain-control-promotion.v1',
    promoted:true,
    domain:receipt.domain,
    public_host:new URL(edgeReceipt.origin).hostname,
    domain_control_evidence:evidenceRef,
    edge_evidence:edgePath,
    observed_at:new Date().toISOString(),
  });
}
