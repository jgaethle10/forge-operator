#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PublicEdgeActivationWatcher } from '../yard/public-edge-activation-watch.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { evaluatePublicEdgeFieldMission } from './public-edge-field-mission.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(tmp,file);
}

function readJsonIfExists(file){
  try{
    return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  }catch{
    return null;
  }
}

function releaseRef(){
  const explicit=String(process.env.EVERCRAFT_RELEASE_REF||'').trim();
  if(/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try{
    const value=execFileSync('git',['rev-parse','HEAD'],{
      encoding:'utf8',
      stdio:['ignore','pipe','ignore'],
    }).trim();
    if(/^[a-f0-9]{40}$/i.test(value)) return value;
  }catch{}
  throw new Error('immutable_release_ref_unavailable');
}

function allocatorAuthority(){
  let allocatorTokens={};
  const raw=String(process.env.EVERCRAFT_ALLOCATOR_TOKENS_JSON||'').trim();
  if(raw){
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
      throw new Error('EVERCRAFT_ALLOCATOR_TOKENS_JSON must be an object');
    }
    allocatorTokens=Object.fromEntries(
      Object.entries(parsed)
        .map(([k,v])=>[String(k),String(v||'')])
        .filter(([,v])=>Boolean(v))
    );
  }

  let yardAuthoritySource=null;
  const yardState=String(process.env.SYSTEMIA_YARD_STATE_DIR||'').trim();
  if(yardState){
    const privateAuthority=new YardOperator({
      stateDir:path.resolve(yardState),
    }).privateCapacityAuthorities();
    for(const [nodeId,token] of Object.entries(privateAuthority.allocatorTokens||{})){
      if(!allocatorTokens[nodeId]&&token) allocatorTokens[nodeId]=token;
    }
    yardAuthoritySource={
      schema:privateAuthority.schema,
      source_record_count:privateAuthority.source_record_count,
      node_count:Object.keys(privateAuthority.allocatorTokens||{}).length,
    };
  }

  return {
    allocatorToken:String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||''),
    allocatorTokens,
    yardAuthoritySource,
  };
}

async function delegatedCapacityGrant({
  requiredWorkloads=[],
  requiredPlacementLabels=[],
}={}){
  const brokerDeploymentId=String(
    process.env.SYSTEMIA_REMOTE_BROKER_DEPLOYMENT_ID||''
  ).trim();
  const yardState=String(process.env.SYSTEMIA_YARD_STATE_DIR||'').trim();
  if(!brokerDeploymentId||!yardState) return null;

  const yard=new YardOperator({stateDir:path.resolve(yardState)});
  const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const requiredWork=new Set(requiredWorkloads.map(String));
  const requiredLabels=new Set(requiredPlacementLabels.map(String));

  const eligible=(inventory.nodes||[]).filter((node)=>{
    if(node.connected!==true) return false;
    const capacity=node.capacity||{};
    const workloads=new Set(capacity.supported_workloads||[]);
    const labels=new Set(capacity.placement_labels||[]);
    const edge=capacity.public_edge||{};
    return (
      capacity.protocol==='evercraft.capacity.v1' &&
      capacity.runtime==='Evercraft Compute' &&
      capacity.attestation_supported===true &&
      capacity.device_fingerprint===node.device_fingerprint &&
      [...requiredWork].every((key)=>workloads.has(key)) &&
      [...requiredLabels].every((key)=>labels.has(key)) &&
      edge.ready===true &&
      edge.public_https===true
    );
  }).sort((a,b)=>
    String(b.last_seen_at||'').localeCompare(String(a.last_seen_at||''))
  );

  if(!eligible.length) return null;
  const selected=eligible[0];
  const grant=await yard.remoteCapacityGrant(
    brokerDeploymentId,
    selected.node_id
  );
  if(
    grant.node_id!==selected.node_id ||
    grant.device_fingerprint!==selected.device_fingerprint
  ){
    throw new Error('delegated_capacity_grant_identity_mismatch');
  }

  return {
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    nodeId:grant.node_id,
    deviceFingerprint:grant.device_fingerprint,
    receiptHash:grant.control_grant_receipt_hash||null,
    brokerRouteReceipt:grant.public_route_receipt_hash||null,
  };
}

function discoveryConfig(){
  return {
    bindAddress:String(process.env.EVERCRAFT_DISCOVERY_BIND_ADDRESS||'0.0.0.0'),
    multicastAddress:String(process.env.EVERCRAFT_DISCOVERY_MULTICAST_ADDRESS||'239.42.24.42'),
    port:Number(process.env.EVERCRAFT_DISCOVERY_PORT||42424),
    timeoutMs:Number(process.env.EVERCRAFT_DISCOVERY_TIMEOUT_MS||1000),
    joinMulticast:String(process.env.EVERCRAFT_DISCOVERY_JOIN_MULTICAST||'true')!=='false',
  };
}

function node001ActivationAdmitted(mission){
  return Boolean(
    mission?.schema==='evercraft.node001.field-mission-state.v1' &&
    mission?.status==='complete' &&
    mission?.human_field_action_required===false &&
    Array.isArray(mission?.completed_steps) &&
    mission.completed_steps.includes('yard_enrollment_verified') &&
    mission.completed_steps.includes('live_identity_attested') &&
    mission.completed_steps.includes('kaidance_field_pulse_verified') &&
    mission.completed_steps.includes('continuity_receipt_verified')
  );
}

function missionSnapshot(result,previous){
  const action=String(result.action||'hold');
  const healthy=action==='activated'||action==='healthy';
  const held=!healthy;
  const materialChange=
    !previous ||
    previous.action!==action ||
    previous.origin!==result.origin ||
    previous.reason!==result.reason ||
    previous.selected_node_id!==result.selected_node_id;

  return {
    schema:'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref:'public-edge-activation-watch:'+String(result.sequence||0),
    observed_at:result.observed_at,
    counts:{
      scanned:Number(result.discovered_count||0),
      changed:materialChange?1:0,
      admitted:healthy?1:0,
      held:held?1:0,
    },
    evidence_refs:[
      result.receipt_hash,
      result.resolver_receipt,
      result.resume_receipt,
      result.provision_receipt,
    ].filter(Boolean),
    mission_key:'evercraft-public-specialist-edge',
    workflow_key:'public-edge-activation-watch',
    state:healthy?'healthy_or_activated':'held',
    material_change:materialChange,
    founder_action_required:false,
    public_https_verified:result.route_verified===true,
  };
}

const outDir=path.resolve(arg(
  '--out',
  process.env.EVERCRAFT_PUBLIC_EDGE_ARTIFACT_DIR||
  'artifacts/public-edge-activation-watch'
));
const stateDir=path.resolve(arg(
  '--state',
  process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR||
  path.join(outDir,'runtime')
));
const node001MissionFile=path.resolve(
  process.env.EVERCRAFT_NODE001_FIELD_MISSION_STATE||
  'artifacts/node001-field/megatron-status/latest.json'
);
const externalCanaryFile=path.resolve(
  process.env.EVERCRAFT_PUBLIC_EDGE_CANARY_STATE||
  path.join(outDir,'external-canary.json')
);
const directSpecsFile=path.resolve(
  process.env.EVERCRAFT_DIRECT_PLUGIN_SPECS||
  'distribution/direct-plugin-specs.json'
);

const latestFile=path.join(outDir,'latest.json');
let previous=null;
if(fs.existsSync(latestFile)){
  try{ previous=JSON.parse(fs.readFileSync(latestFile,'utf8')); }catch{}
}

const watcher=new PublicEdgeActivationWatcher({
  stateDir,
  releaseRef:releaseRef(),
  discovery:discoveryConfig(),
  allocatorTokenProvider:async()=>allocatorAuthority(),
  capacityGrantProvider:delegatedCapacityGrant,
  edge:{
    mode:'wildcard_https',
    public_host:String(process.env.EVERCRAFT_PUBLIC_EDGE_HOST||'0.0.0.0'),
    public_port:Number(process.env.EVERCRAFT_PUBLIC_EDGE_PORT||443),
  },
  specialist:{
    gateway_url:String(
      process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL||
      'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway'
    ),
  },
  requiredPlacementLabels:String(
    process.env.EVERCRAFT_PUBLIC_EDGE_REQUIRED_LABELS||'public-edge'
  ).split(',').map(x=>x.trim()).filter(Boolean),
  requestedHostname:String(
    process.env.EVERCRAFT_PUBLIC_EDGE_REQUESTED_HOSTNAME||'evercraft-specialists'
  ),
  endpointTimeoutMs:Number(process.env.EVERCRAFT_EDGE_ENDPOINT_TIMEOUT_MS||1000),
  leaseTtlMs:Number(process.env.EVERCRAFT_EDGE_LEASE_TTL_MS||3600000),
  renewEveryMs:Number(process.env.EVERCRAFT_EDGE_RENEW_EVERY_MS||1800000),
  intervalMs:300000,
  allowLoopbackProof:false,
});

const node001Mission=readJsonIfExists(node001MissionFile);
let result;
try{
  if(node001ActivationAdmitted(node001Mission)){
    result=await watcher.tick();
  }else{
    result=watcher.hold('node001_field_certification_incomplete',{
      dependency_issue_ref:'github:issue:175',
      node001_status:node001Mission?.status||'missing',
      authorized_field_action_required:
        node001Mission?.human_field_action_required!==false,
      production_activation_attempted:false,
    });
  }
}finally{
  watcher.stop();
}

const snapshot=missionSnapshot(result,previous);
const fieldMission=evaluatePublicEdgeFieldMission({
  node001Mission,
  edgeWatch:result,
  externalCanary:readJsonIfExists(externalCanaryFile),
  directPluginSpecs:readJsonIfExists(directSpecsFile),
  issueRef:'github:issue:403',
  dependencyIssueRef:'github:issue:175',
});

atomicJson(latestFile,result);
atomicJson(path.join(outDir,'mission-snapshot.json'),snapshot);
atomicJson(path.join(outDir,'field-mission.json'),fieldMission.mission);
atomicJson(path.join(outDir,'field-mission-snapshot.json'),fieldMission.mission_snapshot);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.public-edge.activation-watch-runner.v1',
  action:result.action,
  reason:result.reason||null,
  founder_action_required:false,
  public_https_verified:result.route_verified===true,
  material_change:snapshot.material_change,
  receipt:result.receipt_hash,
  mission_snapshot:path.join(outDir,'mission-snapshot.json'),
  field_mission_status:fieldMission.mission.status,
  field_mission_receipt:fieldMission.mission.receipt_hash,
  field_mission:path.join(outDir,'field-mission.json'),
  field_mission_snapshot:path.join(outDir,'field-mission-snapshot.json'),
},null,2));
