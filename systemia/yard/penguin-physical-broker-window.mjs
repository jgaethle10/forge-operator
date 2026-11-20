#!/usr/bin/env node
/**
 * Read-only pre-activation window gate for Penguin's existing NodeSeed.
 * This DOES NOT start a broker, request a lease, import grants or inspect
 * private authority. A passing window is NOT permission to activate.
 *
 * Require:
 *   - Exactly one known resident: Evercraft Edge DNS on TCP 1053 + health port.
 *   - NodeSeed 42420 with correct runtime identity.
 *   - Historical source audit matches prelaunch on-disk hashes.
 *   - NodeSeed owns Edge DNS UDP 1053.
 *   - Historical broker disabled/inactive and Saban timer active.
 *   - No unclassified listeners and no prior shadow-canary journal directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectLiveResidents} from '../../scripts/inspect-penguin-nodeseed-residents.mjs';
import {inspectLiveLaunchProvenance} from '../../scripts/inspect-penguin-nodeseed-launch-provenance.mjs';

const NODE_ROOT='/var/lib/evercraft/nodeseed';

function systemctl(unit,key){
  return execFileSync('systemctl',['show',unit,'--value','-p',key],{
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore'],
  }).trim();
}

function pendingCanaryRoots(){
  const roots=fs.readdirSync(NODE_ROOT,{withFileTypes:true});
  return roots.filter(entry=>
    entry.name.startsWith('.shadow-broker-canary-') ||
    entry.name.startsWith('shadow-canary-')
  ).length;
}

export function evaluatePhysicalBrokerWindow({
  residents,provenance,units,pendingCanaryCount,
}={}){
  const holds=[];
  if(residents?.node_health_verified!==true||
     residents?.node_port!==42420||
     residents?.resident_service_count!==1||
     residents?.service_identity_resolved!==true)
    holds.push('nodeseed_resident_baseline_unverified');
  if(!Array.isArray(residents?.edge_dns_services)||
     residents.edge_dns_services.length!==1||
     residents.edge_dns_services[0]?.workload_class!=='systemia.evercraft-edge-dns.v1'||
     residents.edge_dns_services[0]?.dns_tcp_port!==1053||
     residents.edge_dns_services[0]?.authoritative!==true||
     residents.edge_dns_services[0]?.recursive!==false)
    holds.push('edge_dns_identity_not_exact');
  if(residents?.broker_listeners?.length!==0||
     residents?.unclassified_tcp_listener_ports?.length!==0||
     residents?.socket_audit_error!==null)
    holds.push('unclassified_or_remote_broker_listener_present');
  if(provenance?.known_entrypoint_invoked!==true||
     provenance?.all_source_blobs_match_known_history!==true||
     provenance?.all_source_files_predate_process_start!==true||
     provenance?.udp_socket_inventory_available!==true||
     provenance?.udp_1053_owned_by_nodeseed!==true)
    holds.push('source_provenance_or_dns_udp_unverified');
  if(units?.nodeseed?.active!=='active'||
     units?.nodeseed?.enabled!=='enabled'||
     units?.broker?.active!=='inactive'||
     units?.broker?.enabled!=='disabled'||
     units?.saban?.active!=='active'||
     units?.saban?.enabled!=='enabled')
    holds.push('protected_service_state_changed');
  if(!Number.isInteger(pendingCanaryCount)||pendingCanaryCount!==0)
    holds.push('shadow_canary_state_already_exists_or_unverified');

  return {
    schema:'evercraft.penguin.shadow-broker-physical-window.v1',
    read_only:true,
    baseline_pass:holds.length===0,
    hold_reasons:holds,
    edge_dns_preserved:true,
    existing_resident_service_count:residents?.resident_service_count??null,
    existing_authority_import_allowed:false,
    historical_broker_may_be_started:false,
    saban_dispatcher_may_be_switched:false,
    broker_activation_authorized:false,
    source_bytes_loaded_in_memory_verified:false,
    secrets_read:false,
    services_changed:false,
  };
}

export async function checkPhysicalBrokerWindow(){
  if(process.getuid?.()!==0)throw Error('root_required_for_read_only_window');
  const residents=await inspectLiveResidents();
  const provenance=inspectLiveLaunchProvenance();
  const units={
    nodeseed:{
      active:systemctl('evercraft-nodeseed.service','ActiveState'),
      enabled:systemctl('evercraft-nodeseed.service','UnitFileState'),
    },
    broker:{
      active:systemctl('evercraft-remote-broker-resident.service','ActiveState'),
      enabled:systemctl('evercraft-remote-broker-resident.service','UnitFileState'),
    },
    saban:{
      active:systemctl('evercraft-saban-dispatch.timer','ActiveState'),
      enabled:systemctl('evercraft-saban-dispatch.timer','UnitFileState'),
    },
  };
  return evaluatePhysicalBrokerWindow({
    residents,provenance,units,
    pendingCanaryCount:pendingCanaryRoots(),
  });
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  checkPhysicalBrokerWindow().then(result=>{
    console.log(JSON.stringify(result,null,2));
    if(!result.baseline_pass)process.exitCode=3;
  }).catch(error=>{
    console.error(JSON.stringify({
      schema:'evercraft.penguin.shadow-broker-physical-window.v1',
      baseline_pass:false,
      hold_reasons:[String(error?.message||'preflight_failed').slice(0,100)],
      broker_activation_authorized:false,
      read_only:true,
      no_automatic_retry:true,
    }));
    process.exitCode=3;
  });
}
