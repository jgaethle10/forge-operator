import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (value) =>
  'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function boundedExec(program, args = [], { timeoutMs = 1500, maxBytes = 262144 } = {}) {
  try {
    const stdout = execFileSync(program, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: maxBytes,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { ok: true, stdout: String(stdout || '').trim(), error: null };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || '').trim(),
      error: String(error?.code || error?.message || 'command_failed').slice(0, 240),
    };
  }
}

function safeRead(file, maxBytes = 65536) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function parseEnvAllowlist(file, allowed) {
  const text = safeRead(file);
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || !allowed.has(match[1])) continue;
    out[match[1]] = match[2].trim();
  }
  return out;
}

function interfacesFromOs() {
  const interfaces = [];
  for (const [name, rows] of Object.entries(os.networkInterfaces())) {
    for (const row of rows || []) {
      interfaces.push({
        name,
        family: row.family,
        address: row.address,
        prefix_length: row.cidr?.includes('/') ? Number(row.cidr.split('/')[1]) : null,
        internal: Boolean(row.internal),
        scope_id: row.scopeid || null,
      });
    }
  }
  return interfaces;
}

function parseDefaultRoutes() {
  const routes = [];
  for (const family of ['-4', '-6']) {
    const result = boundedExec('ip', ['-j', family, 'route', 'show', 'default']);
    if (!result.ok || !result.stdout) continue;
    try {
      const parsed = JSON.parse(result.stdout);
      for (const route of parsed) {
        routes.push({
          family: family === '-4' ? 'IPv4' : 'IPv6',
          gateway: route.gateway || null,
          dev: route.dev || null,
          prefsrc: route.prefsrc || null,
          metric: Number.isFinite(Number(route.metric)) ? Number(route.metric) : null,
        });
      }
    } catch {}
  }
  return routes;
}

function parseListeners() {
  const listeners = [];
  for (const [protocol, args] of [
    ['tcp', ['-H', '-lnt']],
    ['udp', ['-H', '-lnu']],
  ]) {
    const result = boundedExec('ss', args);
    if (!result.ok || !result.stdout) continue;
    for (const line of result.stdout.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 5) continue;
      const local = fields[3] || '';
      const bracket = local.match(/^\[([^\]]+)\]:(\d+)$/);
      const plain = local.match(/^(.*):(\d+)$/);
      const address = bracket?.[1] ?? plain?.[1] ?? local;
      const port = Number(bracket?.[2] ?? plain?.[2] ?? 0);
      if (!port) continue;
      listeners.push({
        protocol,
        address,
        port,
        scope: ['127.0.0.1', '::1', 'localhost'].includes(address)
          ? 'loopback'
          : ['0.0.0.0', '*', '::'].includes(address)
            ? 'all_interfaces'
            : 'interface',
      });
    }
  }
  return listeners.sort((a, b) =>
    a.protocol.localeCompare(b.protocol) || a.port - b.port || a.address.localeCompare(b.address)
  );
}

function unitState(unit) {
  const active = boundedExec('systemctl', ['is-active', unit]);
  const enabled = boundedExec('systemctl', ['is-enabled', unit]);
  const detail = boundedExec('systemctl', [
    'show',
    unit,
    '--property=Result,ExecMainStatus,ExecMainExitTimestamp',
    '--value',
  ]);
  const detailLines = detail.stdout ? detail.stdout.split(/\r?\n/) : [];
  return {
    active: active.ok && active.stdout === 'active',
    active_state: active.stdout || active.error || 'unknown',
    enabled: enabled.ok && ['enabled', 'static', 'indirect'].includes(enabled.stdout),
    enabled_state: enabled.stdout || enabled.error || 'unknown',
    last_result: detailLines[0] || null,
    last_exit_status: detailLines[1] ? Number(detailLines[1]) : null,
    last_exit_at: detailLines[2] || null,
  };
}

function requestJson({
  protocol,
  hostname,
  port,
  path = '/health',
  servername = '',
  hostHeader = '',
  timeoutMs = 1800,
}) {
  return new Promise((resolve) => {
    const client = protocol === 'https:' ? https : http;
    const request = client.request({
      protocol,
      hostname,
      port,
      path,
      method: 'GET',
      servername: servername || undefined,
      rejectUnauthorized: protocol === 'https:',
      headers: hostHeader ? { host: hostHeader } : undefined,
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes <= 65536) chunks.push(chunk);
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch {}
        const cert = protocol === 'https:'
          ? response.socket?.getPeerCertificate?.()
          : null;
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          status: response.statusCode || null,
          body,
          tls: cert && Object.keys(cert).length ? {
            authorized: response.socket?.authorized === true,
            subject_cn: cert.subject?.CN || null,
            issuer_cn: cert.issuer?.CN || null,
            valid_from: cert.valid_from || null,
            valid_to: cert.valid_to || null,
          } : null,
          error: null,
        });
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({
      ok: false,
      status: null,
      body: null,
      tls: null,
      error: String(error?.message || error).slice(0, 240),
    }));
    request.end();
  });
}

function readJsonSafe(file, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loopbackHttpTarget(value) {
  try {
    const url = new URL(String(value || ''));
    const hostname = String(url.hostname || '').replace(/^\[|\]$/g, '');
    if (url.protocol !== 'http:') return null;
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const port = Number(url.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { hostname, port };
  } catch {
    return null;
  }
}

async function observeLocalOrganism() {
  const root = path.join(
    os.homedir(),
    '.local',
    'state',
    'evercraft',
    'organism'
  );
  const seed = readJsonSafe(path.join(root, 'compute', 'nodeseed-receipt.json'));
  const organism = readJsonSafe(path.join(root, 'local-organism-receipt.json'));
  const watch = readJsonSafe(path.join(root, 'health-watch.json'));
  const target = loopbackHttpTarget(seed?.endpoint);

  const health = target
    ? await requestJson({
        protocol: 'http:',
        hostname: target.hostname,
        port: target.port,
        path: '/v1/health',
      })
    : {
        ok: false,
        status: null,
        body: null,
        tls: null,
        error: 'loopback_nodeseed_endpoint_unavailable',
      };

  const capacity = target && health.ok
    ? await requestJson({
        protocol: 'http:',
        hostname: target.hostname,
        port: target.port,
        path: '/v1/capacity',
      })
    : {
        ok: false,
        status: null,
        body: null,
        tls: null,
        error: health.error || 'nodeseed_health_unavailable',
      };

  const remoteOperatorReady =
    capacity.body?.capacity_hint?.services?.remote_operator?.ready === true;

  return {
    configured: Boolean(seed || organism),
    state:
      health.ok === true
        ? 'healthy'
        : seed || organism
          ? 'degraded'
          : 'not_installed_or_not_observed',
    node_id: seed?.node_id || organism?.node_id || health.body?.node_id || null,
    device_fingerprint:
      seed?.device_fingerprint || organism?.device_fingerprint || null,
    nodeseed_endpoint_scope: target ? 'loopback_only' : 'unavailable_or_rejected',
    nodeseed_health: {
      ok: health.ok === true,
      status: health.status,
      runtime: health.body?.runtime || null,
      supported_workload_count:
        Array.isArray(health.body?.supported_workloads)
          ? health.body.supported_workloads.length
          : null,
      error: health.error,
    },
    capacity: {
      ok: capacity.ok === true,
      protocol: capacity.body?.protocol || null,
      placement_labels: Array.isArray(capacity.body?.placement_labels)
        ? capacity.body.placement_labels
        : [],
      remote_operator_ready: remoteOperatorReady,
      remote_operator_transport:
        capacity.body?.capacity_hint?.services?.remote_operator?.transport || null,
      public_edge_ready:
        capacity.body?.capacity_hint?.services?.public_edge?.ready === true,
      error: capacity.error,
    },
    startup_receipt: {
      remote_operator_enabled:
        organism?.remote_operator?.enabled === true,
      remote_admission_configured:
        organism?.remote_admission?.configured === true,
      remote_admission_state:
        organism?.remote_admission?.state || null,
      release_ref: organism?.release_ref || null,
      receipt_hash: organism?.receipt_hash || null,
    },
    health_watch: watch ? {
      state: watch.state || null,
      action: watch.action || null,
      observed_at: watch.observed_at || null,
      restart_attempted_at: watch.restart_attempted_at || null,
      receipt_hash: watch.receipt_hash || null,
    } : null,
    secret_material_exposed: false,
  };
}

function chromeOsBoundary(interfaces) {
  const crostiniRange = interfaces.some((row) =>
    row.family === 'IPv4' &&
    /^100\.115\.92\./.test(String(row.address || ''))
  );
  const hints = [];
  if (crostiniRange) hints.push('crostini_private_ipv4_range');
  if (safeRead('/proc/sys/kernel/osrelease').toLowerCase().includes('chromeos')) {
    hints.push('chromeos_kernel_marker');
  }
  if (fs.existsSync('/mnt/chromeos')) hints.push('chromeos_mount_present');
  if (os.hostname() === 'penguin') hints.push('default_crostini_hostname');

  return {
    likely_crostini: hints.length > 0,
    hints,
    host_port_forwarding: {
      observable_from_guest: false,
      state: 'not_observable_from_linux_guest',
      note: 'ChromeOS host port-forward toggles are outside the Crostini guest trust boundary.',
    },
  };
}

export function diagnoseNodeIngress({
  fabricLocal,
  edgeLocal,
  routerEnv = {},
  services = {},
  chromeBoundary = { likely_crostini: false },
  routerMapReceipt = null,
} = {}) {
  if (!fabricLocal?.ok) {
    return {
      state: 'fabric_loopback_unhealthy',
      next_boundary: 'evercraft_fabric_service_or_runtime',
    };
  }
  if (!edgeLocal?.ok) {
    return {
      state: 'local_https_edge_unhealthy',
      next_boundary: 'caddy_tls_or_reverse_proxy',
    };
  }
  if (
    routerEnv.EVERCRAFT_ROUTER_GATEWAY &&
    routerEnv.EVERCRAFT_ROUTER_LAN_HOST &&
    !services.router_map_timer?.active
  ) {
    return {
      state: 'router_mapping_automation_unhealthy',
      next_boundary: 'evercraft_router_map_timer',
    };
  }
  if (routerMapReceipt?.host_forward_preflight?.ready === false) {
    return {
      state: 'chromeos_host_forward_unreachable',
      next_boundary: 'chromeos_linux_port_forwarding',
    };
  }
  if (
    routerMapReceipt &&
    routerMapReceipt.host_forward_preflight?.ready === true &&
    routerMapReceipt.ok === false
  ) {
    return {
      state: 'router_port_mapping_failed',
      next_boundary: 'upnp_nat_pmp_or_pcp_mapping',
    };
  }
  if (
    routerMapReceipt?.ok === true &&
    routerMapReceipt.host_forward_preflight?.ready === true &&
    chromeBoundary.likely_crostini
  ) {
    return {
      state: 'local_ingress_chain_reasserted_external_route_unverified',
      next_boundary: 'independent_external_canary',
    };
  }
  if (chromeBoundary.likely_crostini) {
    return {
      state: 'local_stack_healthy_chromeos_boundary_unverified',
      next_boundary: 'chromeos_host_forwarding_then_external_canary',
    };
  }
  return {
    state: 'local_stack_healthy_external_route_unverified',
    next_boundary: 'independent_external_canary',
  };
}

export async function observeNodeNetwork() {
  const interfaces = interfacesFromOs();
  const routes = parseDefaultRoutes();
  const listeners = parseListeners();
  const routerEnv = parseEnvAllowlist(
    '/etc/evercraft/router-map.env',
    new Set([
      'EVERCRAFT_ROUTER_GATEWAY',
      'EVERCRAFT_ROUTER_LAN_HOST',
      'EVERCRAFT_ROUTER_REPO_ROOT',
      'EVERCRAFT_ROUTER_NODE',
    ])
  );
  const edgeEnv = parseEnvAllowlist(
    '/etc/evercraft/public-edge.env',
    new Set(['EVERCRAFT_PUBLIC_HOST'])
  );

  const publicHost = String(edgeEnv.EVERCRAFT_PUBLIC_HOST || '').trim();
  const fabricLocal = await requestJson({
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 8787,
  });
  const edgeLocal = publicHost
    ? await requestJson({
        protocol: 'https:',
        hostname: '127.0.0.1',
        port: 8443,
        servername: publicHost,
        hostHeader: publicHost,
      })
    : {
        ok: false,
        status: null,
        body: null,
        tls: null,
        error: 'public_host_not_configured',
      };

  const localOrganism = await observeLocalOrganism();
  const chromeBoundary = chromeOsBoundary(interfaces);
  const routerMapReceipt = readJsonSafe('/var/lib/evercraft/router-map/latest.json');
  const services = {
    fabric: unitState('evercraft-fabric.service'),
    public_edge: unitState('evercraft-public-edge.service'),
    router_map_timer: unitState('evercraft-router-map.timer'),
    router_map_service: unitState('evercraft-router-map.service'),
  };

  const diagnosis = diagnoseNodeIngress({
    fabricLocal,
    edgeLocal,
    routerEnv,
    services,
    chromeBoundary,
    routerMapReceipt,
  });

  const body = {
    schema: 'evercraft.node-network-observation.v1',
    observed_at: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptime_seconds: Math.floor(os.uptime()),
    },
    interfaces,
    default_routes: routes,
    listeners,
    chromeos_boundary: chromeBoundary,
    diagnosis,
    evercraft: {
      public_host: publicHost || null,
      local_organism: localOrganism,
      router_mapping: {
        configured: Boolean(
          routerEnv.EVERCRAFT_ROUTER_GATEWAY &&
          routerEnv.EVERCRAFT_ROUTER_LAN_HOST
        ),
        gateway: routerEnv.EVERCRAFT_ROUTER_GATEWAY || null,
        lan_host: routerEnv.EVERCRAFT_ROUTER_LAN_HOST || null,
        last_receipt_observed: Boolean(routerMapReceipt),
        last_result: routerMapReceipt ? {
          ok: routerMapReceipt.ok === true,
          state: routerMapReceipt.state || null,
          method: routerMapReceipt.method || null,
          external_ip: routerMapReceipt.external_ip || null,
          host_forward_ready:
            routerMapReceipt.host_forward_preflight?.ready === true,
          host_forward_probes:
            Array.isArray(routerMapReceipt.host_forward_preflight?.probes)
              ? routerMapReceipt.host_forward_preflight.probes
              : [],
          mapping_attempts:
            Array.isArray(routerMapReceipt.attempts)
              ? routerMapReceipt.attempts.map((attempt) => ({
                  method: attempt?.method || null,
                  success: attempt?.success === true,
                }))
              : [],
        } : null,
        state_is_configuration_not_external_reachability: true,
      },
      services,
      probes: {
        fabric_loopback: {
          ok: fabricLocal.ok,
          status: fabricLocal.status,
          service: fabricLocal.body?.service || null,
          version: fabricLocal.body?.version || null,
          base44_transport_enabled:
            typeof fabricLocal.body?.base44_transport_enabled === 'boolean'
              ? fabricLocal.body.base44_transport_enabled
              : null,
          error: fabricLocal.error,
        },
        hostname_aware_tls_loopback: {
          ok: edgeLocal.ok,
          status: edgeLocal.status,
          service: edgeLocal.body?.service || null,
          tls: edgeLocal.tls,
          error: edgeLocal.error,
        },
      },
      external_public_route: {
        verified: false,
        state: 'requires_external_canary',
        reason:
          'A node-local probe cannot distinguish a public-route failure from NAT hairpin behavior. Use the independent Fabric external canary.',
      },
    },
    authority: {
      read_only: true,
      mutates_network_configuration: false,
      exposes_secret_material: false,
      chromeos_host_control_claimed: false,
    },
  };

  return {
    ...body,
    receipt_hash: sha(body),
  };
}

function cliArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o640 });
  fs.renameSync(tmp, file);
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o640 });
}

const MODULE_FILE = fileURLToPath(import.meta.url);
const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(MODULE_FILE);

if (isCli) {
  const observation = await observeNodeNetwork();
  const out = cliArg('--out');
  const history = cliArg('--history');
  if (out) atomicJson(path.resolve(out), observation);
  if (history) appendJsonl(path.resolve(history), observation);
  if (!process.argv.includes('--quiet')) {
    console.log(JSON.stringify(observation, null, 2));
  }
}
