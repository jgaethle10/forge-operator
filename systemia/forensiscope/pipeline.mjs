import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  buildMultiplicationPlan,
  executeMultiplicationPlan,
  expandPartitionedWorkItems,
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from '../saban/multiplier.mjs';
import { recommendFormation } from '../saban/autoscaler.mjs';
import { admitMultiplicationRequest } from '../saban/admission.mjs';
import { executeDistributedMultiplicationPlan } from '../saban/distributed-executor.mjs';
import { validateAuthorizedMediaSource } from './authorized-source.mjs';
import { persistEvidenceGraph } from './evidence-store.mjs';

function probeDurationSeconds(sourcePath) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    sourcePath
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(
      'ForensiScope could not determine media duration: ' +
      String(result.stderr || result.stdout || '').trim().slice(-1000)
    );
  }

  const duration = Number(String(result.stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('ForensiScope media duration is missing or invalid.');
  }
  return duration;
}

function defaultJobId(sourceSha256) {
  return 'forensiscope-' + crypto
    .createHash('sha256')
    .update(String(sourceSha256 || ''))
    .digest('hex')
    .slice(0, 20);
}

function summarizeExecution(execution) {
  return {
    execution_fabric: execution.execution_fabric || 'local_saban_worker_pool',
    logical_agents: execution.logical_agents,
    physical_workers: execution.physical_workers,
    work_item_count: execution.work_item_count,
    results_digest: execution.results_digest,
    scheduler_summary: execution.scheduler_summary,
    quality: execution.quality,
    pool_summary: execution.pool_summary || null
  };
}

export async function runForensiScopeAnalysis({
  source,
  authorization,
  requestedOutputs = [
    'media_probe',
    'timeline',
    'scene_boundaries',
    'duplicate_review',
    'transcription',
    'source_integrity',
    'evidence_graph'
  ],
  jobId = null,
  nodePool = null,
  rootDir = process.cwd()
} = {}) {
  const pipelineStartedAtMs = Date.now();
  const admittedSource = validateAuthorizedMediaSource(
    {
      source,
      authorization
    },
    { rootDir }
  );
  const durationSeconds = probeDurationSeconds(admittedSource.path);
  const registry = loadMultiplicationRegistry();
  const contract = resolveMultiplicationContract('forensiscope', registry);
  const resolvedJobId = String(jobId || defaultJobId(admittedSource.sha256));

  const workItems = expandPartitionedWorkItems(contract, [{
    kind: 'media_job',
    key: resolvedJobId,
    source_file: null,
    raw: {
      schema: 'evercraft.forensiscope.authorized-job.v1',
      job_id: resolvedJobId,
      duration_seconds: durationSeconds,
      source: {
        path: admittedSource.path,
        sha256: admittedSource.sha256
      },
      authorization: admittedSource.authorization,
      requested_outputs: [...new Set(requestedOutputs.map((value) => String(value)))]
    }
  }]);

  const formation = recommendFormation({
    contract,
    workItemCount: workItems.length
  });
  const admission = admitMultiplicationRequest({
    contract,
    requestedLogicalAgents: formation.logical_agents,
    requestedPhysicalWorkers: formation.physical_workers,
    requestedWorkItems: workItems.length,
    requestedAttempts: contract.max_attempts_per_job || 3,
    budget: contract.budget || {}
  });
  if (!admission.admitted) {
    throw new Error(`ForensiScope Saban admission denied: ${admission.reason}`);
  }

  const plan = buildMultiplicationPlan({
    contract,
    logicalAgents: admission.grant.logical_agents,
    physicalWorkers: admission.grant.physical_workers,
    workItems
  });
  plan.admission = admission;
  plan.formation_recommendation = formation;

  const distributed =
    nodePool &&
    (nodePool.discover === true ||
      (Array.isArray(nodePool.endpoints) && nodePool.endpoints.length > 0));

  const executionStartedAtMs = Date.now();
  const execution = distributed
    ? await executeDistributedMultiplicationPlan({
        contract,
        plan,
        workItems,
        rootDir,
        reconcile: true,
        nodePool
      })
    : await executeMultiplicationPlan({
        contract,
        plan,
        workItems,
        rootDir,
        reconcile: true
      });

  if (execution.quality?.status !== 'pass') {
    const failures = execution.quality?.failures || [];
    throw new Error(
      'ForensiScope analysis failed its quality contract: ' +
      JSON.stringify(failures)
    );
  }
  if (
    execution.reconciliation?.status !== 'reconciled' ||
    !execution.reconciliation?.evidence_graph
  ) {
    throw new Error('ForensiScope analysis completed without a reconciled evidence graph.');
  }

  const evidence = persistEvidenceGraph(
    execution.reconciliation.evidence_graph,
    { rootDir }
  );
  const completedAtMs = Date.now();
  const executionWallMs = Math.max(1, completedAtMs - executionStartedAtMs);
  const pipelineWallMs = Math.max(1, completedAtMs - pipelineStartedAtMs);
  const evidenceGraphBytes = Buffer.byteLength(
    JSON.stringify(execution.reconciliation.evidence_graph),
    'utf8'
  );
  const transcriptChars = String(
    execution.reconciliation.transcription?.text || ''
  ).length;

  return {
    schema: 'evercraft.forensiscope.analysis-receipt.v1',
    status: 'ready',
    job_id: resolvedJobId,
    source: {
      sha256: admittedSource.sha256,
      size_bytes: admittedSource.size_bytes,
      duration_seconds: durationSeconds,
      extension: admittedSource.extension
    },
    authorization: {
      confirmed: true,
      scope: admittedSource.authorization.scope,
      authorized_by: admittedSource.authorization.authorized_by,
      confirmed_at: admittedSource.authorization.confirmed_at
    },
    requested_outputs: [...new Set(requestedOutputs.map((value) => String(value)))],
    formation: {
      logical_agents: plan.logical_agents,
      physical_workers: plan.physical_workers,
      work_items: workItems.length,
      strategy: formation.strategy
    },
    execution: summarizeExecution(execution),
    metrics: {
      pipeline_wall_time_ms: pipelineWallMs,
      execution_wall_time_ms: executionWallMs,
      media_duration_seconds: durationSeconds,
      media_seconds_per_execution_second: Number(
        (durationSeconds / (executionWallMs / 1000)).toFixed(6)
      ),
      source_size_bytes: admittedSource.size_bytes,
      source_bytes_per_execution_second: Number(
        (admittedSource.size_bytes / (executionWallMs / 1000)).toFixed(3)
      ),
      evidence_graph_json_bytes: evidenceGraphBytes,
      source_to_evidence_byte_ratio:
        evidenceGraphBytes > 0
          ? Number((admittedSource.size_bytes / evidenceGraphBytes).toFixed(6))
          : null,
      transcript_chars: transcriptChars,
      llm_evidence_atoms: Number(
        execution.reconciliation.evidence_graph?.llm_projection?.transcript_atoms?.length || 0
      ),
      comparison_samples: Number(
        execution.reconciliation.evidence_graph?.comparison_index?.perceptual_sample_count || 0
      )
    },
    result: {
      evidence_ref: evidence.evidence_ref,
      evidence_graph_digest: evidence.graph_digest,
      node_count: evidence.node_count,
      edge_count: evidence.edge_count,
      transcription_state: execution.reconciliation.transcription?.state || null,
      transcript_segments: Number(execution.reconciliation.transcription?.segment_count || 0),
      timeline_entries: Number(execution.reconciliation.timeline?.length || 0),
      scene_boundaries: Number(execution.reconciliation.scene_boundaries?.length || 0),
      near_repeated_pairs: Number(
        execution.reconciliation.duplicate_review?.near_repeated_pairs || 0
      )
    },
    truth_boundary: {
      source_path_returned: false,
      source_integrity_preserved:
        execution.reconciliation.source_integrity_preserved === true,
      public_machine_intake_enabled: false,
      checkout_or_payment_created: false
    }
  };
}
