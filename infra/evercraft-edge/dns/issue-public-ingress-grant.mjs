#!/usr/bin/env node

function arg(name){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:'';
}
const requestId=arg('--request-id');
const nodeId=arg('--node-id');
const canaryName=arg('--canary-name');
const evidenceRef=arg('--evidence-ref');
const udp=arg('--udp')==='pass';
const tcp=arg('--tcp')==='pass';

if(!/^[a-f0-9]{32}$/.test(requestId)) throw new Error('request_id_invalid');
if(!/^[a-zA-Z0-9._:-]{1,128}$/.test(nodeId)) throw new Error('node_id_invalid');
if(!/^[a-zA-Z0-9._-]+\.$/.test(canaryName)) throw new Error('canary_name_invalid');
if(!evidenceRef) throw new Error('evidence_ref_required');
if(!udp||!tcp) throw new Error('both_udp_and_tcp_external_proofs_required');

const grant={
  schema:'evercraft.edge.public-ingress-grant.v1',
  request_id:requestId,
  node_id:nodeId,
  canary_name:canaryName,
  verified:true,
  udp_53_verified:true,
  tcp_53_verified:true,
  authoritative_required:true,
  recursion_available_required:false,
  evidence_ref:evidenceRef,
  public_ip_recorded:false,
  verified_at:new Date().toISOString()
};
process.stdout.write(JSON.stringify(grant,null,2)+'\n');
