import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

const SAFE_HOLD_CATEGORIES = new Set([
  'remote_device_trust',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values, limit = 500) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function validateSafeHold(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('mission_snapshot_safe_hold_invalid');
  }
  const category = clean(value.category).toLowerCase();
  if (!SAFE_HOLD_CATEGORIES.has(category)) {
    throw new Error('mission_snapshot_safe_hold_category_not_allowed');
  }
  const rawCount = Number(value.count);
  if (!Number.isFinite(rawCount) || rawCount < 0) {
    throw new Error('mission_snapshot_safe_hold_count_invalid');
  }
  const count = Math.min(9999, Math.floor(rawCount));
  return count > 0 ? { category, count } : null;
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
    scanned,
    changed,
    admitted,
    held,
    snapshot_ref: clean(snapshot.snapshot_ref),
    observed_at: clean(snapshot.observed_at),
    evidence_refs: unique(snapshot.evidence_refs || []),
    safe_hold: validateSafeHold(snapshot.safe_hold),
  };
}

function syntheticHold(sourceKey, reason, now) {
  return {
    scanned: 1,
    changed: 1,
    admitted: 0,
    held: 1,
    snapshot_ref: `hold:${sourceKey}:${reason}`,
    observed_at: now.toISOString(),
    evidence_refs: [`mission-source:${sourceKey}:${reason}`],
  };
}

export function aggregateMissionSnapshots({
  config,
  configDir = process.cwd(),
  allowedRoot = configDir,
  now = new Date(),
} = {}) {
  if (!config || config.schema !== 'evercraft.kaidance.mission-fabric-config.v1') {
    throw new Error('mission_fabric_config_invalid');
  }
  const root = path.resolve(allowedRoot);
  const base = path.resolve(configDir);
  if (!inside(root, base)) throw new Error('mission_fabric_config_outside_allowed_root');

  const sourceReports = [];
  const accepted = [];

  for (const source of config.sources || []) {
    const sourceKey = clean(source.source_key);
    if (!sourceKey) throw new Error('mission_source_key_required');
    const required = source.required === true;
    const staleAfterSeconds = Math.max(30, Number(source.stale_after_seconds || 900));
    const sourcePath = path.resolve(base, clean(source.path));

    const report = {
      source_key: sourceKey,
      required,
      path_ref: `relative:${path.relative(root, sourcePath)}`,
      status: null,
      reason: null,
      snapshot_ref: null,
      observed_at: null,
    };

    if (!inside(root, sourcePath)) {
      report.status = 'rejected';
      report.reason = 'source_path_outside_allowed_root';
      sourceReports.push(report);
      if (required) accepted.push(syntheticHold(sourceKey, report.reason, now));
      continue;
    }

    if (!fs.existsSync(sourcePath)) {
      report.status = 'missing';
      report.reason = 'source_missing';
      sourceReports.push(report);
      if (required) accepted.push(syntheticHold(sourceKey, report.reason, now));
      continue;
    }

    try {
      const snapshot = validateSnapshot(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
      const observedMs = Date.parse(snapshot.observed_at);
      const stale = !Number.isFinite(observedMs) ||
        now.getTime() - observedMs > staleAfterSeconds * 1000;

      if (stale) {
        report.status = 'stale';
        report.reason = 'source_stale';
        report.snapshot_ref = snapshot.snapshot_ref || null;
        report.observed_at = snapshot.observed_at || null;
        sourceReports.push(report);
        if (required) accepted.push(syntheticHold(sourceKey, report.reason, now));
        continue;
      }

      report.status = 'accepted';
      report.snapshot_ref = snapshot.snapshot_ref || null;
      report.observed_at = snapshot.observed_at || null;
      report.safe_hold = snapshot.safe_hold || null;
      sourceReports.push(report);
      accepted.push({
        ...snapshot,
        evidence_refs: [
          ...snapshot.evidence_refs,
          `mission-source:${sourceKey}:accepted`,
        ],
      });
    } catch (error) {
      report.status = 'invalid';
      report.reason = String(error?.message || error);
      sourceReports.push(report);
      if (required) accepted.push(syntheticHold(sourceKey, report.reason, now));
    }
  }

  const counts = accepted.reduce((acc, source) => ({
    scanned: acc.scanned + source.scanned,
    changed: acc.changed + source.changed,
    admitted: acc.admitted + source.admitted,
    held: acc.held + source.held,
  }), { scanned: 0, changed: 0, admitted: 0, held: 0 });

  const safeHoldMap = new Map();
  for (const source of accepted) {
    if (!source.safe_hold) continue;
    const category = source.safe_hold.category;
    safeHoldMap.set(
      category,
      (safeHoldMap.get(category) || 0) + source.safe_hold.count
    );
  }
  const safeHolds = [...safeHoldMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const refBody = sourceReports.map((row) => ({
    source_key: row.source_key,
    status: row.status,
    snapshot_ref: row.snapshot_ref,
  }));

  const snapshot = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: `mission-fabric:sha256:${sha(refBody)}`,
    observed_at: now.toISOString(),
    counts,
    evidence_refs: unique(accepted.flatMap((source) => source.evidence_refs || [])),
  };

  const reportBody = {
    schema: 'evercraft.kaidance.mission-fabric-report.v1',
    observed_at: now.toISOString(),
    source_count: sourceReports.length,
    accepted_count: sourceReports.filter((x) => x.status === 'accepted').length,
    degraded_required_sources: sourceReports
      .filter((x) => x.required && x.status !== 'accepted')
      .map((x) => ({
        source_key: x.source_key,
        status: x.status,
        reason: x.reason,
      })),
    sources: sourceReports,
    aggregate_snapshot_ref: snapshot.snapshot_ref,
    counts,
    safe_holds: safeHolds,
  };

  return {
    snapshot,
    report: {
      ...reportBody,
      receipt_hash: `sha256:${sha(reportBody)}`,
    },
  };
}

export function aggregateMissionSnapshotsFromConfig({
  configPath,
  allowedRoot,
  now = new Date(),
} = {}) {
  if (!configPath) throw new Error('configPath is required');
  const resolved = path.resolve(configPath);
  const root = path.resolve(allowedRoot || path.dirname(resolved));
  if (!inside(root, resolved)) throw new Error('mission_fabric_config_outside_allowed_root');
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return aggregateMissionSnapshots({
    config,
    configDir: path.dirname(resolved),
    allowedRoot: root,
    now,
  });
}
