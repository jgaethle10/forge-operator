import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readChromeOsHostBoundaryStatus } from './chromeos-host-boundary-bridge.mjs';

const REQUIRED_PORTS = [8443, 18080];

function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function readJson(file, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function cliArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o640 });
  fs.renameSync(temp, file);
}

export function certifyChromeOsHostBoundary({
  stateRoot = path.join(
    os.homedir(),
    '.local',
    'state',
    'evercraft',
    'organism',
    'chromeos-host-boundary',
  ),
  routerReceiptFile = '/var/lib/evercraft/router-map/latest.json',
  now = Date.now(),
} = {}) {
  const host = readChromeOsHostBoundaryStatus({ stateRoot, now });
  const router = readJson(routerReceiptFile);

  const hostSettingsReady =
    host.fresh === true &&
    REQUIRED_PORTS.every((port) =>
      (host.ports || []).some((row) =>
        Number(row?.port) === port &&
        String(row?.protocol || '').toUpperCase() === 'TCP' &&
        row?.present === true &&
        row?.enabled === true
      )
    );

  const lanWitnessObserved = Boolean(router?.host_forward_preflight);
  const lanWitnessReady = router?.host_forward_preflight?.ready === true;

  let state = 'host_observation_unavailable';
  if (host.fresh === true && !hostSettingsReady) {
    state = 'host_setting_not_ready';
  } else if (hostSettingsReady && !lanWitnessObserved) {
    state = 'host_setting_ready_lan_unverified';
  } else if (hostSettingsReady && !lanWitnessReady) {
    state = 'host_setting_ready_lan_unreachable';
  } else if (hostSettingsReady && lanWitnessReady) {
    state = 'host_setting_and_lan_ready';
  }

  const body = {
    schema: 'evercraft.chromeos-host-boundary-field-certification.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    observed_at: new Date(now).toISOString(),
    state,
    host_observation: {
      fresh: host.fresh === true,
      collected_at: host.collected_at || null,
      receipt_hash: host.receipt_hash || null,
      request_id: host.request_id || null,
      settings_surface_observed: host.scan?.settings_surface_observed === true,
      admitted_ports: REQUIRED_PORTS.map((port) => {
        const row = (host.ports || []).find((candidate) => Number(candidate?.port) === port);
        return {
          port,
          protocol: 'TCP',
          present: row?.present === true,
          enabled: row?.enabled === true,
        };
      }),
    },
    lan_witness: {
      observed: lanWitnessObserved,
      ready: lanWitnessReady,
      probes: Array.isArray(router?.host_forward_preflight?.probes)
        ? router.host_forward_preflight.probes.map((probe) => ({
            port: Number(probe?.port || 0) || null,
            ok: probe?.ok === true,
          }))
        : [],
    },
    ready_for_external_canary: hostSettingsReady && lanWitnessReady,
    external_public_route_verified: false,
    mutation_authority: false,
    raw_accessibility_tree_persisted: false,
  };

  return { ...body, receipt_hash: sha(body) };
}

const moduleFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(moduleFile)) {
  const receipt = certifyChromeOsHostBoundary({
    stateRoot: cliArg(
      '--state-root',
      process.env.EVERCRAFT_CHROMEOS_HOST_BOUNDARY_STATE_DIR || path.join(
        os.homedir(),
        '.local',
        'state',
        'evercraft',
        'organism',
        'chromeos-host-boundary',
      ),
    ),
    routerReceiptFile: cliArg(
      '--router-receipt',
      process.env.EVERCRAFT_ROUTER_MAP_RECEIPT || '/var/lib/evercraft/router-map/latest.json',
    ),
  });
  const out = cliArg('--out');
  if (out) atomicJson(path.resolve(out), receipt);
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(receipt.ready_for_external_canary ? 0 : 2);
}
