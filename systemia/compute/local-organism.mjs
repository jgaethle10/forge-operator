#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startNodeSeed } from './node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';

const MODULE_FILE = fileURLToPath(import.meta.url);
const CODE_ROOT = path.resolve(path.dirname(MODULE_FILE), '../..');

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function loadOrCreateSecret(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function sourceReleaseRef() {
  const explicit = String(process.env.EVERCRAFT_RELEASE_REF || '').trim();
  if (/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: CODE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[a-f0-9]{40}$/i.test(value)) return value;
  } catch {}
  const files = [
    'systemia/compute/runtime-node.mjs',
    'systemia/compute/node-seed.mjs',
    'systemia/yard/operator.mjs',
    'systemia/core/resident-supervisor.mjs',
    'systemia/collider/runtime.mjs',
  ];
  const digest = createHash('sha256');
  for (const rel of files) {
    const file = path.join(CODE_ROOT, rel);
    digest.update(rel);
    digest.update(fs.readFileSync(file));
  }
  return digest.digest('hex').slice(0, 40);
}

function nodeIdDefault() {
  return `chromebook-${os.hostname().replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

export async function startLocalOrganism({
  root,
  nodeId = nodeIdDefault(),
  releaseRef = sourceReleaseRef(),
  heartbeatTargetSeconds = 300,
  graceSeconds = 90,
} = {}) {
  if (!root) throw new Error('root is required');
  if (!/^[a-f0-9]{40}$/i.test(String(releaseRef || ''))) {
    throw new Error('releaseRef must be a 40-character immutable source reference');
  }

  const organismRoot = path.resolve(root);
  const computeRoot = path.join(organismRoot, 'compute');
  const controlRoot = path.join(computeRoot, 'control');
  const yardState = path.join(controlRoot, 'yard');
  const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
  const coreRoot = path.join(computeRoot, 'services', 'systemia-core');
  const secretFile = path.join(organismRoot, '.secrets', 'allocator-token');
  const allocatorToken = loadOrCreateSecret(secretFile);

  fs.mkdirSync(organismRoot, { recursive: true, mode: 0o700 });

  const seed = await startNodeSeed({
    root: computeRoot,
    nodeId,
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken,
    announce: false,
  });

  const yard = new YardOperator({ stateDir: yardState });
  let kaidance = null;
  let core = null;

  try {
    kaidance = await yard.deployRelease({
      deploymentId: 'kaidance-local-resident',
      releaseRef,
      workloadClass: 'systemia.kaidance-collider.v1',
      capacityEndpoint: seed.endpoint,
      allocatorToken,
      input: {
        state_root: kaidanceRoot,
        mission_source_policies: [
          {
            source_key: 'legacy-rescue-opportunity-watch',
            required: false,
            stale_after_seconds: 900,
          },
          {
            source_key: 'node001-megatron-field-certification',
            required: true,
            stale_after_seconds: 900,
          },
        ],
        heartbeat_target_seconds: heartbeatTargetSeconds,
        grace_seconds: graceSeconds,
      },
      rollbackTarget: 'local-organism:kaidance-previous',
      leaseTtlMs: 3_600_000,
    });
    yard.startContinuityKeeper('kaidance-local-resident', {
      leaseTtlMs: 3_600_000,
      renewEveryMs: 1_800_000,
      checkpointEveryMs: 60_000,
    });

    core = await yard.deployRelease({
      deploymentId: 'systemia-core-local-resident',
      releaseRef,
      workloadClass: 'systemia.core-supervisor.v1',
      capacityEndpoint: seed.endpoint,
      allocatorToken,
      input: {
        state_root: coreRoot,
        yard_state_dir: yardState,
        kaidance_deployment_id: 'kaidance-local-resident',
      },
      rollbackTarget: 'local-organism:core-previous',
      leaseTtlMs: 3_600_000,
    });
    yard.startLeaseKeeper('systemia-core-local-resident', {
      ttlMs: 3_600_000,
      renewEveryMs: 1_800_000,
    });

    const kaidanceRoute = await yard.verifyRoute('kaidance-local-resident');
    const coreRoute = await yard.verifyRoute('systemia-core-local-resident');
    if (!kaidanceRoute.ok || !coreRoute.ok) {
      throw new Error('local organism route verification failed');
    }

    const pulse = await yard.getKaidancePulse('kaidance-local-resident');
    const body = {
      schema: 'evercraft.local-organism-receipt.v1',
      node_id: seed.node_id,
      device_fingerprint: seed.device_fingerprint,
      runtime: 'Evercraft Compute',
      deployment_surface: 'Yard Operator',
      release_ref: releaseRef,
      public_ingress: false,
      node_endpoint_scope: 'loopback_only',
      kaidance: {
        deployment_receipt: kaidance.receipt.receipt_hash,
        state: pulse.state,
        cycle_number: pulse.cycle_number,
        field_attestation: pulse.field_attestation.state,
      },
      systemia_core: {
        deployment_receipt: core.receipt.receipt_hash,
        supervised_service_count: coreRoute.health.service_count,
        state: coreRoute.state,
      },
      physical_field_certification_claimed: false,
      named_cloud_required: false,
      started_at: new Date().toISOString(),
    };
    const receipt = {
      ...body,
      receipt_hash: `sha256:${sha(body)}`,
    };
    atomicJson(path.join(organismRoot, 'local-organism-receipt.json'), receipt);

    return {
      schema: 'evercraft.local-organism.v1',
      root: organismRoot,
      release_ref: releaseRef,
      seed,
      yard,
      kaidance,
      core,
      pulse,
      receipt,
      health: async () => {
        const [kaidanceHealth, coreHealth] = await Promise.all([
          yard.verifyRoute('kaidance-local-resident'),
          yard.verifyRoute('systemia-core-local-resident'),
        ]);
        return {
          schema: 'evercraft.local-organism-health.v1',
          node_id: seed.node_id,
          ok: kaidanceHealth.ok && coreHealth.ok,
          kaidance: {
            ok: kaidanceHealth.ok,
            state: kaidanceHealth.state,
          },
          systemia_core: {
            ok: coreHealth.ok,
            state: coreHealth.state,
          },
          observed_at: new Date().toISOString(),
        };
      },
      close: async () => {
        yard.stopLeaseKeeper('systemia-core-local-resident');
        yard.stopContinuityKeeper('kaidance-local-resident');
        try {
          await yard.stopDeployment('systemia-core-local-resident', {
            reason: 'local_organism_shutdown',
          });
        } catch {}
        try {
          await yard.stopDeployment('kaidance-local-resident', {
            reason: 'local_organism_shutdown',
          });
        } catch {}
        await seed.close();
      },
    };
  } catch (error) {
    if (core) {
      try {
        await yard.stopDeployment('systemia-core-local-resident', {
          reason: 'local_organism_start_failed',
        });
      } catch {}
    }
    if (kaidance) {
      try {
        await yard.stopDeployment('kaidance-local-resident', {
          reason: 'local_organism_start_failed',
        });
      } catch {}
    }
    await seed.close();
    throw error;
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === MODULE_FILE;
if (isCli) {
  const root = path.resolve(
    arg('--root', path.join(os.homedir(), '.local', 'state', 'evercraft', 'organism'))
  );
  const organism = await startLocalOrganism({
    root,
    nodeId: arg('--node-id', nodeIdDefault()),
    releaseRef: arg('--release-ref', sourceReleaseRef()),
  });

  console.log(JSON.stringify({
    schema: organism.schema,
    node_id: organism.seed.node_id,
    device_fingerprint: organism.seed.device_fingerprint,
    release_ref: organism.release_ref,
    kaidance_state: organism.pulse.state,
    kaidance_field_attestation: organism.pulse.field_attestation.state,
    systemia_core_state: organism.receipt.systemia_core.state,
    public_ingress: false,
    named_cloud_required: false,
    receipt_hash: organism.receipt.receipt_hash,
  }, null, 2));

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await organism.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
