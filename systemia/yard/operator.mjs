import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function immutableRelease(ref) {
  const value = String(ref || '').trim();
  return /^[a-f0-9]{40,64}$/i.test(value) ||
    /^sha256:[a-f0-9]{64}$/i.test(value) ||
    /@sha256:[a-f0-9]{64}$/i.test(value);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export class YardOperator {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('stateDir is required');
    this.stateDir = path.resolve(stateDir);
    this.deployments = new Map();
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o750 });
  }

  #persist(record) {
    const safe = record.deployment_id.replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(
      path.join(this.stateDir, `${safe}.json`),
      JSON.stringify(record, null, 2) + '\n',
      { mode: 0o600 }
    );
  }

  async deployRelease({
    deploymentId,
    releaseRef,
    workloadClass,
    capacityEndpoint,
    input = {},
    rollbackTarget,
  } = {}) {
    if (!deploymentId) throw new Error('deploymentId is required');
    if (!immutableRelease(releaseRef)) throw new Error('releaseRef must be immutable');
    if (!workloadClass) throw new Error('workloadClass is required');
    if (!capacityEndpoint) throw new Error('capacityEndpoint is required');
    if (!rollbackTarget) throw new Error('rollbackTarget is required');

    const capacity = await request(`${capacityEndpoint}/v1/capacity`);
    if (capacity.protocol !== 'evercraft.capacity.v1') {
      throw new Error('capacity endpoint does not speak evercraft.capacity.v1');
    }
    if (!Array.isArray(capacity.supported_workloads) ||
        !capacity.supported_workloads.includes(workloadClass)) {
      throw new Error('requested workload is not supported by capacity offer');
    }

    const lease = await request(`${capacityEndpoint}/v1/leases`, {
      method: 'POST',
      body: JSON.stringify({ workload_class: workloadClass }),
    });

    let job;
    try {
      job = await request(`${capacityEndpoint}/v1/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          lease_id: lease.lease_id,
          token: lease.token,
          workload_class: workloadClass,
          input,
        }),
      });
    } catch (error) {
      try {
        await request(`${capacityEndpoint}/v1/leases/${lease.lease_id}`, { method: 'DELETE' });
      } catch {}
      throw error;
    }

    const body = {
      schema: 'evercraft.yard.deployment-receipt.v1',
      deployment_id: deploymentId,
      release_ref: releaseRef,
      workload_class: workloadClass,
      runtime_fabric: 'Evercraft Compute',
      capacity_protocol: capacity.protocol,
      capacity_node_id: capacity.node_id,
      lease_receipt_hash: lease.receipt?.receipt_hash || null,
      workload_receipt_hash: job.receipt?.receipt_hash || null,
      result_schema: job.result?.schema || null,
      live_url: null,
      health_verification: 'workload_completed',
      route_verification: workloadClass === 'systemia.private-core-origin.v1'
        ? 'private_origin_not_publicly_routed'
        : 'not_verified',
      rollback_target: rollbackTarget,
      deployed_at: new Date().toISOString(),
    };
    const receipt = { ...body, receipt_hash: sha(body) };

    const record = {
      deployment_id: deploymentId,
      state: 'ready',
      receipt,
      result: job.result,
      lease: {
        lease_id: lease.lease_id,
        capacity_endpoint: capacityEndpoint,
      },
      updated_at: new Date().toISOString(),
    };
    this.deployments.set(deploymentId, record);
    this.#persist(record);
    return record;
  }

  deploymentStatus(deploymentId) {
    if (this.deployments.has(deploymentId)) return this.deployments.get(deploymentId);
    const safe = String(deploymentId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = path.join(this.stateDir, `${safe}.json`);
    if (!fs.existsSync(file)) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.deployments.set(deploymentId, record);
    return record;
  }

  verifyDeployment(deploymentId) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) return { ok: false, state: 'missing' };
    const receipt = record.receipt || {};
    const ok = record.state === 'ready' &&
      receipt.runtime_fabric === 'Evercraft Compute' &&
      receipt.capacity_protocol === 'evercraft.capacity.v1' &&
      Boolean(receipt.lease_receipt_hash) &&
      Boolean(receipt.workload_receipt_hash) &&
      Boolean(receipt.rollback_target);
    return {
      ok,
      state: ok ? 'verified' : 'degraded',
      deployment_id: deploymentId,
      receipt_hash: receipt.receipt_hash || null,
    };
  }

  getLiveUrl(deploymentId) {
    return this.deploymentStatus(deploymentId)?.receipt?.live_url || null;
  }

  async rollbackRelease(deploymentId, { reason = 'operator_requested' } = {}) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) throw new Error('deployment not found');
    if (!record.receipt?.rollback_target) throw new Error('rollback target missing');

    const rollback = {
      schema: 'evercraft.yard.rollback-receipt.v1',
      deployment_id: deploymentId,
      from_release_ref: record.receipt.release_ref,
      rollback_target: record.receipt.rollback_target,
      reason,
      state: 'handoff_required',
      note: 'Yard records rollback authority; the target adapter performs restoration for its own system.',
      at: new Date().toISOString(),
    };
    rollback.receipt_hash = sha(rollback);
    record.state = 'rollback_handoff';
    record.rollback = rollback;
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return rollback;
  }
}
