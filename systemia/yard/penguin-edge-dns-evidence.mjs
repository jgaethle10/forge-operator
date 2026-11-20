#!/usr/bin/env node
/**
 * Live Penguin Edge DNS evidence sensor. NO broker activation.
 * It sends one ordinary DNS TXT query to existing loopback port 1053,
 * which the DNS service may record as a query receipt. Never reads grants,
 * tokens, private process arguments, or changes a service configuration.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectLiveResidents} from '../../scripts/inspect-penguin-nodeseed-residents.mjs';
import {inspectLiveLaunchProvenance} from '../../scripts/inspect-penguin-nodeseed-launch-provenance.mjs';
import {probeUdp} from '../../infra/evercraft-edge/dns/probe.mjs';

const DNS_PORT=1053;
const WORKLOAD='systemia.evercraft-edge-dns.v1';
const LIMIT=8192;

export function validDnsProofName(name){
  const s=String(name||'').trim().toLowerCase();
  if(s.length<4||s.length>253||!s.endsWith('.'))return null;
  const labels=s.slice(0,-1).split('.');
  if(labels.length<3||labels.some(v=>v.length<1||v.length>63||
      !/^[a-z0-9_-]+$/.test(v)))return null;
  return s;
}

export function evaluateLiveDnsProof({
  inventory,provenance,healthBefore,healthAfter,dnsQuery,
}={}){
  const holds=[];
  const services=inventory?.edge_dns_services;
  const only=Array.isArray(services)&&services.length===1?services[0]:null;
  if(inventory?.node_health_verified!==true||
     inventory?.node_port!==42420||
     inventory?.resident_service_count!==1||
     inventory?.service_identity_resolved!==true||
     inventory?.socket_audit_error!==null||
     inventory?.broker_listeners?.length!==0||
     inventory?.unclassified_tcp_listener_ports?.length!==0||
     !only||only.workload_class!==WORKLOAD||
     only.dns_tcp_port!==DNS_PORT||
     !inventory.owner_tcp_ports?.includes(DNS_PORT)||
     !inventory.owner_tcp_ports?.includes(only.health_http_port))
    holds.push('pid_owned_dns_only_baseline_unverified');
  if(provenance?.udp_socket_inventory_available!==true||
     provenance?.udp_1053_owned_by_nodeseed!==true||
     provenance?.known_entrypoint_invoked!==true||
     provenance?.all_source_blobs_match_known_history!==true||
     provenance?.all_source_files_predate_process_start!==true)
    holds.push('udp_source_or_launch_provenance_unverified');

  const healthContract=h=>h?.ok===true&&
    h.service==='evercraft-edge-dns'&&h.runtime==='Evercraft Compute'&&
    h.workload_class===WORKLOAD&&
    /^edge_dns_[a-f0-9]{16}$/i.test(String(h.instance_id||''))&&
    h.authoritative===true&&h.recursive===false&&
    h.dns_tcp===true&&h.dns_udp===true&&
    h.dns_bind_port===DNS_PORT&&
    validDnsProofName(h.receipt_qname)!==null;

  if(!healthContract(healthBefore)||!healthContract(healthAfter)||
     healthBefore?.instance_id!==healthAfter?.instance_id||
     healthBefore?.snapshot_sha256!==healthAfter?.snapshot_sha256||
     healthBefore?.receipt_qname!==healthAfter?.receipt_qname||
     healthBefore?.dns_bind_host!==healthAfter?.dns_bind_host)
    holds.push('dns_instance_or_snapshot_changed');
  if(dnsQuery?.aa!==true||dnsQuery?.ra!==false||
     dnsQuery?.rcode!==0||
     !Number.isSafeInteger(dnsQuery?.answers)||dnsQuery.answers<1)
    holds.push('authoritative_dns_txt_response_unverified');

  return {
    schema:'evercraft.penguin.edge-dns-live-evidence.v1',
    verified:holds.length===0,
    hold_reasons:holds,
    node_seed_resident_services:inventory?.resident_service_count??null,
    dns_service_count:Array.isArray(services)?services.length:null,
    tcp_listener_owner_confirmed:only!==null,
    udp_listener_owner_confirmed:
      provenance?.udp_1053_owned_by_nodeseed===true,
    authoritative_reply_confirmed:dnsQuery?.aa===true&&
      dnsQuery?.ra===false&&dnsQuery?.rcode===0&&
      Number.isSafeInteger(dnsQuery?.answers)&&dnsQuery.answers>=1,
    same_dns_instance_and_snapshot:
      healthContract(healthBefore)&&healthContract(healthAfter)&&
      healthBefore.instance_id===healthAfter.instance_id&&
      healthBefore.snapshot_sha256===healthAfter.snapshot_sha256,
    qname_printed:false,
    snapshot_content_printed:false,
    device_identity_printed:false,
    authority_read:false,
    broker_activation_authorized:false,
    services_changed:false,
    ordinary_dns_query_sent:true,
    dns_service_may_log_query:true,
  };
}
async function readDnsHealth(port){
  const res=await fetch('http://127.0.0.1:'+port+'/health',{
    method:'GET',redirect:'error',
    signal:AbortSignal.timeout(3000),
    headers:{accept:'application/json'},
  });
  if(!res.ok)throw Error('dns_health_http_not_success');
  const raw=await res.text();
  if(raw.length>LIMIT)throw Error('dns_health_too_large');
  return JSON.parse(raw);
}

export async function observePenguinDnsBaseline(){
  if(process.getuid?.()!==0)throw Error('root_required_for_dns_pid_audit');
  const inventory=await inspectLiveResidents();
  const provenance=inspectLiveLaunchProvenance();
  const services=inventory?.edge_dns_services;
  if(inventory?.service_identity_resolved!==true||
     inventory?.resident_service_count!==1||
     !Array.isArray(services)||services.length!==1||
     inventory.owner_tcp_ports?.includes(services[0].health_http_port)!==true||
     services[0].dns_tcp_port!==DNS_PORT||
     provenance?.udp_1053_owned_by_nodeseed!==true)
    throw Error('unverified_dns_service_owner');

  const port=services[0].health_http_port;
  const before=await readDnsHealth(port);
  const name=validDnsProofName(before.receipt_qname);
  if(!name||before.service!=='evercraft-edge-dns'||
     before.dns_bind_port!==DNS_PORT)
    throw Error('dns_health_or_probe_name_unverified');

  // DNS question only, against this machine's existing loopback DNS.
  const dnsQuery=await probeUdp({
    server:'127.0.0.1',port:DNS_PORT,name,timeout:3000,
  });
  const after=await readDnsHealth(port);
  return evaluateLiveDnsProof({
    inventory,provenance,
    healthBefore:before,
    healthAfter:after,
    dnsQuery,
  });
}

const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  observePenguinDnsBaseline().then(report=>{
    console.log(JSON.stringify(report,null,2));
    if(!report.verified)process.exitCode=3;
  }).catch(error=>{
    console.error(JSON.stringify({
      schema:'evercraft.penguin.edge-dns-live-evidence.v1',
      verified:false,
      hold_reasons:[String(error?.message||'dns_observation_failed').slice(0,90)],
      broker_activation_authorized:false,
      services_changed:false,
      dns_service_may_log_query:true,
    }));
    process.exitCode=3;
  });
}
