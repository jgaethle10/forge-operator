import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

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
      const local = fields[4] || '';
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
  return {
    active: active.ok && active.stdout === 'active',
    active_state: active.stdout || active.error || 'unknown',
    enabled: enabled.ok && ['enabled', 'static', 'indirect'].includes(enabled.stdout),
    enabled_state: enabled.stdout || enabled.error || 'unknown',
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
    chromeos_boundary: chromeOsBoundary(interfaces),
    evercraft: {
      public_host: publicHost || null,
      router_mapping: {
        configured: Boolean(
          routerEnv.EVERCRAFT_ROUTER_GATEWAY &&
          routerEnv.EVERCRAFT_ROUTER_LAN_HOST
        ),
        gateway: routerEnv.EVERCRAFT_ROUTER_GATEWAY || null,
        lan_host: routerEnv.EVERCRAFT_ROUTER_LAN_HOST || null,
        state_is_configuration_not_external_reachability: true,
      },
      services: {
        fabric: unitState('evercraft-fabric.service'),
        public_edge: unitState('evercraft-public-edge.service'),
        router_map_timer: unitState('evercraft-router-map.timer'),
        router_map_service: unitState('evercraft-router-map.service'),
      },
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

const isCli =
  process.argv[1] &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isCli) {
  const observation = await observeNodeNetwork();
  console.log(JSON.stringify(observation, null, 2));
}
