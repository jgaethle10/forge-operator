import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 'evercraft.kaidance.mission-snapshot.v1') {
    throw new Error('mission_snapshot_schema_invalid');
  }
  const counts = snapshot.counts || {};
  const scanned = Math.max(0, Number(counts.scanned || 0));
  const changed = Math.max(0, Number(counts.changed || 0));
  const admitted = Math.max(0, Number(counts.admitted || 0));
  const held = Math.max(0, Number(counts.held || 0));
  if (changed > scanned) throw new Error('mission_snapshot_changed_exceeds_scanned');
  if (admitted + held > changed) {
    throw new Error('mission_snapshot_disposition_exceeds_changed');
  }
  return {
    ...snapshot,
    counts: { scanned, changed, admitted, held },
    snapshot_ref: String(snapshot.snapshot_ref || ''),
    observed_at: String(snapshot.observed_at || ''),
    evidence_refs: Array.isArray(snapshot.evidence_refs)
      ? snapshot.evidence_refs.map(String).slice(0, 500)
      : [],
  };
}

export class SystemiaMissionPublisher {
  constructor({
    yard,
    deploymentId,
    configPath,
    allowedRoot,
    ledgerPath,
    clock = () => new Date(),
  } = {}) {
    if (!yard) throw new Error('yard is required');
    if (!deploymentId) throw new Error('deploymentId is required');
    if (!configPath) throw new Error('configPath is required');
    if (!ledgerPath) throw new Error('ledgerPath is required');

    this.yard = yard;
    this.deploymentId = deploymentId;
    this.configPath = path.resolve(configPath);
    this.allowedRoot = path.resolve(allowedRoot || path.dirname(this.configPath));
    this.ledgerPath = path.resolve(ledgerPath);
    this.clock = clock;
    this.timer = null;
    this.inFlight = false;

    if (!inside(this.allowedRoot, this.configPath)) {
      throw new Error('mission_publisher_config_outside_allowed_root');
    }

    this.ledger = fs.existsSync(this.ledgerPath)
      ? JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'))
      : {
          schema: 'evercraft.systemia.mission-publisher-ledger.v1',
          deployment_id: deploymentId,
          published: {},
          updated_at: null,
        };

    if (this.ledger.schema !== 'evercraft.systemia.mission-publisher-ledger.v1') {
      throw new Error('mission_publisher_ledger_invalid');
    }
    if (this.ledger.deployment_id !== deploymentId) {
      throw new Error('mission_publisher_ledger_deployment_mismatch');
    }
  }

  #readConfig() {
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    if (config.schema !== 'evercraft.kaidance.mission-fabric-config.v1') {
      throw new Error('mission_publisher_config_invalid');
    }
    return config;
  }

  async syncOnce(now = this.clock()) {
    if (this.inFlight) {
      return {
        schema: 'evercraft.systemia.mission-publisher-report.v1',
        deployment_id: this.deploymentId,
        status: 'held',
        reason: 'publisher_sync_in_flight',
        observed_at: now.toISOString(),
      };
    }

    this.inFlight = true;
    try {
      const config = this.#readConfig();
      const configDir = path.dirname(this.configPath);
      const sources = [];
      let pushed = 0;
      let unchanged = 0;
      let missing = 0;
      let invalid = 0;

      for (const source of config.sources || []) {
        const sourceKey = String(source.source_key || '').trim();
        if (!/^[a-zA-Z0-9._-]{1,96}$/.test(sourceKey)) {
          throw new Error('mission_source_key_invalid');
        }

        const sourcePath = path.resolve(configDir, String(source.path || ''));
        const report = {
          source_key: sourceKey,
          required: source.required === true,
          status: null,
          snapshot_ref: null,
          snapshot_hash: null,
          ingress_receipt_hash: null,
        };

        if (!inside(this.allowedRoot, sourcePath)) {
          report.status = 'invalid';
          report.reason = 'source_path_outside_allowed_root';
          invalid += 1;
          sources.push(report);
          continue;
        }

        if (!fs.existsSync(sourcePath)) {
          report.status = 'missing';
          report.reason = 'source_missing';
          missing += 1;
          sources.push(report);
          continue;
        }

        let snapshot;
        try {
          snapshot = validateSnapshot(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
        } catch (error) {
          report.status = 'invalid';
          report.reason = String(error?.message || error);
          invalid += 1;
          sources.push(report);
          continue;
        }

        const snapshotHash = `sha256:${sha(JSON.stringify(snapshot))}`;
        report.snapshot_ref = snapshot.snapshot_ref || null;
        report.snapshot_hash = snapshotHash;

        const previous = this.ledger.published?.[sourceKey];
        if (previous?.snapshot_hash === snapshotHash) {
          report.status = 'unchanged';
          report.ingress_receipt_hash = previous.ingress_receipt_hash || null;
          unchanged += 1;
          sources.push(report);
          continue;
        }

        const accepted = await this.yard.pushMissionSnapshot(this.deploymentId, {
          sourceKey,
          snapshot,
        });

        report.status = 'pushed';
        report.ingress_receipt_hash = accepted.receipt_hash || null;
        pushed += 1;
        this.ledger.published[sourceKey] = {
          snapshot_hash: snapshotHash,
          snapshot_ref: snapshot.snapshot_ref || null,
          ingress_receipt_hash: accepted.receipt_hash || null,
          pushed_at: now.toISOString(),
        };
        sources.push(report);
      }

      this.ledger.updated_at = now.toISOString();
      atomicJson(this.ledgerPath, this.ledger);

      const body = {
        schema: 'evercraft.systemia.mission-publisher-report.v1',
        deployment_id: this.deploymentId,
        status: invalid > 0 ? 'degraded' : 'ok',
        observed_at: now.toISOString(),
        source_count: sources.length,
        pushed,
        unchanged,
        missing,
        invalid,
        required_missing: sources
          .filter((x) => x.required && x.status === 'missing')
          .map((x) => x.source_key),
        required_invalid: sources
          .filter((x) => x.required && x.status === 'invalid')
          .map((x) => x.source_key),
        sources,
      };

      return {
        ...body,
        receipt_hash: `sha256:${sha(JSON.stringify(body))}`,
      };
    } finally {
      this.inFlight = false;
    }
  }

  start({ intervalMs = 60_000, immediate = true } = {}) {
    if (this.timer) return;
    if (immediate) this.syncOnce(this.clock()).catch(() => {});
    this.timer = setInterval(() => {
      this.syncOnce(this.clock()).catch(() => {});
    }, Math.max(5_000, Number(intervalMs || 60_000)));
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
