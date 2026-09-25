#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildMultiplicationPlan,
  expandPartitionedWorkItems,
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from '../saban/multiplier.mjs';
import { recommendFormation } from '../saban/autoscaler.mjs';
import { executeDistributedMultiplicationPlan } from '../saban/distributed-executor.mjs';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { hashFile } from './authorized-source.mjs';
import { queryEvidenceGraph } from './evidence-query.mjs';
import { listForensiScopeAgentTools, invokeForensiScopeAgentTool } from './agent-tools.mjs';
import { persistEvidenceGraph, loadEvidenceGraph, verifyEvidenceRef } from './evidence-store.mjs';
import { listForensiScopeGatewayTools, invokeForensiScopeGatewayTool } from './agent-gateway.mjs';

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout).slice(-2000)}`);
  }
  return result;
}

const rootDir = process.cwd();
const sourceDir = path.resolve(rootDir, 'artifacts/forensiscope-intake/proof');
const proofDir = path.resolve(rootDir, 'artifacts/forensiscope-proof');
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

run('ffmpeg', ['-version']);
run('ffprobe', ['-version']);

const mockTranscriberPath = path.join(proofDir, 'mock-transcriber.mjs');
const newline = String.fromCharCode(10);
fs.writeFileSync(
  mockTranscriberPath,
  [
    "const duration = Number(process.argv[3] || 0);",
    "const offset = Number(process.argv[4] || 0);",
    "const first = { start_seconds: 0.2, end_seconds: Math.min(duration, 0.8), text: 'boundary-' + Math.round(offset), confidence: 0.99 };",
    "const tailStart = Math.max(0.2, duration - 0.8);",
    "const second = { start_seconds: tailStart, end_seconds: Math.min(duration, tailStart + 0.5), text: 'boundary-' + Math.round(offset + tailStart), confidence: 0.98 };",
    "console.log(JSON.stringify({segments:[first, second]}));"
  ].join(newline) + newline
);
const allocatorToken = 'forensiscope-distributed-proof-token';
const previousTranscribeEnabled = process.env.FORENSISCOPE_TRANSCRIBE_ENABLED;
delete process.env.FORENSISCOPE_TRANSCRIBE_ENABLED;
const seedIneligible = await startNodeSeed({
  root: path.join(proofDir, 'node-no-transcription'),
  nodeId: 'forensiscope-proof-node-no-transcription',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});
if (previousTranscribeEnabled !== undefined) {
  process.env.FORENSISCOPE_TRANSCRIBE_ENABLED = previousTranscribeEnabled;
}
process.env.FORENSISCOPE_TRANSCRIBE_ENABLED = 'true';
process.env.FORENSISCOPE_TRANSCRIBE_ENGINE_ID = 'forensiscope-ci-contract';
process.env.FORENSISCOPE_TRANSCRIBE_EXECUTABLE = process.execPath;
process.env.FORENSISCOPE_TRANSCRIBE_ARGS_JSON = JSON.stringify([
  mockTranscriberPath,
  '{input}',
  '{duration}',
  '{timeline_offset}'
]);

const sourcePath = path.join(sourceDir, 'synthetic-repeat.mkv');
run('ffmpeg', [
  '-v', 'error',
  '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=2:duration=4',
  '-f', 'lavfi', '-i', 'smptebars=size=160x120:rate=2:duration=4',
  '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=2:duration=4,eq=brightness=0.02',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=12',
  '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
  '-map', '[v]',
  '-map', '3:a',
  '-c:v', 'ffv1',
  '-c:a', 'pcm_s16le',
  '-y',
  sourcePath
]);

const sourceHash = hashFile(sourcePath);
const registry = loadMultiplicationRegistry();
const registeredContract = resolveMultiplicationContract('forensiscope', registry);
const proofContract = {
  ...registeredContract,
  partitioner: {
    type: 'media_time_windows',
    window_seconds: 4,
    overlap_seconds: 1
  }
};

const workItems = expandPartitionedWorkItems(proofContract, [{
  kind: 'media_job',
  key: 'forensiscope-proof',
  source_file: null,
  raw: {
    schema: 'evercraft.forensiscope.authorized-job.v1',
    duration_seconds: 12,
    source: {
      path: sourcePath,
      sha256: sourceHash
    },
    authorization: {
      confirmed: true,
      scope: 'synthetic-ci-proof',
      authorized_by: 'forensiscope-proof',
      confirmed_at: new Date().toISOString()
    },
    requested_outputs: [
      'media_probe',
      'timeline',
      'duplicate_review',
      'audio_prep',
      'source_integrity'
    ]
  }
}]);

assert.equal(workItems.length, 4);

const formation = recommendFormation({
  contract: proofContract,
  workItemCount: workItems.length
});
assert.equal(formation.strategy, 'work_conserving');
assert.equal(formation.logical_agents, 24);

const plan = buildMultiplicationPlan({
  contract: proofContract,
  logicalAgents: formation.logical_agents,
  physicalWorkers: formation.physical_workers,
  workItems
});
plan.formation_recommendation = formation;

const seedA = await startNodeSeed({
  root: path.join(proofDir, 'node-a'),
  nodeId: 'forensiscope-proof-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});
const seedB = await startNodeSeed({
  root: path.join(proofDir, 'node-b'),
  nodeId: 'forensiscope-proof-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

const sourceHashBefore = hashFile(sourcePath);
let receipt;
try {
  receipt = await executeDistributedMultiplicationPlan({
    contract: proofContract,
    plan,
    workItems,
    rootDir,
    reconcile: true,
    nodePool: {
      endpoints: [seedIneligible.endpoint, seedA.endpoint, seedB.endpoint],
      allocatorToken,
      maxAttempts: 3,
      maxConcurrencyPerNode: 2,
      assignmentTimeoutMs: 30000
    }
  });
} finally {
  await Promise.allSettled([seedIneligible.close(), seedA.close(), seedB.close()]);
}
const sourceHashAfter = hashFile(sourcePath);

if (receipt.quality?.status !== 'pass') {
  console.error(JSON.stringify({
    forensiscope_quality: receipt.quality,
    reconciliation_status: receipt.reconciliation?.status || null,
    transcription: receipt.reconciliation?.transcription || null,
    worker_statuses: receipt.reconciliation?.worker_statuses || null
  }));
}

assert.equal(sourceHashBefore, sourceHashAfter);
assert.equal(receipt.scheduler_summary.counts.completed, 24);
assert.equal(receipt.pool_summary.nodes.length, 2);
assert.ok(
  receipt.pool_summary.rejected_nodes.some(
    (entry) =>
      entry.node_id === 'forensiscope-proof-node-no-transcription' &&
      entry.reason === 'missing_required_service:forensiscope_transcription'
  )
);
assert.equal(receipt.quality.status, 'pass');
assert.equal(receipt.reconciliation.status, 'reconciled');
assert.equal(receipt.reconciliation.source_integrity_preserved, true);
assert.equal(receipt.reconciliation.worker_statuses.media_probe_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.timeline_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.frame_hash_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.audio_extract_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.transcription_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.provenance_guard, 4);
assert.ok(receipt.reconciliation.duplicate_review.perceptual_signature_count > 0);
assert.ok(receipt.reconciliation.duplicate_review.near_repeated_pairs > 0);
assert.ok(
  receipt.reconciliation.audio_assets.some(
    (entry) => entry.state === 'prepared_for_transcription'
  )
);
assert.equal(receipt.reconciliation.transcription.state, 'transcribed');
assert.deepEqual(
  receipt.reconciliation.transcription.engine_ids,
  ['forensiscope-ci-contract']
);
assert.equal(receipt.reconciliation.transcription.segment_count, 5);
assert.ok(receipt.reconciliation.transcription.text.includes('boundary-3'));
assert.equal(
  receipt.reconciliation.evidence_graph.schema,
  'evercraft.forensiscope.evidence-graph.v1'
);
assert.equal(
  receipt.reconciliation.evidence_graph.source_sha256,
  sourceHashAfter
);
assert.equal(
  receipt.reconciliation.evidence_graph.indexes.transcript_node_ids.length,
  receipt.reconciliation.transcription.segment_count
);
assert.ok(
  receipt.reconciliation.evidence_graph.llm_projection.relationship_counts.near_duplicate_of > 0
);
assert.ok(
  receipt.reconciliation.evidence_graph.nodes
    .filter((node) => node.kind === 'transcript_segment')
    .every((node) => node.engine_id === 'forensiscope-ci-contract')
);

const evidenceQuery = queryEvidenceGraph(
  receipt.reconciliation.evidence_graph,
  {
    query: 'boundary-3',
    topK: 3,
    contextRadiusSeconds: 3
  }
);
assert.equal(evidenceQuery.schema, 'evercraft.forensiscope.evidence-query-result.v1');
assert.ok(evidenceQuery.match_count > 0);
assert.ok(evidenceQuery.hits[0].text.includes('boundary-3'));
assert.equal(evidenceQuery.hits[0].source_sha256, sourceHashAfter);
assert.ok(evidenceQuery.hits[0].evidence_id);
assert.equal(evidenceQuery.answer_policy.evidence_retrieval_only, true);
assert.equal(evidenceQuery.answer_policy.unsupported_answer_generation, false);

const agentTools = listForensiScopeAgentTools();
assert.deepEqual(
  agentTools.map((tool) => tool.name).sort(),
  [
    'forensiscope_build_context_packet',
    'forensiscope_get_duplicate_relationships',
    'forensiscope_get_timeline',
    'forensiscope_query_evidence'
  ]
);

const agentEvidenceQuery = invokeForensiScopeAgentTool({
  name: 'forensiscope_query_evidence',
  args: {
    query: 'boundary-3',
    top_k: 2,
    context_radius_seconds: 3
  },
  graph: receipt.reconciliation.evidence_graph
});
assert.ok(agentEvidenceQuery.match_count > 0);
assert.equal(agentEvidenceQuery.hits[0].source_sha256, sourceHashAfter);

const agentTimeline = invokeForensiScopeAgentTool({
  name: 'forensiscope_get_timeline',
  args: {
    start_seconds: 0,
    end_seconds: 8,
    limit: 50
  },
  graph: receipt.reconciliation.evidence_graph
});
assert.ok(agentTimeline.count > 0);
assert.equal(agentTimeline.source_sha256, sourceHashAfter);

const agentDuplicates = invokeForensiScopeAgentTool({
  name: 'forensiscope_get_duplicate_relationships',
  args: {
    kind: 'near',
    limit: 50
  },
  graph: receipt.reconciliation.evidence_graph
});
assert.ok(agentDuplicates.count > 0);
assert.equal(agentDuplicates.source_sha256, sourceHashAfter);

const contextPacket = invokeForensiScopeAgentTool({
  name: 'forensiscope_build_context_packet',
  args: {
    query: 'boundary-3',
    max_chars: 4000,
    top_k: 3,
    context_radius_seconds: 3
  },
  graph: receipt.reconciliation.evidence_graph
});
assert.equal(contextPacket.schema, 'evercraft.forensiscope.context-packet.v1');
assert.equal(contextPacket.source_sha256, sourceHashAfter);
assert.ok(contextPacket.atoms.length > 0);
assert.ok(contextPacket.evidence_ids.length > 0);
assert.ok(/^sha256:[a-f0-9]{64}$/.test(contextPacket.packet_digest));
assert.ok(contextPacket.used_chars_estimate <= contextPacket.budget_chars);
assert.equal(
  contextPacket.downstream_instruction.answer_only_from_packet_or_explicitly_state_insufficient_evidence,
  true
);

const storedEvidence = persistEvidenceGraph(
  receipt.reconciliation.evidence_graph,
  { rootDir }
);
assert.ok(/^forensiscope-evidence:sha256:[a-f0-9]{64}$/.test(storedEvidence.evidence_ref));
assert.equal(storedEvidence.source_sha256, sourceHashAfter);

const loadedEvidence = loadEvidenceGraph(storedEvidence.evidence_ref, { rootDir });
assert.equal(loadedEvidence.graph.source_sha256, sourceHashAfter);
assert.equal(
  loadedEvidence.graph.node_count,
  receipt.reconciliation.evidence_graph.node_count
);

const verifiedEvidence = verifyEvidenceRef(storedEvidence.evidence_ref, { rootDir });
assert.equal(verifiedEvidence.verified, true);
assert.equal(verifiedEvidence.graph_digest, storedEvidence.graph_digest);

const persistedEvidenceQuery = invokeForensiScopeAgentTool({
  name: 'forensiscope_query_evidence',
  args: {
    query: 'boundary-3',
    top_k: 2,
    context_radius_seconds: 3
  },
  graph: loadedEvidence.graph
});
assert.ok(persistedEvidenceQuery.match_count > 0);
assert.equal(persistedEvidenceQuery.hits[0].source_sha256, sourceHashAfter);

const gatewayTools = listForensiScopeGatewayTools();
assert.equal(gatewayTools.length, 4);
assert.ok(
  gatewayTools.every((tool) =>
    tool.inputSchema.required.includes('evidence_ref')
  )
);

const gatewayQuery = invokeForensiScopeGatewayTool({
  name: 'forensiscope_query_evidence',
  args: {
    evidence_ref: storedEvidence.evidence_ref,
    query: 'boundary-3',
    top_k: 2,
    context_radius_seconds: 3
  },
  rootDir
});
assert.equal(gatewayQuery.schema, 'evercraft.forensiscope.gateway-result.v1');
assert.equal(gatewayQuery.evidence_ref, storedEvidence.evidence_ref);
assert.equal(gatewayQuery.graph_digest, storedEvidence.graph_digest);
assert.equal(gatewayQuery.authority.accepts_raw_media, false);
assert.equal(gatewayQuery.authority.starts_analysis_jobs, false);
assert.ok(gatewayQuery.result.match_count > 0);

const gatewayPacket = invokeForensiScopeGatewayTool({
  name: 'forensiscope_build_context_packet',
  args: {
    evidence_ref: storedEvidence.evidence_ref,
    query: 'boundary-3',
    max_chars: 4000,
    top_k: 3,
    context_radius_seconds: 3
  },
  rootDir
});
assert.equal(gatewayPacket.result.source_sha256, sourceHashAfter);
assert.ok(gatewayPacket.result.atoms.length > 0);
assert.ok(/^sha256:[a-f0-9]{64}$/.test(gatewayPacket.result.packet_digest));

const proof = {
  schema: 'evercraft.forensiscope.distributed-execution-proof.v1',
  status: 'pass',
  source_sha256: sourceHashAfter,
  source_unchanged: true,
  shards: workItems.length,
  logical_agents: plan.logical_agents,
  physical_workers: plan.physical_workers,
  nodeseed_count: receipt.pool_summary.nodes.length,
  rejected_ineligible_transcription_nodes: receipt.pool_summary.rejected_nodes.filter(
    (entry) => entry.reason === 'missing_required_service:forensiscope_transcription'
  ).length,
  execution_fabric: receipt.execution_fabric,
  completed_assignments: receipt.scheduler_summary.counts.completed,
  repeated_content_groups: receipt.reconciliation.duplicate_review.repeated_content_groups,
  near_repeated_pairs: receipt.reconciliation.duplicate_review.near_repeated_pairs,
  perceptual_signature_count: receipt.reconciliation.duplicate_review.perceptual_signature_count,
  timeline_entries: receipt.reconciliation.timeline.length,
  audio_shards_prepared: receipt.reconciliation.audio_assets.filter(
    (entry) => entry.state === 'prepared_for_transcription'
  ).length,
  transcription_state: receipt.reconciliation.transcription.state,
  transcription_engine_ids: receipt.reconciliation.transcription.engine_ids,
  transcript_segments: receipt.reconciliation.transcription.segment_count,
  evidence_graph_nodes: receipt.reconciliation.evidence_graph.node_count,
  evidence_graph_edges: receipt.reconciliation.evidence_graph.edge_count,
  llm_evidence_atoms: receipt.reconciliation.evidence_graph.llm_projection.transcript_atoms.length,
  evidence_query_matches: evidenceQuery.match_count,
  evidence_query_top_id: evidenceQuery.hits[0].evidence_id,
  agent_tool_count: agentTools.length,
  agent_query_matches: agentEvidenceQuery.match_count,
  agent_timeline_nodes: agentTimeline.count,
  agent_near_duplicate_relationships: agentDuplicates.count,
  context_packet_atoms: contextPacket.atoms.length,
  context_packet_digest: contextPacket.packet_digest,
  context_packet_budget_chars: contextPacket.budget_chars,
  evidence_ref: storedEvidence.evidence_ref,
  evidence_graph_digest: storedEvidence.graph_digest,
  evidence_ref_verified: verifiedEvidence.verified,
  persisted_evidence_query_matches: persistedEvidenceQuery.match_count,
  gateway_tool_count: gatewayTools.length,
  gateway_query_matches: gatewayQuery.result.match_count,
  gateway_context_packet_digest: gatewayPacket.result.packet_digest,
  gateway_accepts_raw_media: gatewayQuery.authority.accepts_raw_media,
  public_machine_intake_enabled: false
};

fs.writeFileSync(
  path.join(proofDir, 'latest.json'),
  JSON.stringify(proof, null, 2) + '\n'
);

console.log(JSON.stringify(proof));
