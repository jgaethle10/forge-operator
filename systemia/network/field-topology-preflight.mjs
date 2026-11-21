#!/usr/bin/env node
// Evercraft Network: read-only local interface inventory, NOT proof of WAN loss.
// Never scans, pings, sends packets, enrolls hosts, or changes firewall/router state.
import os from 'node:os';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function isPrivateV4(ip) {
  if (typeof ip !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const x = ip.split('.').map(Number);
  if (x.some(v => v < 0 || v > 255)) return false;
  return x[0] === 10 || (x[0] === 172 && x[1] >= 16 && x[1] <= 31) || (x[0] === 192 && x[1] === 168);
}

export function assessTopology({interfaces, bind = null, virtualization = false}) {
  const all = Object.entries(interfaces ?? {}).flatMap(([name, values]) => (values ?? []).map(v => ({name, ...v})));
  const ipv4 = all.filter(v => v.family === 'IPv4' && typeof v.address === 'string');
  const privateCandidates = ipv4.filter(v => !v.internal && isPrivateV4(v.address));
  const assigned = bind !== null && ipv4.some(v => v.address === bind && !v.internal && isPrivateV4(bind));
  let state = 'HOLD_BIND_REQUIRED';
  if (bind === '127.0.0.1') state = 'HOLD_LOOPBACK_ONLY';
  else if (bind !== null && (!isPrivateV4(bind) || !assigned)) state = 'HOLD_BIND_NOT_ASSIGNED_PRIVATE_IPV4';
  else if (bind !== null && assigned && virtualization) state = 'REVIEW_VIRTUAL_GUEST_REACHABILITY';
  else if (bind !== null && assigned) state = 'LOCAL_BIND_CANDIDATE';
  return {
    schema: 'evercraft.network.field-topology-preflight.v1',
    state,
    private_lan_ipv4_candidates: privateCandidates.length,
    local_bind_matches_assigned_interface: Boolean(assigned),
    virtualization_possible: Boolean(virtualization),
    hardware_peer_verified: false,
    upstream_internet_disconnected_verified: false,
    physical_transport_verified: false,
    private_ip_addresses_emitted: false,
    packets_sent: 0,
    next_gate: state === 'LOCAL_BIND_CANDIDATE' ? 'operator-approved_isolated_LAN_field_test' :
      state === 'REVIEW_VIRTUAL_GUEST_REACHABILITY' ? 'operator_review_host_guest_NAT_without_automatic_changes' :
        'select_operator_owned_assigned_private_LAN_interface'
  };
}

function detectVirtualization() {
  let kernel = '';
  try {kernel = fs.readFileSync('/proc/version','utf8').slice(0,2048);} catch { /* optional diagnostic only */ }
  return Boolean(process.env.WSL_INTEROP || process.env.CROSTINI_CONTAINER || /microsoft|crostini/i.test(kernel));
}

function option(flag) {
  const index=process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index+1] ?? null : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No credentials, IP addresses, hostnames, serial numbers or interface names printed.
  const result=assessTopology({interfaces: os.networkInterfaces(), bind: option('--bind'), virtualization: detectVirtualization()});
  process.stdout.write(JSON.stringify(result)+'\n');
  if (result.state.startsWith('HOLD_')) process.exitCode=2;
}
