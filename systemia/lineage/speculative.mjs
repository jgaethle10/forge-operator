function cleanSegment(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function speculativeBranchName({ missionId, workerId }) {
  const mission = cleanSegment(missionId);
  const worker = cleanSegment(workerId);
  if (!mission || !worker) throw new Error('missionId and workerId are required');
  return `saban/${mission}/${worker}`;
}

export async function provisionSpeculativeBranches(store, {
  missionId,
  workerIds,
  baseRef = 'HEAD'
}) {
  if (!Array.isArray(workerIds) || !workerIds.length) throw new Error('workerIds are required');
  const uniqueWorkers = [...new Set(workerIds.map((x) => String(x)))];
  const baseCommit = await store.resolveRef(baseRef);
  if (!baseCommit) throw new Error(`Cannot speculate from empty ref: ${baseRef}`);

  const branches = [];
  for (const workerId of uniqueWorkers) {
    const branch = speculativeBranchName({ missionId, workerId });
    await store.createBranch(branch, baseCommit);
    branches.push({ worker_id: workerId, branch, base_commit: baseCommit });
  }

  return {
    schema: 'evercraft.lineage.speculation-plan.v1',
    mission_id: String(missionId),
    base_ref: baseRef,
    base_commit: baseCommit,
    branches,
    publication_authority: false,
    deployment_authority: false,
    payment_authority: false
  };
}

function afterIdentity(change) {
  return change.after?.object_id ?? null;
}

export async function planReconciliation(store, {
  baseCommit,
  branches
}) {
  if (!baseCommit) throw new Error('baseCommit is required');
  if (!Array.isArray(branches) || !branches.length) throw new Error('branches are required');

  const branchDiffs = [];
  const pathTouches = new Map();

  for (const branch of branches) {
    const diff = await store.diff(baseCommit, branch);
    const changes = diff.changes.map((change) => ({
      path: change.path,
      status: change.status,
      after_object_id: afterIdentity(change)
    }));
    branchDiffs.push({ branch, changes });

    for (const change of changes) {
      if (!pathTouches.has(change.path)) pathTouches.set(change.path, []);
      pathTouches.get(change.path).push({
        branch,
        status: change.status,
        after_object_id: change.after_object_id
      });
    }
  }

  const conflicts = [];
  const equivalentOverlaps = [];

  for (const [path, touches] of pathTouches.entries()) {
    if (touches.length < 2) continue;
    const identities = new Set(touches.map((touch) => `${touch.status}:${touch.after_object_id ?? '<deleted>'}`));
    if (identities.size === 1) {
      equivalentOverlaps.push({ path, touches });
    } else {
      conflicts.push({
        path,
        touches,
        reason: 'multiple_speculative_branches_changed_same_path_differently'
      });
    }
  }

  const conflictedBranches = new Set(
    conflicts.flatMap((conflict) => conflict.touches.map((touch) => touch.branch))
  );

  return {
    schema: 'evercraft.lineage.reconciliation-plan.v1',
    base_commit: baseCommit,
    branches: branchDiffs,
    conflicts,
    equivalent_overlaps: equivalentOverlaps,
    safe_branches: branches.filter((branch) => !conflictedBranches.has(branch)),
    conflicted_branches: [...conflictedBranches].sort(),
    auto_merge_allowed: conflicts.length === 0,
    authority: {
      merge_plan_only: true,
      publication: false,
      deployment: false,
      payment: false
    }
  };
}
