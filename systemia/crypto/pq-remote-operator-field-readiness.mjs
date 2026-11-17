/**
 * Read-only local field inventory for the existing Evercraft Remote Operator.
 * Does NOT enable agents, enroll devices, read environment secrets, print
 * broker origins, execute arbitrary commands, or issue network writes.
 * Loopback-only GET capability probe is safe even on shared host systems.
 * Neither local success nor a configured URL proves broker authorization.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const RECEIPT='local-organism-receipt.json';
const SEED='compute/nodeseed-receipt.json';
function safeJson(file) {
  try {
    const s=fs.lstatSync(file);
    if(!s.isFile()||s.isSymbolicLink()||s.size>128*1024) return null;
    return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch {return null;}
}
function connectedEnv(file) {
  try {
    const s=fs.lstatSync(file);
    if(!s.isFile()||s.isSymbolicLink()||s.size>32*1024) return false;
    const value=fs.readFileSync(file,'utf8');
    return /^EVERCRAFT_REMOTE_BROKER_URL=.+$/m.test(value);
  } catch {return false;}
}
function systemdActive() {
  try {
    return execFileSync('systemctl',['--user','is-active','evercraft-local-organism.service'],{
      encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']
    }).trim()==='active';
  } catch {return false;}
}
function loopback(url) {
  try {
    const v=new URL(url);
    return v.protocol==='http:'&&v.username===''&&v.password===''&&
      v.search===''&&v.hash===''&&
      ['127.0.0.1','localhost','[::1]'].includes(v.hostname);
  }catch{return false;}
}
export async function inspectPqOperatorField({
  home=os.homedir(),stateRoot=path.join(home,'.local/state/evercraft/organism'),
  fetchImpl=fetch,activeCheck=systemdActive
}={}) {
  const receipt=safeJson(path.join(stateRoot,RECEIPT));
  const seed=safeJson(path.join(stateRoot,SEED));
  const brokerConfigured=connectedEnv(path.join(home,'.config/evercraft/local-organism.env'));
  const enabled=receipt?.remote_operator?.enabled===true;
  const serviceActive=activeCheck()===true;
  const endpoint=seed?.endpoint;
  let loopbackCapabilityReady=false;
  if(loopback(endpoint)&&serviceActive&&typeof fetchImpl==='function') {
    try {
      const response=await fetchImpl(new URL('/v1/capacity',endpoint),{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(2500)
      });
      if(response.ok) {
        const cap=await response.json();
        loopbackCapabilityReady=cap?.capacity_hint?.services?.remote_operator?.ready===true;
      }
    }catch{}
  }
  return Object.freeze({
    schema:'systemia.crypto.pq-operator-field-readiness.lab.v1',
    hostname:os.hostname(),
    read_only:true,
    local_organism_receipt_present:Boolean(receipt),
    node_seed_receipt_present:Boolean(seed),
    local_organism_service_active:serviceActive,
    remote_operator_enabled_in_receipt:enabled,
    remote_broker_origin_configured:brokerConfigured,
    loopback_endpoint_verified:loopback(endpoint),
    local_remote_operator_capability_ready:loopbackCapabilityReady,
    outbound_agent_authenticated_at_broker:'not_verified',
    broker_control_grant_for_this_node:'not_verified',
    field_courier_transfer_performed:false,
    production_ready:false
  });
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const result=await inspectPqOperatorField();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
