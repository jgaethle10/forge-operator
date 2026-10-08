import { createHash } from 'node:crypto';
import { readGoalState, mutateGoalState } from '../organism/goal-store.mjs';
import { startGoalWork, recordGoalOutcome } from '../organism/goal-runtime.mjs';

const digest = (value) => 'sha256:' + createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const REF = /^[a-zA-Z0-9._:@/-]{1,180}$/;
const RECEIPT = /^sha256:[a-f0-9]{64}$/i;

function required(value, label) {
  const text = String(value || '').trim();
  if (!REF.test(text)) throw new Error('fabric_goal_' + label + '_invalid');
  return text;
}

/**
 * Native durable Systemia goal acknowledgment. goalStateFile is operator-side,
 * not supplied by the invoking client. This can be run again after a process
 * crash without re-dispatching a worker. An acknowledgment is not complete
 * until the Systemia goal-store commit has been re-read and validated.
 */
export function createNativeSystemiaOutcomeWriter({
  goalStateFile, clock = () => new Date(),
} = {}) {
  if (typeof goalStateFile !== 'string' || !goalStateFile.trim()) {
    throw new Error('fabric_systemia_goal_state_file_required');
  }
  return async ({
    mission_key, work_key, correlation_id,
    lineage_transaction_id, lineage_receipt_id,
    worker_receipt_digest,
  }) => {
    const mission = required(mission_key, 'mission_key');
    const work = required(work_key, 'work_key');
    const correlation = String(correlation_id || '').trim();
    const tx = required(lineage_transaction_id, 'lineage_transaction_id');
    const lineageReceipt = required(lineage_receipt_id, 'lineage_receipt_id');
    const workerHash = String(worker_receipt_digest || '').trim();
    if (!RECEIPT.test(correlation) || !RECEIPT.test(workerHash)) {
      throw new Error('fabric_goal_evidence_binding_invalid');
    }
    const evidenceKeys = [
      workerHash, 'fabric-correlation:' + correlation,
      'fabric-lineage-tx:' + tx,
    ];

    const inspect = async () => {
      const state = await readGoalState(goalStateFile);
      if (state.mission_key !== mission) throw new Error('fabric_goal_mission_mismatch');
      const task = state.tasks?.find((row) => row.work_key === work);
      if (!task) throw new Error('fabric_goal_work_not_found');
      if (task.status !== 'complete') return { done: false, state };
      if (!task.receipt_refs?.includes(lineageReceipt) ||
          !evidenceKeys.every((ref) => task.evidence_refs?.includes(ref))) {
        throw new Error('fabric_goal_completion_binding_conflict');
      }
      return { done: true, state };
    };

    const current = await inspect();
    if (!current.done) {
      const result = await mutateGoalState(goalStateFile, (state) => {
        if (state.mission_key !== mission) throw new Error('fabric_goal_mission_mismatch');
        const pending = state.tasks?.find((row) => row.work_key === work);
        if (!pending || pending.status !== 'pending') {
          throw new Error('fabric_goal_not_ready_for_completion');
        }
        return recordGoalOutcome({
          state: startGoalWork({ state, workKey: work, now: clock() }),
          workKey: work, result: 'complete', receiptRef: lineageReceipt,
          evidenceRefs: evidenceKeys, now: clock(),
        });
      }, { now: clock() });
      if (!result?.receipt?.sha256) throw new Error('fabric_goal_storage_receipt_missing');
    }
    const stored = await inspect();
    if (!stored.done) throw new Error('fabric_goal_persistent_ack_not_verified');
    const storageDigest = digest(stored.state);
    const body = {
      schema: 'evercraft.fabric.systemia-goal-ack.v1',
      mission_key: mission, work_key: work,
      correlation_id: correlation,
      lineage_transaction_id: tx,
      lineage_receipt_id: lineageReceipt,
      goal_revision: stored.state.revision,
      stored_goal_digest: storageDigest,
      durable_state: 'complete',
    };
    return {
      state: 'recorded',
      mission_key: mission, work_key: work,
      correlation_id: correlation,
      lineage_receipt_id: lineageReceipt,
      goal_state_digest: storageDigest,
      receipt_hash: digest(body),
      durable_goal_verified: true,
    };
  };
}
