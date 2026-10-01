#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { submitOutboundEnrollmentRequest } from '../network/outbound-node-agent.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function has(name){return process.argv.includes(name);}
function readJson(file){
  try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}catch{return null;}
}
function readEnv(file){
  const out={};
  if(!fs.existsSync(file)) return out;
  for(const raw of fs.readFileSync(file,'utf8').split('\n')){
    const line=raw.trim();
    if(!line||line.startsWith('#')) continue;
    const i=line.indexOf('=');
    if(i>0) out[line.slice(0,i)]=line.slice(i+1);
  }
  return out;
}
function setEnvValue(file,key,value){
  const k=String(key||'').trim();
  const v=String(value||'').trim();
  if(!/^[A-Z][A-Z0-9_]{1,127}$/.test(k)) throw new Error('env_key_invalid');
  if(!v||/[\r\n]/.test(v)) throw new Error('env_value_invalid');
  const lines=fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/):[];
  const next=lines.filter(line=>line&&!line.startsWith(k+'='));
  next.push(k+'='+v);
  const tmp=file+'.'+process.pid+'.tmp';
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  fs.writeFileSync(tmp,next.join('\n')+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function validateBrokerUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const url=new URL(raw);
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(loopback&&url.protocol==='http:')) throw new Error('remote_broker_requires_https_or_loopback_proof');
  return url.toString().replace(/\/$/,'');
}
function bootHash(){
  try{
    const value=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
    return value?sha(value):null;
  }catch{return null;}
}
function commandJson(command,args,{env=process.env}={}){
  const run=spawnSync(command,args,{encoding:'utf8',env,maxBuffer:4*1024*1024});
  let body=null;
  try{body=JSON.parse(String(run.stdout||'').trim());}catch{}
  return {
    ok:run.status===0,
    status:run.status,
    stdout:String(run.stdout||''),
    stderr:String(run.stderr||''),
    body,
  };
}
function fileState(root){
  return {
    preflight:readJson(path.join(root,'node001-preflight.json')),
    install:readJson(path.join(root,'install-receipt.json')),
    node:readJson(path.join(root,'nodeseed-receipt.json')),
    offline:readJson(path.join(root,'offline-receipt.json')),
    field:readJson(path.join(root,'field-evidence-candidate.json')),
    public_edge:readJson(path.join(root,'public-edge-admission-receipt.json')),
  };
}
function observedPublicEdge(edge){
  return Boolean(
    edge?.ready_for_public_edge_enrollment===true &&
    edge?.runtime_advertisement_verified===true &&
    edge?.public_edge_configuration_valid===true
  );
}

export function evaluateBootstrap({
  files={},
  currentBootHash=null,
  brokerUrl='',
  physicalConfirmed=false,
  nodeRole='public_edge',
}={}){
  const role=String(nodeRole||'public_edge').trim();
  if(!['public_edge','private_worker','virtual_worker'].includes(role)){
    throw new Error('node_role_invalid');
  }
  const checks={
    preflight_passed:files.preflight?.passed===true,
    field_eligible:files.preflight?.field_eligible===true || (files.preflight?.field_eligible===undefined && files.preflight?.passed===true),
    compute_worker_eligible:files.preflight?.compute_worker_eligible===true || (files.preflight?.compute_worker_eligible===undefined && files.preflight?.passed===true),
    installed:Boolean(files.install),
    node_receipt:Boolean(files.node?.device_fingerprint&&files.node?.node_id),
    rebooted_after_install:Boolean(
      files.install?.install_boot_id_hash &&
      currentBootHash &&
      files.install.install_boot_id_hash!==currentBootHash
    ),
    offline_verified:files.offline?.verified===true,
    field_certified:files.field?.ready_for_yard_enrollment===true,
    physical_confirmed:physicalConfirmed===true,
    public_edge_admitted:observedPublicEdge(files.public_edge),
    remote_broker_configured:Boolean(String(brokerUrl||'').trim()),
    outbound_admission_service_installed:files.install?.remote_admission_service==='evercraft-remote-admission.service',
  };

  let state='ready_for_systemia_admission';
  let next_action='none';
  let human_action_required=false;
  let reason=role==='virtual_worker'?'virtual_compute_gates_complete':'all_local_field_gates_complete';

  if(!checks.preflight_passed){
    state=role==='virtual_worker'?'ineligible_for_compute_worker':'ineligible_for_field_public_edge';
    next_action=role==='virtual_worker'?'use_another_eligible_machine':'use_another_owned_machine';
    human_action_required=true;
    reason=role==='virtual_worker'?'compute_worker_preflight_failed':'field_preflight_failed';
  }else if(!checks.installed||!checks.node_receipt){
    state='install_ready';
    next_action='run_bootstrap_with_--advance_as_root';
    human_action_required=false;
    reason='nodeseed_not_installed';
  }else if(role!=='virtual_worker'&&!checks.rebooted_after_install){
    state='reboot_required';
    next_action='reboot_machine_once_then_rerun_bootstrap';
    human_action_required=true;
    reason='reboot_persistence_not_yet_observed';
  }else if(role!=='virtual_worker'&&!checks.offline_verified){
    state='offline_check_required';
    next_action='disconnect_network_then_run_--capture-offline';
    human_action_required=true;
    reason='offline_survival_receipt_missing';
  }else if(role!=='virtual_worker'&&(!checks.physical_confirmed||!checks.field_certified)){
    state='physical_confirmation_required';
    next_action='rerun_with_--confirm-physical-host_--advance';
    human_action_required=true;
    reason='physical_host_claim_must_be_explicit';
  }else if(role==='public_edge'&&!checks.public_edge_admitted){
    state='public_https_admission_required';
    next_action='bind_owned_domain_and_trusted_tls_then_run_--admit-public-edge';
    human_action_required=false;
    reason='public_https_not_yet_verified';
  }else if(!checks.remote_broker_configured){
    state='control_broker_binding_required';
    next_action='supply_systemia_remote_broker_url';
    human_action_required=false;
    reason='outbound_control_lane_not_configured';
  }else if((role==='private_worker'||role==='virtual_worker')&&!checks.outbound_admission_service_installed){
    state='outbound_agent_install_required';
    next_action='rerun_bootstrap_with_--advance_to_install_persistent_outbound_agent';
    human_action_required=false;
    reason='persistent_outbound_admission_service_missing';
  }

  return {
    schema:'evercraft.node-self-bootstrap.status.v1',
    state,
    reason,
    next_action,
    human_action_required,
    checks,
    node_role:role,
    public_edge_required:role==='public_edge',
    inbound_public_port_required:role==='public_edge',
    outbound_only_eligible:role==='private_worker'||role==='virtual_worker',
    physical_certification_required:role!=='virtual_worker',
    trust_class:role==='virtual_worker'?'operator_authorized_virtual':role==='public_edge'?'field_certified_public_edge':'field_certified_private_worker',
    node_id:files.node?.node_id||null,
    device_fingerprint:files.node?.device_fingerprint||null,
    public_edge:files.public_edge?{
      base_domain:files.public_edge.base_domain||null,
      public_port:files.public_edge.public_port||null,
      certificate_fingerprint256:files.public_edge.certificate_fingerprint256||null,
      ready_for_public_edge_enrollment:files.public_edge.ready_for_public_edge_enrollment===true,
      external_dns_verified:files.public_edge.external_dns_verified===true,
      public_reachability_verified:files.public_edge.public_reachability_verified===true,
    }:null,
  };
}

function writeStatus(root,status){
  const body={...status,observed_at:new Date().toISOString()};
  const receipt={...body,receipt_hash:sha(body)};
  const file=path.join(root,'bootstrap-status.json');
  fs.mkdirSync(root,{recursive:true,mode:0o750});
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  return receipt;
}

function ensureRoot(action){
  if(typeof process.getuid==='function'&&process.getuid()!==0){
    throw new Error(action+'_requires_root');
  }
}
function requireValue(name,value){
  const v=String(value||'').trim();
  if(!v) throw new Error(name+'_required');
  return v;
}
function localCapacityEndpoint(nodeReceipt){
  if(!nodeReceipt?.endpoint) throw new Error('nodeseed_receipt_endpoint_missing');
  const url=new URL(nodeReceipt.endpoint);
  return 'http://127.0.0.1:'+url.port;
}

async function main(){
  const root=path.resolve(arg('--root','/var/lib/evercraft/nodeseed'));
  const envFile=path.resolve(arg('--env-file','/etc/evercraft/nodeseed.env'));
  const brokerUrl=validateBrokerUrl(arg('--broker-url',process.env.EVERCRAFT_REMOTE_BROKER_URL||''));
  const confirmPhysical=has('--confirm-physical-host');
  const nodeRole=String(arg('--role',process.env.EVERCRAFT_NODE_ROLE||'public_edge')).trim();
  if(!['public_edge','private_worker','virtual_worker'].includes(nodeRole)) throw new Error('node_role_invalid');
  const advance=has('--advance');
  const sourceRoot=path.resolve(arg('--source-root',path.join(here,'../..')));

  // Always refresh preflight before making a placement decision.
  const preflightRun=commandJson(process.execPath,[
    path.join(sourceRoot,'systemia/compute/field-preflight.mjs'),
    '--root',root,
    '--role',nodeRole,
  ]);
  if(preflightRun.body){
    fs.mkdirSync(root,{recursive:true,mode:0o750});
    fs.writeFileSync(
      path.join(root,'node001-preflight.json'),
      JSON.stringify(preflightRun.body,null,2)+'\n',
      {mode:0o600}
    );
  }

  let files=fileState(root);
  if(files.preflight?.passed!==true){
    const status=evaluateBootstrap({
      files,currentBootHash:bootHash(),brokerUrl,physicalConfirmed:confirmPhysical,nodeRole,
    });
    console.log(JSON.stringify(writeStatus(root,status),null,2));
    process.exit(4);
  }

  if(advance&&!files.install){
    ensureRoot('nodeseed_install');
    const installed=spawnSync('bash',[
      path.join(sourceRoot,'systemia/compute/install-node-seed.sh')
    ],{
      encoding:'utf8',
      env:{...process.env,EVERCRAFT_NODESEED_ROOT:root,EVERCRAFT_NODE_ROLE:nodeRole},
      stdio:['ignore','pipe','pipe'],
      maxBuffer:4*1024*1024,
    });
    if(installed.status!==0){
      throw new Error('nodeseed_install_failed:'+String(installed.stderr||installed.stdout||'').slice(0,1000));
    }
    files=fileState(root);
  }

  if(advance&&brokerUrl&&files.install){
    ensureRoot('remote_broker_configuration');
    setEnvValue(envFile,'EVERCRAFT_REMOTE_BROKER_URL',brokerUrl);
    const enabled=spawnSync('systemctl',['enable','--now','evercraft-remote-admission.service'],{
      encoding:'utf8',
      stdio:['ignore','pipe','pipe'],
      maxBuffer:1024*1024,
    });
    if(enabled.status!==0){
      throw new Error('remote_admission_service_enable_failed:'+String(enabled.stderr||enabled.stdout||'').slice(0,800));
    }
  }

  if(has('--capture-offline')){
    const offline=commandJson(process.execPath,[
      path.join(sourceRoot,'systemia/compute/field-offline-check.mjs'),
      '--root',root,
    ]);
    if(!offline.ok) throw new Error('offline_check_failed:'+String(offline.stderr||offline.stdout||'').slice(0,1000));
    files=fileState(root);
  }

  if(nodeRole!=='virtual_worker'&&advance&&files.offline?.verified===true&&!files.field?.ready_for_yard_enrollment){
    if(!confirmPhysical){
      const status=evaluateBootstrap({
        files,currentBootHash:bootHash(),brokerUrl,physicalConfirmed:false,nodeRole,
      });
      console.log(JSON.stringify(writeStatus(root,status),null,2));
      return;
    }
    const operatorRef=requireValue('operator_ref',arg('--operator-ref','founder-authorized-local-observation'));
    const receiptRef=requireValue('receipt_ref',arg('--receipt-ref',files.offline?.receipt_hash||''));
    const certified=commandJson(process.execPath,[
      path.join(sourceRoot,'systemia/compute/field-certify.mjs'),
      '--root',root,
      '--operator-ref',operatorRef,
      '--receipt-ref',receiptRef,
      '--physical-observed',
    ]);
    if(!certified.ok) throw new Error('field_certification_failed:'+String(certified.stderr||certified.stdout||'').slice(0,1000));
    files=fileState(root);
  }

  if(has('--admit-public-edge')){
    if(nodeRole!=='public_edge') throw new Error('public_edge_admission_requires_public_edge_role');
    ensureRoot('public_edge_admission');
    const domain=requireValue('base_domain',arg('--base-domain',process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN||''));
    const key=requireValue('tls_key_path',arg('--tls-key-path',process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH||''));
    const cert=requireValue('tls_cert_path',arg('--tls-cert-path',process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH||''));
    const admitted=commandJson(process.execPath,[
      path.join(sourceRoot,'systemia/compute/public-edge-field-admit.mjs'),
      '--root',root,
      '--base-domain',domain,
      '--tls-key-path',key,
      '--tls-cert-path',cert,
      '--apply',
    ]);
    if(!admitted.ok) throw new Error('public_edge_admission_failed:'+String(admitted.stderr||admitted.stdout||'').slice(0,1200));
    files=fileState(root);
  }

  let enrollment=null;
  if(has('--request-enrollment')){
    const broker=requireValue('broker_url',brokerUrl);
    const env=readEnv(envFile);
    const token=requireValue('allocator_token',env.EVERCRAFT_ALLOCATOR_TOKEN);
    const node=files.node||readJson(path.join(root,'nodeseed-receipt.json'));
    enrollment=await submitOutboundEnrollmentRequest({
      brokerUrl:broker,
      localCapacityEndpoint:localCapacityEndpoint(node),
      localAllocatorToken:token,
    });
    const safeEnrollment={
      schema:enrollment?.schema||null,
      node_id:enrollment?.node_id||node?.node_id||null,
      device_fingerprint:enrollment?.device_fingerprint||node?.device_fingerprint||null,
      request_receipt_hash:enrollment?.request_receipt_hash||null,
      expires_at:enrollment?.expires_at||null,
      state:enrollment?.state||null,
      authority_granted:false,
      observed_at:new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root,'remote-enrollment-request.json'),
      JSON.stringify(safeEnrollment,null,2)+'\n',
      {mode:0o600}
    );
  }

  const status=evaluateBootstrap({
    files,currentBootHash:bootHash(),brokerUrl,physicalConfirmed:confirmPhysical,nodeRole,
  });
  const receipt=writeStatus(root,{
    ...status,
    remote_enrollment:enrollment?{
      state:enrollment.state||null,
      request_receipt_hash:enrollment.request_receipt_hash||null,
      authority_granted:false,
    }:null,
  });
  console.log(JSON.stringify(receipt,null,2));
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  try{await main();}
  catch(error){
    console.error(JSON.stringify({
      ok:false,
      schema:'evercraft.node-self-bootstrap.error.v1',
      error:error instanceof Error?error.message:String(error),
      founder_login_required:false,
    },null,2));
    process.exit(7);
  }
}
