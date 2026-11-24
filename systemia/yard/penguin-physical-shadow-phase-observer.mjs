#!/usr/bin/env node
/**
 * Independent read-only Penguin NodeSeed phase observer.
 * Works for baseline (one DNS service) or future authorized canary
 * (DNS plus one zero-authority broker). Does not start/stop/renew any lease.
 *
 * The returned phase snapshot is PRIVATE IN PROCESS. The CLI prints only
 * sanitized evidence. Route and historical-authority provenance remain null
 * until separate independent checks are implemented, so this probe cannot
 * on its own make the final physical acceptance validator pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectLiveResidents} from '../../scripts/inspect-penguin-nodeseed-residents.mjs';
import {inspectLiveLaunchProvenance} from '../../scripts/inspect-penguin-nodeseed-launch-provenance.mjs';
import {probeUdp} from '../../infra/evercraft-edge/dns/probe.mjs';
import {validDnsProofName} from './penguin-edge-dns-evidence.mjs';
import {observeShadowBrokerSocketBinding}
  from './penguin-shadow-broker-socket-witness.mjs';

const RECEIPT='/var/lib/evercraft/nodeseed/nodeseed-receipt.json';
const DNS_PORT=1053, NODE_PORT=42420;
const WORKLOAD='systemia.evercraft-edge-dns.v1';
const BROKER='evercraft.remote-capacity.broker-health.v1';
const PHASES=new Set(['before','during','after']);
const MAX_BYTES=8192;

function systemd(unit){
  function field(property){
    return execFileSync('systemctl',[
      'show',unit,'--value','-p',property,
    ],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();
  }
  return {active:field('ActiveState'),enabled:field('UnitFileState')};
}
function serviceUnits(){
  return {
    nodeseed:systemd('evercraft-nodeseed.service'),
    broker:systemd('evercraft-remote-broker-resident.service'),
    saban:systemd('evercraft-saban-dispatch.timer'),
  };
}
function safeReceipt(){
  const st=fs.lstatSync(RECEIPT);
  if(!st.isFile()||st.isSymbolicLink()||st.size>65536||
     st.nlink!==1)throw Error('nodeseed_receipt_not_regular');
  const data=JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
  if(data?.schema!=='evercraft.compute.nodeseed-receipt.v1'||
     !/^[A-Za-z0-9._-]{1,128}$/.test(String(data.node_id||''))||
     !/^sha256:[a-f0-9]{64}$/i.test(String(data.device_fingerprint||''))||
     Number(new URL(String(data.endpoint||'')).port)!==NODE_PORT)
    throw Error('nodeseed_receipt_identity_invalid');
  return {node_id:data.node_id,device_fingerprint:data.device_fingerprint};
}
async function getJson(port,route){
  const response=await fetch('http://127.0.0.1:'+port+route,{
    method:'GET',redirect:'error',
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(3000),
  });
  if(!response.ok)throw Error('local_health_response_non_success');
  const raw=await response.text();
  if(raw.length>MAX_BYTES)throw Error('local_health_response_too_large');
  return JSON.parse(raw);
}
function validateDnsHealth(h,dnsPort,healthPort){
  return h?.ok===true&&
    h.service==='evercraft-edge-dns'&&
    h.runtime==='Evercraft Compute'&&
    h.workload_class===WORKLOAD&&
    /^edge_dns_[a-f0-9]{16}$/i.test(String(h.instance_id||''))&&
    /^sha256:[a-f0-9]{64}$/i.test(String(h.snapshot_sha256||''))&&
    h.authoritative===true&&h.recursive===false&&
    h.dns_tcp===true&&h.dns_udp===true&&
    h.dns_bind_port===dnsPort&&dnsPort===DNS_PORT&&
    healthPort!==NODE_PORT&&healthPort!==DNS_PORT&&
    validDnsProofName(h.receipt_qname)!==null;
}
function validateBrokerHealth(h){
  return h?.ok===true&&
    h.schema===BROKER&&
    h.service==='remote-capacity-broker'&&
    h.runtime==='Evercraft Compute'&&
    h.secure_envelope_schema==='evercraft.secure-envelope.v1'&&
    /^remote_broker_[a-f0-9]{24}$/i.test(String(h.instance_id||''))&&
    h.authorized_devices===0&&h.registered_nodes===0&&
    h.pending_enrollment_requests===0&&
    h.deployment_receipt_bound===false;
}
function unitsNormal(units){
  return units?.nodeseed?.active==='active'&&
    units.nodeseed.enabled==='enabled'&&
    units.broker.active==='inactive'&&
    units.broker.enabled==='disabled'&&
    units.saban.active==='active'&&
    units.saban.enabled==='enabled';
}

/**
 * Construct an in-process snapshot only from observed facts.
 * Critically: no unverifiable false values for public-route existence or
 * historical-authority import. Downstream physical acceptance must HOLD.
 */
export function interpretPhysicalPhase({
  phase,identity,inventory,provenance,healthBefore,
  healthAfter,dnsQuery,brokerHealth,protectedUnits,brokerBinding=null,
}={}){
  const holds=[];
  if(!PHASES.has(phase))holds.push('invalid_phase');
  const expectedCount=phase==='during'?2:1;
  const dns=Array.isArray(inventory?.edge_dns_services)&&
    inventory.edge_dns_services.length===1?
    inventory.edge_dns_services[0]:null;
  const brokers=inventory?.broker_listeners;
  const expectedBrokers=phase==='during'?1:0;

  if(inventory?.node_health_verified!==true||
     inventory?.node_port!==NODE_PORT||
     inventory?.resident_service_count!==expectedCount||
     inventory?.service_identity_resolved!==true||
     inventory?.socket_audit_error!==null||
     inventory?.unclassified_tcp_listener_ports?.length!==0||
     !Array.isArray(brokers)||brokers.length!==expectedBrokers||
     !dns||dns.workload_class!==WORKLOAD||
     dns.dns_tcp_port!==DNS_PORT||
     !Array.isArray(inventory?.owner_tcp_ports)||
     !inventory.owner_tcp_ports.includes(NODE_PORT)||
     !inventory.owner_tcp_ports.includes(DNS_PORT)||
     !inventory.owner_tcp_ports.includes(dns.health_http_port))
    holds.push('resident_identity_or_pid_owned_socket_mismatch');

  if(provenance?.known_entrypoint_invoked!==true||
     provenance?.all_source_blobs_match_known_history!==true||
     provenance?.all_source_files_predate_process_start!==true||
     provenance?.udp_socket_inventory_available!==true||
     provenance?.udp_1053_owned_by_nodeseed!==true)
    holds.push('source_provenance_or_udp_owner_unverified');

  if(!/^[A-Za-z0-9._-]{1,128}$/.test(String(identity?.node_id||''))||
     !/^sha256:[a-f0-9]{64}$/i.test(String(identity?.device_fingerprint||'')))
    holds.push('nodeseed_identity_unverified');

  if(!unitsNormal(protectedUnits))
    holds.push('protected_service_state_changed');

  if(!validateDnsHealth(healthBefore,DNS_PORT,dns?.health_http_port)||
     !validateDnsHealth(healthAfter,DNS_PORT,dns?.health_http_port)||
     healthBefore?.instance_id!==healthAfter?.instance_id||
     healthBefore?.snapshot_sha256!==healthAfter?.snapshot_sha256||
     healthBefore?.receipt_qname!==healthAfter?.receipt_qname)
    holds.push('dns_health_changed_within_observation');

  if(dnsQuery?.aa!==true||dnsQuery?.ra!==false||
     dnsQuery?.rcode!==0||
     !Number.isSafeInteger(dnsQuery?.answers)||dnsQuery.answers<1)
    holds.push('dns_udp_authoritative_answer_unverified');

  const brokerPort=brokers?.[0]?.port;
  if(phase==='during'){
    if(!Number.isSafeInteger(brokerPort)||brokerPort<=0||
       brokerPort===NODE_PORT||brokerPort===DNS_PORT||
       brokerPort===dns?.health_http_port||
       !Array.isArray(inventory?.owner_tcp_ports)||
       !inventory.owner_tcp_ports.includes(brokerPort)||
       !validateBrokerHealth(brokerHealth)||
       brokerBinding?.verified!==true||
       brokerBinding?.loopback_only_verified!==true||
       brokerBinding?.socket_owner_is_live_nodeseed!==true||
       brokerBinding?.candidate_port!==brokerPort)
      holds.push('new_broker_zero_authority_or_pid_owner_unverified');
  }else if(brokerHealth!==null||brokerBinding!==null)
    holds.push('broker_unexpected_in_dns_only_phase');

  return {
    schema:'evercraft.penguin.physical-shadow-phase-observation.v1',
    phase,
    observed:holds.length===0,
    hold_reasons:holds,
    // Kept in memory only, never printed in the CLI projection.
    snapshot:{
      node_id:identity?.node_id||null,
      device_fingerprint:identity?.device_fingerprint||null,
      node_port:NODE_PORT,
      resident_services:inventory?.resident_service_count??null,
      owner_tcp_ports:inventory?.owner_tcp_ports||null,
      dns:{
        service:healthBefore?.service||null,
        workload_class:healthBefore?.workload_class||null,
        instance_id:healthBefore?.instance_id||null,
        snapshot_sha256:healthBefore?.snapshot_sha256||null,
        dns_tcp_port:healthBefore?.dns_bind_port??null,
        health_http_port:dns?.health_http_port??null,
        authoritative:healthBefore?.authoritative??null,
        recursive:healthBefore?.recursive??null,
        dns_tcp:healthBefore?.dns_tcp??null,
        dns_udp:healthBefore?.dns_udp??null,
      },
      dns_probe:{
        aa:dnsQuery?.aa??null,
        ra:dnsQuery?.ra??null,
        rcode:dnsQuery?.rcode??null,
        answers:dnsQuery?.answers??null,
      },
      protected_units:protectedUnits||null,
      // NEVER assume unexamined remote routing/grants are absent.
      legacy_authority_imported:null,
      public_route_created:null,
      broker:phase==='during'&&brokerHealth?{
        service:brokerHealth.service,
        instance_id:brokerHealth.instance_id,
        endpoint:Number.isSafeInteger(brokerPort)?
          'http://127.0.0.1:'+brokerPort:null,
        authorized_devices:brokerHealth.authorized_devices,
        registered_nodes:brokerHealth.registered_nodes,
        pending_enrollment_requests:
          brokerHealth.pending_enrollment_requests,
        deployment_receipt_bound:brokerHealth.deployment_receipt_bound,
        loopback_listener_verified:brokerBinding?.verified===true,
        public_route_created:null,
      }:null,
    },
    route_and_legacy_authority_evidence_complete:false,
    physical_acceptance_ready:false,
    broker_activation_authorized:false,
    services_changed:false,
  };
}

export async function observePhysicalPhase({phase='before'}={}){
  if(process.getuid?.()!==0)throw Error('root_required_for_pid_audit');
  if(!PHASES.has(phase))throw Error('phase_not_supported');
  const inventory=await inspectLiveResidents();
  const provenance=inspectLiveLaunchProvenance();
  const identity=safeReceipt();
  const protectedUnits=serviceUnits();
  const dns=inventory?.edge_dns_services?.[0];
  const count=phase==='during'?2:1;
  if(inventory?.resident_service_count!==count||
     inventory?.edge_dns_services?.length!==1||
     inventory?.broker_listeners?.length!==(phase==='during'?1:0)||
     inventory?.service_identity_resolved!==true||
     inventory?.socket_audit_error!==null||
     inventory?.unclassified_tcp_listener_ports?.length!==0||
     provenance?.udp_1053_owned_by_nodeseed!==true||
     !unitsNormal(protectedUnits)||
     !Number.isSafeInteger(dns?.health_http_port))
    throw Error('physical_phase_precheck_hold');

  const healthBefore=await getJson(dns.health_http_port,'/health');
  if(!validateDnsHealth(healthBefore,DNS_PORT,dns.health_http_port))
    throw Error('dns_health_not_trusted_for_query');
  const brokerPort=inventory.broker_listeners?.[0]?.port;
  const brokerHealth=phase==='during'?
    await getJson(brokerPort,'/v1/remote/health'):null;
  if(phase==='during'&&!validateBrokerHealth(brokerHealth))
    throw Error('broker_health_not_zero_authority');
  const brokerBinding=phase==='during'?
    observeShadowBrokerSocketBinding({brokerPort}):null;
  if(phase==='during'&&brokerBinding?.verified!==true)
    throw Error('broker_socket_not_exact_loopback');
  const name=validDnsProofName(healthBefore.receipt_qname);
  if(!name)throw Error('dns_receipt_qname_invalid');
  const dnsQuery=await probeUdp({
    server:'127.0.0.1',port:DNS_PORT,name,timeout:3000,
  });
  const healthAfter=await getJson(dns.health_http_port,'/health');
  return interpretPhysicalPhase({
    phase,identity,inventory,provenance,healthBefore,
    healthAfter,dnsQuery,brokerHealth,protectedUnits,brokerBinding,
  });
}

export function sanitizePhaseResult(result){
  return {
    schema:'evercraft.penguin.physical-shadow-phase-observation.v1',
    phase:PHASES.has(result?.phase)?result.phase:null,
    observed:result?.observed===true,
    hold_reasons:result?.hold_reasons||['observation_unavailable'],
    resident_services:result?.snapshot?.resident_services??null,
    dns_udp_authoritative:
      result?.snapshot?.dns_probe?.aa===true&&
      result?.snapshot?.dns_probe?.ra===false&&
      result?.snapshot?.dns_probe?.rcode===0,
    zero_authority_broker_seen:
      result?.phase==='during'&&result?.observed===true,
    broker_socket_loopback_verified:
      result?.phase==='during'&&
      result?.snapshot?.broker?.loopback_listener_verified===true,
    node_id_printed:false,
    fingerprint_printed:false,
    dns_instance_printed:false,
    broker_instance_printed:false,
    raw_snapshot_printed:false,
    secrets_read:false,
    route_and_legacy_authority_evidence_complete:false,
    physical_acceptance_ready:false,
    broker_activation_authorized:false,
    services_changed:false,
    dns_query_may_be_logged:true,
  };
}

const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const phase=process.argv.length===3&&process.argv[2]==='--before'?
    'before':null;
  if(!phase){
    console.error(JSON.stringify({
      observed:false,reason:'only_read_only_before_phase_cli_allowed',
      broker_activation_authorized:false,
    }));
    process.exitCode=3;
  }else{
    observePhysicalPhase({phase}).then(result=>{
      console.log(JSON.stringify(sanitizePhaseResult(result),null,2));
      if(!result.observed)process.exitCode=3;
    }).catch(error=>{
      console.error(JSON.stringify({
        schema:'evercraft.penguin.physical-shadow-phase-observation.v1',
        observed:false,
        reason:String(error?.message||'phase_observation_failed').slice(0,90),
        secrets_read:false,
        broker_activation_authorized:false,
        services_changed:false,
      }));
      process.exitCode=3;
    });
  }
}
