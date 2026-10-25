#!/usr/bin/env node
// Read-only readiness evidence for NextGen WSL. No remote execution, enrollment
// or root privilege is conferred by this tool.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function readSmall(file) {
  try {
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.size > 65536) return null;
    return fs.readFileSync(file,'utf8');
  } catch { return null; }
}
function readJson(file) {
  const body=readSmall(file);
  if (!body) return null;
  try {
    const result=JSON.parse(body);
    return result && typeof result==='object'&&!Array.isArray(result)?result:null;
  } catch {return null;}
}
function privateBrokerConfigured(home,envUrl='') {
  const entries=(readSmall(path.join(home,'.config/evercraft/local-organism.env'))||'').split(/\r?\n/);
  const line=entries.filter(x=>x.startsWith('EVERCRAFT_REMOTE_BROKER_URL=')).at(-1);
  const v=String(envUrl||(line?line.slice('EVERCRAFT_REMOTE_BROKER_URL='.length):'')).trim().replace(/^['"]|['"]$/g,'');
  try {
    const u=new URL(v);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;
  } catch {return false;}
}
// A local startup receipt is historical evidence, not a live process check
// or authenticated Yard/Remote Operator grant. Require the correct identity,
 // matching NodeSeed, loopback transport and no public ingress.
export function consistentNextGenLocalReceipts(local, seed) {
  if (local?.schema !== 'evercraft.local-organism-receipt.v1' ||
      seed?.schema !== 'evercraft.compute.nodeseed-receipt.v1' ||
      local?.node_id !== 'evercraft-node002-nextgen' ||
      seed?.node_id !== local.node_id ||
      local?.device_fingerprint !== seed.device_fingerprint ||
      !/^sha256:[a-f0-9]{64}$/i.test(String(seed.device_fingerprint || '')) ||
      local?.public_ingress !== false ||
      local?.node_endpoint_scope !== 'loopback_only' ||
      seed?.beacon !== null) return false;
  try {
    const endpoint = new URL(String(seed.endpoint || ''));
    return endpoint.protocol === 'http:' &&
      endpoint.hostname === '127.0.0.1' &&
      !endpoint.username && !endpoint.password &&
      !endpoint.search && !endpoint.hash;
  } catch { return false; }
}

export function nextGenPrerequisiteStatus(report) {
  const local = report.is_linux_wsl &&
    report.node_22_or_newer && report.systemd_user_available;
  return {
    local_prerequisites_passed: Boolean(local),
    local_foundation_receipts_consistent: Boolean(local && report.local_foundation_receipts_consistent),
    // There is no locally self-certifying remote readiness. A separate
    // authenticated broker/Yard and live MCP status are mandatory.
    live_remote_control_verified: Boolean(report.trusted_mcp_control_session_verified &&
      report.remote_device_trust_observed && report.verified_broker_origin_configured &&
      report.remote_operator_locally_enabled),
  };
}

export function inspectNextGen({
  home=os.homedir(),platform=process.platform,release=os.release(),
  nodeVersion=process.versions.node,userSystemd=null,
  brokerUrl=process.env.EVERCRAFT_REMOTE_BROKER_URL||''
}={}) {
  const major=Number(String(nodeVersion).split('.')[0])||0;
  const state=path.join(home,'.local/state/evercraft/organism');
  const local=readJson(path.join(state,'local-organism-receipt.json'));
  const seed=readJson(path.join(state,'compute/nodeseed-receipt.json'));
  let systemd=userSystemd;
  if(systemd===null){
    try{execFileSync('systemctl',['--user','show-environment'],{stdio:'ignore',timeout:2500});systemd=true;}
    catch{systemd=false;}
  }
  const report={
    schema:'evercraft.nextgen.remote-admission-doctor.v1',
    target:'NextGen_WSL2',
    observation_source:'local_read_only_filesystem',
    is_linux_wsl:platform==='linux'&&/microsoft|wsl/i.test(release),
    node_22_or_newer:major>=22,
    systemd_user_available:Boolean(systemd),
    // A syntactically valid HTTPS URL is NOT an independently verified
    // broker deployment, TLS identity, or Yard trust grant.
    private_https_broker_url_configured:privateBrokerConfigured(home,brokerUrl),
    verified_broker_origin_configured:false,
    node002_shadow_agent_present:fs.existsSync(path.join(home,'.local/share/evercraft/node002-agent/app/node002-agent.mjs')),
    node_seed_receipt_present:Boolean(seed?.node_id&&seed?.endpoint),
    local_organism_receipt_present:Boolean(local?.node_id&&local?.schema),
    local_foundation_receipts_consistent:consistentNextGenLocalReceipts(local,seed),
    // These files can be stale. This doctor does NOT assert service liveness.
    local_live_process_health_verified:false,
    remote_operator_locally_enabled:local?.remote_operator?.enabled===true&&
      Array.isArray(local.remote_operator.root_keys)&&local.remote_operator.root_keys.includes('home'),
    remote_admission_startup_claim:local?.remote_admission?.state==='connected'?
      'connected_at_startup_unverified_currently':'not_observed_connected',
    remote_device_trust_observed:false,
    trusted_mcp_control_session_verified:false,
    ready_for_remote_install:false,
    deployment_performed:false,
    owner_permission_minted:false,
    unrestricted_shell_enabled:false
  };
  Object.assign(report,nextGenPrerequisiteStatus(report));
  report.next_action=!report.is_linux_wsl?'run_this_preflight_inside_nextgen_wsl':
    !report.node_22_or_newer?'install_node_22_plus_on_nextgen_wsl':
    !report.systemd_user_available?'enable_or_repair_user_systemd_in_wsl':
    !report.local_foundation_receipts_consistent?'inspect_or_stage_local_organism_under_owner_authorization':
    !report.private_https_broker_url_configured?'configure_verified_evercraft_broker_origin_privately':
    !report.verified_broker_origin_configured?'verify_broker_origin_and_yard_provenance_out_of_band':
    !report.remote_operator_locally_enabled?'owner_authorized_local_enablement_required':
    'yard_exact_device_approval_and_live_mcp_proof_required';
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=inspectNextGen();
  console.log(JSON.stringify(report,null,2));
  // Machine-local checks must not require externally verified broker trust.
  // Keep those separate, impossible-to-self-attest phases fail-closed.
  if(process.argv.includes('--require-local-prerequisites')&&
     !report.local_prerequisites_passed)process.exitCode=2;
  if(process.argv.includes('--require-local-foundation')&&
     !report.local_foundation_receipts_consistent)process.exitCode=2;
  if(process.argv.includes('--require-live-remote-readiness')&&
     !report.live_remote_control_verified)process.exitCode=2;
}
