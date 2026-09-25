import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

export class YardContinuitySupervisor {
  constructor({
    yard,
    deploymentId,
    discovery = {},
    allocatorToken = '',
    allocatorTokens = {},
    input = {},
    inputByNode = {},
    endpointTimeoutMs = 750,
    leaseTtlMs = 3_600_000,
    intervalMs = 30_000,
  } = {}) {
    if (!yard) throw new Error('yard is required');
    if (!deploymentId) throw new Error('deploymentId is required');
    this.yard = yard;
    this.deploymentId = deploymentId;
    this.discovery = discovery;
    this.allocatorToken = allocatorToken;
    this.allocatorTokens = allocatorTokens;
    this.input = input;
    this.inputByNode = inputByNode;
    this.endpointTimeoutMs = endpointTimeoutMs;
    this.leaseTtlMs = leaseTtlMs;
    this.intervalMs = Math.max(1_000, Number(intervalMs || 30_000));
    this.timer = null;
    this.inFlight = false;
    this.sequence = 0;
    this.lastResult = null;
  }

  #result(action, data = {}) {
    const body = {
      schema: 'evercraft.yard.continuity-supervisor-result.v1',
      deployment_id: this.deploymentId,
      sequence: ++this.sequence,
      action,
      observed_at: new Date().toISOString(),
      ...data,
    };
    const result = { ...body, receipt_hash: sha(body) };
    this.lastResult = result;
    return result;
  }

  async tick() {
    if (this.inFlight) {
      return this.#result('hold', { reason: 'supervisor_tick_in_flight' });
    }
    this.inFlight = true;

    try {
      const record = this.yard.deploymentStatus(this.deploymentId);
      if (!record) {
        return this.#result('hold', { reason: 'deployment_missing' });
      }

      const route = await this.yard.verifyRoute(this.deploymentId);
      if (route.ok) {
        let checkpoint = null;
        let renewal = null;

        try {
          checkpoint = await this.yard.checkpointDeployment(this.deploymentId);
        } catch (error) {
          return this.#result('hold', {
            reason: 'checkpoint_failed',
            node_id: record.receipt?.capacity_node_id || null,
            detail: String(error?.message || error),
          });
        }

        try {
          renewal = await this.yard.renewDeploymentLease(this.deploymentId, {
            ttlMs: this.leaseTtlMs,
          });
        } catch (error) {
          return this.#result('hold', {
            reason: 'lease_renewal_failed',
            node_id: record.receipt?.capacity_node_id || null,
            checkpoint_receipt: checkpoint.receipt_hash,
            detail: String(error?.message || error),
          });
        }

        return this.#result('healthy', {
          node_id: record.receipt?.capacity_node_id || null,
          health_state: route.state,
          checkpoint_receipt: checkpoint.receipt_hash,
          lease_renewal_receipt: renewal.receipt_hash,
        });
      }

      let rebound;
      try {
        rebound = await this.yard.rebindDiscoveredRelease({
          deploymentId: this.deploymentId,
          allocatorToken: this.allocatorToken,
          allocatorTokens: this.allocatorTokens,
          discovery: this.discovery,
          endpointTimeoutMs: this.endpointTimeoutMs,
          leaseTtlMs: this.leaseTtlMs,
          input: this.input,
          inputByNode: this.inputByNode,
        });
      } catch (error) {
        return this.#result('hold', {
          reason: 'rebind_failed',
          previous_node_id: record.receipt?.capacity_node_id || null,
          previous_route_state: route.state,
          detail: String(error?.message || error),
        });
      }

      const verified = await this.yard.verifyRoute(this.deploymentId);
      if (!verified.ok) {
        return this.#result('hold', {
          reason: 'rebound_health_failed',
          previous_node_id: record.receipt?.capacity_node_id || null,
          rebound_node_id: rebound.receipt?.capacity_node_id || null,
          rebound_deployment_receipt: rebound.receipt?.receipt_hash || null,
          health_state: verified.state,
        });
      }

      let checkpoint;
      try {
        checkpoint = await this.yard.checkpointDeployment(this.deploymentId);
      } catch (error) {
        return this.#result('hold', {
          reason: 'rebound_checkpoint_failed',
          rebound_node_id: rebound.receipt?.capacity_node_id || null,
          rebound_deployment_receipt: rebound.receipt?.receipt_hash || null,
          detail: String(error?.message || error),
        });
      }

      return this.#result('rebound', {
        previous_node_id: record.receipt?.capacity_node_id || null,
        previous_route_state: route.state,
        rebound_node_id: rebound.receipt?.capacity_node_id || null,
        rebound_deployment_receipt: rebound.receipt?.receipt_hash || null,
        resolver_receipt: rebound.discovery?.receipt_hash || null,
        continuity_checkpoint_receipt: checkpoint.receipt_hash,
        health_state: verified.state,
      });
    } finally {
      this.inFlight = false;
    }
  }

  start({ immediate = true } = {}) {
    if (this.timer) return;
    if (immediate) this.tick().catch(() => {});
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
