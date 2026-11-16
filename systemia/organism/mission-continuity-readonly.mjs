// Read-only source-level candidate for Systemia's existing Mission Ledger / Portfolio Sentinel.
// This does NOT admit missions, schedule work, dispatch agents, or contact hardware.
import { createHash } from 'node:crypto';

const clean = (x) => typeof x === 'string' ? x.trim() : '';
const hash = (x) => createHash('sha256').update(x).digest('hex').slice(0, 20);
const validDate = (x) => {
  const ms = Date.parse(clean(x));
  return Number.isFinite(ms) ? ms : null;
};

export function inspectMissionContinuity({
  missions,
  now = new Date(),
  staleAfterDays = 14,
} = {}) {
  if (!Array.isArray(missions)) throw new TypeError('missions_array_required');
  const observed = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(observed.getTime())) throw new TypeError('observed_time_invalid');
  if (!Number.isFinite(staleAfterDays) || staleAfterDays <= 0) {
    throw new TypeError('stale_after_days_invalid');
  }

  const rows = [];
  const seen = new Set();
  let ignored = 0;
  for (const mission of missions) {
    // This audit never promotes a proposed/discovered mission into admitted work.
    if (!mission || clean(mission.admission_state).toLowerCase() !== 'admitted') {
      ignored += 1;
      continue;
    }
    const missionId = clean(mission.mission_id);
    const isPublic = mission.visibility === 'public';
    // Never output private mission IDs, names, owners, notes, or raw evidence paths.
    const ref = isPublic && missionId ? missionId : 'private:sha256:' + hash(missionId || JSON.stringify(mission));
    const problems = [];
    if (!missionId) problems.push('mission_id_missing');
    if (missionId && seen.has(missionId)) problems.push('duplicate_mission_id');
    if (missionId) seen.add(missionId);

    const disposition = clean(mission.disposition).toLowerCase() || 'active';
    const allowed = new Set(['active', 'paused', 'blocked_needs_human', 'terminal']);
    if (!allowed.has(disposition)) problems.push('disposition_unrecognized');
    const owner = clean(mission.owner);
    const action = mission.next_action || {};
    const receipt = mission.last_work_receipt || {};
    const receiptAt = validDate(receipt.observed_at);
    const receiptRef = clean(receipt.ref);
    const dueAt = validDate(action.due_at);

    if (disposition === 'paused' || disposition === 'terminal') {
      if (!clean(mission.disposition_reason)) problems.push('disposition_reason_missing');
    } else {
      if (!owner) problems.push('owner_missing');
      if (!clean(action.description)) problems.push('next_action_missing');
      if (dueAt === null) problems.push('next_action_due_missing_or_invalid');
      else if (dueAt < observed.getTime()) problems.push('next_action_overdue');
      if (!receiptRef || receiptAt === null) problems.push('work_receipt_missing_or_invalid');
      else if (receiptAt > observed.getTime()) problems.push('work_receipt_in_future');
      else if (observed.getTime() - receiptAt > staleAfterDays * 86400000) problems.push('work_receipt_stale');
      if (disposition === 'blocked_needs_human') problems.push('explicit_human_block');
    }

    rows.push({
      mission_ref: ref,
      visibility: isPublic ? 'public' : 'private',
      disposition,
      status: problems.length ? 'needs_attention' : (
        disposition === 'active' ? 'recent_receipt_reported' : disposition
      ),
      problems: [...new Set(problems)].sort(),
    });
  }
  rows.sort((a, b) => a.mission_ref.localeCompare(b.mission_ref));
  return {
    schema: 'evercraft.systemia.mission-continuity-readonly.v0',
    observed_at: observed.toISOString(),
    source: 'caller_supplied_normalized_snapshot_not_live_systemia',
    scanned: missions.length,
    admitted: rows.length,
    ignored_not_admitted: ignored,
    attention_count: rows.filter(x => x.problems.length > 0).length,
    coverage_state: rows.length ? 'admitted_rows_inspected' : 'no_admitted_rows_unverified',
    missions: rows,
  };
}
