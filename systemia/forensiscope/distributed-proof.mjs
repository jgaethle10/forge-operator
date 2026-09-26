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
import { handleForensiScopeMcpRequest } from './mcp-protocol.mjs';
import { issueEvidenceAccessToken } from './evidence-access.mjs';
import { handleForensiScopeMcpHttp } from './mcp-http.mjs';
import { runForensiScopeAnalysis } from './pipeline.mjs';
import { compareForensiScopeEvidence } from './evidence-compare.mjs';
import { issueForensiScopeAnalysisHandoff } from './analysis-handoff.mjs';
import { evidenceAuditPath } from './evidence-audit.mjs';
import { revokeEvidenceGrant } from './evidence-revocation.mjs';

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
process.env.FORENSISCOPE_EVIDENCE_ACCESS_KEY =
  'forensiscope-ci-proof-access-key-2026-09-25-immutable';

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
process.env.FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON = JSON.stringify([
  '-e',
  'process.exit(1)'
]);
const seedFailedHealthcheck = await startNodeSeed({
  root: path.join(proofDir, 'node-failed-transcription-healthcheck'),
  nodeId: 'forensiscope-proof-node-failed-transcription-healthcheck',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});
process.env.FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON = JSON.stringify([
  '-e',
  'process.exit(0)'
]);

const mockSemanticPath = path.join(proofDir, 'mock-semantic-engine.mjs');
fs.writeFileSync(
  mockSemanticPath,
  [
    "let raw = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { raw += chunk; });",
    "process.stdin.on('end', () => {",
    "  const payload = JSON.parse(raw || '{}');",
    "  const numbers = new Map([['zero',0],['three',3],['six',6],['nine',9],['twelve',12]]);",
    "  const vectorize = (value) => {",
    "    const text = String(value || '').toLowerCase();",
    "    const v = [0,0,0,0,0,0,0,0.1];",
    "    if (text.includes('boundary') || text.includes('edge')) v[0] = 1;",
    "    const digit = text.match(/(?:^|[^0-9])(0|3|6|9|12)(?:[^0-9]|$)/)?.[1];",
    "    let number = digit === undefined ? null : Number(digit);",
    "    if (number === null) for (const [word, n] of numbers) if (text.includes(word)) { number = n; break; }",
    "    const slot = new Map([[0,1],[3,2],[6,3],[9,4],[12,5]]).get(number);",
    "    if (slot !== undefined) v[slot] = 1;",
    "    let sum = 0; for (const ch of text) sum += ch.charCodeAt(0);",
    "    v[6] = ((sum % 17) + 1) / 17;",
    "    return v;",
    "  };",
    "  console.log(JSON.stringify({ vectors: (payload.texts || []).map(vectorize) }));",
    "});"
  ].join(newline) + newline
);
process.env.FORENSISCOPE_SEMANTIC_ENABLED = 'true';
process.env.FORENSISCOPE_SEMANTIC_ENGINE_ID = 'forensiscope-ci-semantic';
process.env.FORENSISCOPE_SEMANTIC_EXECUTABLE = process.execPath;
process.env.FORENSISCOPE_SEMANTIC_ARGS_JSON = JSON.stringify([
  mockSemanticPath
]);
process.env.FORENSISCOPE_SEMANTIC_BATCH_SIZE = '64';

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

const comparisonSourcePath = path.join(sourceDir, 'synthetic-repeat-remuxed.mkv');
run('ffmpeg', [
  '-v', 'error',
  '-i', sourcePath,
  '-map', '0',
  '-c', 'copy',
  '-metadata', 'comment=forensiscope-cross-recording-proof',
  '-y',
  comparisonSourcePath
]);
const comparisonSourceHash = hashFile(comparisonSourcePath);
assert.notEqual(sourceHash, comparisonSourceHash);

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
      'scene_boundaries',
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
assert.equal(formation.logical_agents, 28);

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
      endpoints: [
        seedIneligible.endpoint,
        seedFailedHealthcheck.endpoint,
        seedA.endpoint,
        seedB.endpoint
      ],
      allocatorToken,
      maxAttempts: 3,
      maxConcurrencyPerNode: 2,
      assignmentTimeoutMs: 30000
    }
  });
} finally {
  await Promise.allSettled([
    seedIneligible.close(),
    seedFailedHealthcheck.close(),
    seedA.close(),
    seedB.close()
  ]);
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
assert.equal(receipt.scheduler_summary.counts.completed, 28);
assert.equal(receipt.pool_summary.nodes.length, 2);
assert.ok(
  receipt.pool_summary.rejected_nodes.some(
    (entry) =>
      entry.node_id === 'forensiscope-proof-node-no-transcription' &&
      entry.reason === 'missing_required_service:forensiscope_transcription'
  )
);
assert.ok(
  receipt.pool_summary.rejected_nodes.some(
    (entry) =>
      entry.node_id === 'forensiscope-proof-node-failed-transcription-healthcheck' &&
      entry.reason === 'missing_required_service:forensiscope_transcription'
  )
);
assert.equal(receipt.quality.status, 'pass');
assert.equal(receipt.reconciliation.status, 'reconciled');
assert.equal(receipt.reconciliation.source_integrity_preserved, true);
assert.equal(receipt.reconciliation.worker_statuses.media_probe_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.timeline_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.scene_boundary_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.frame_hash_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.audio_extract_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.transcription_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.provenance_guard, 4);
assert.ok(receipt.reconciliation.scene_boundaries.length > 0);
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
assert.equal(
  receipt.reconciliation.evidence_graph.indexes.scene_boundary_node_ids.length,
  receipt.reconciliation.scene_boundaries.length
);
assert.ok(receipt.reconciliation.evidence_graph.indexes.scene_boundary_node_ids.length > 0);
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
assert.equal(evidenceQuery.search_mode, 'hybrid_semantic');
assert.equal(evidenceQuery.semantic.state, 'ready');
assert.equal(evidenceQuery.semantic.engine_id, 'forensiscope-ci-semantic');

const semanticOnlyQuery = queryEvidenceGraph(
  receipt.reconciliation.evidence_graph,
  {
    query: 'edge three',
    topK: 3,
    contextRadiusSeconds: 3
  }
);
assert.equal(semanticOnlyQuery.search_mode, 'hybrid_semantic');
assert.ok(semanticOnlyQuery.match_count > 0);
assert.ok(semanticOnlyQuery.hits[0].text.includes('boundary-3'));
assert.equal(semanticOnlyQuery.hits[0].score_components.lexical_overlap, 0);
assert.ok(
  semanticOnlyQuery.hits[0].score_components.semantic_similarity > 0.9
);

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

const evidenceAccess = issueEvidenceAccessToken({
  evidenceRef: storedEvidence.evidence_ref,
  scopes: ['query', 'timeline', 'duplicates', 'context'],
  ttlSeconds: 3600,
  subject: 'forensiscope-distributed-proof'
});
assert.ok(evidenceAccess.access_token.startsWith('forensiscope-access-v1.'));
assert.deepEqual(evidenceAccess.scopes, ['context', 'duplicates', 'query', 'timeline']);

const queryOnlyAccess = issueEvidenceAccessToken({
  evidenceRef: storedEvidence.evidence_ref,
  scopes: ['query'],
  ttlSeconds: 3600,
  subject: 'forensiscope-query-only-proof'
});

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
assert.equal(gatewayTools.length, 6);
const singleEvidenceGatewayTools = gatewayTools.filter(
  (tool) => tool.name !== 'forensiscope_compare_evidence'
);
assert.equal(singleEvidenceGatewayTools.length, 5);
assert.ok(
  singleEvidenceGatewayTools.every((tool) =>
    tool.inputSchema.required.includes('evidence_ref') &&
    tool.inputSchema.required.includes('access_token')
  )
);
const compareGatewayTool = gatewayTools.find(
  (tool) => tool.name === 'forensiscope_compare_evidence'
);
assert.ok(compareGatewayTool);
assert.ok(compareGatewayTool.inputSchema.required.includes('evidence_ref_a'));
assert.ok(compareGatewayTool.inputSchema.required.includes('access_token_a'));
assert.ok(compareGatewayTool.inputSchema.required.includes('evidence_ref_b'));
assert.ok(compareGatewayTool.inputSchema.required.includes('access_token_b'));

const gatewayQuery = invokeForensiScopeGatewayTool({
  name: 'forensiscope_query_evidence',
  args: {
    evidence_ref: storedEvidence.evidence_ref,
    access_token: evidenceAccess.access_token,
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
    access_token: evidenceAccess.access_token,
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
assert.equal(gatewayPacket.access.verified, true);
assert.equal(gatewayPacket.access.required_scope, 'context');

assert.throws(
  () => invokeForensiScopeGatewayTool({
    name: 'forensiscope_build_context_packet',
    args: {
      evidence_ref: storedEvidence.evidence_ref,
      access_token: queryOnlyAccess.access_token,
      query: 'boundary-3',
      max_chars: 4000
    },
    rootDir
  }),
  /lacks required scope: context/
);

const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {
    tools: {}
  },
  'io.modelcontextprotocol/clientInfo': {
    name: 'forensiscope-ci-client',
    version: '1.0.0'
  }
};

const mcpDiscover = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'server/discover',
  params: {
    _meta: modernMeta
  }
}, { rootDir });
assert.equal(mcpDiscover.result.resultType, 'complete');
assert.ok(mcpDiscover.result.supportedVersions.includes('2026-07-28'));
assert.ok(mcpDiscover.result.supportedVersions.includes('2025-11-25'));
assert.equal(
  mcpDiscover.result._meta['io.modelcontextprotocol/serverInfo'].name,
  'forensiscope'
);

const modernToolList = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {
    _meta: modernMeta
  }
}, { rootDir });
assert.equal(modernToolList.result.resultType, 'complete');
assert.equal(modernToolList.result.tools.length, 6);
assert.ok(
  modernToolList.result.tools.some(
    (tool) => tool.name === 'forensiscope_compare_evidence'
  )
);
assert.ok(
  modernToolList.result.tools.some(
    (tool) => tool.name === 'forensiscope_verify_analysis'
  )
);

const modernToolCall = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'forensiscope_query_evidence',
    arguments: {
      evidence_ref: storedEvidence.evidence_ref,
      access_token: evidenceAccess.access_token,
      query: 'boundary-3',
      top_k: 2,
      context_radius_seconds: 3
    },
    _meta: modernMeta
  }
}, { rootDir });
assert.equal(modernToolCall.result.resultType, 'complete');
assert.equal(modernToolCall.result.isError, false);
assert.ok(modernToolCall.result.structuredContent.result.match_count > 0);
assert.equal(
  modernToolCall.result.structuredContent.evidence_ref,
  storedEvidence.evidence_ref
);

const legacyInitialize = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 4,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: {
      name: 'forensiscope-legacy-ci-client',
      version: '1.0.0'
    }
  }
}, { rootDir });
assert.equal(legacyInitialize.result.protocolVersion, '2025-11-25');
assert.equal(legacyInitialize.result.serverInfo.name, 'forensiscope');

const legacyToolList = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/list',
  params: {}
}, { rootDir });
assert.equal(legacyToolList.result.tools.length, 6);
assert.equal(legacyToolList.result.resultType, undefined);

const legacyToolCall = handleForensiScopeMcpRequest({
  jsonrpc: '2.0',
  id: 6,
  method: 'tools/call',
  params: {
    name: 'forensiscope_build_context_packet',
    arguments: {
      evidence_ref: storedEvidence.evidence_ref,
      access_token: evidenceAccess.access_token,
      query: 'boundary-3',
      max_chars: 4000,
      top_k: 3,
      context_radius_seconds: 3
    }
  }
}, { rootDir });
assert.equal(legacyToolCall.result.isError, false);
assert.ok(legacyToolCall.result.structuredContent.result.atoms.length > 0);
assert.equal(
  handleForensiScopeMcpRequest({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  }, { rootDir }),
  null
);

const modernHttpBody = {
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/call',
  params: {
    name: 'forensiscope_query_evidence',
    arguments: {
      evidence_ref: storedEvidence.evidence_ref,
      access_token: evidenceAccess.access_token,
      query: 'boundary-3',
      top_k: 2,
      context_radius_seconds: 3
    },
    _meta: modernMeta
  }
};

const modernHttp = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/call',
    'mcp-name': 'forensiscope_query_evidence',
    'mcp-param-evidence-access': evidenceAccess.access_token
  },
  body: modernHttpBody,
  rootDir
});
assert.equal(modernHttp.status, 200);
assert.equal(modernHttp.body.result.isError, false);
assert.ok(modernHttp.body.result.structuredContent.result.match_count > 0);

const modernHttpBadTokenHeader = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/call',
    'mcp-name': 'forensiscope_query_evidence',
    'mcp-param-evidence-access': queryOnlyAccess.access_token
  },
  body: modernHttpBody,
  rootDir
});
assert.equal(modernHttpBadTokenHeader.status, 400);
assert.equal(modernHttpBadTokenHeader.body.error.code, -32020);

const modernHttpBadMethodHeader = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/list',
    'mcp-name': 'forensiscope_query_evidence',
    'mcp-param-evidence-access': evidenceAccess.access_token
  },
  body: modernHttpBody,
  rootDir
});
assert.equal(modernHttpBadMethodHeader.status, 400);
assert.equal(modernHttpBadMethodHeader.body.error.code, -32020);

const legacyHttp = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json'
  },
  body: {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'forensiscope_query_evidence',
      arguments: {
        evidence_ref: storedEvidence.evidence_ref,
        access_token: evidenceAccess.access_token,
        query: 'boundary-3',
        top_k: 2,
        context_radius_seconds: 3
      }
    }
  },
  rootDir
});
assert.equal(legacyHttp.status, 200);
assert.equal(legacyHttp.body.result.isError, false);

const pipelineReceipt = await runForensiScopeAnalysis({
  source: {
    path: sourcePath,
    sha256: sourceHashAfter
  },
  authorization: {
    confirmed: true,
    scope: 'synthetic-pipeline-proof',
    authorized_by: 'forensiscope-distributed-proof',
    confirmed_at: new Date().toISOString()
  },
  jobId: 'forensiscope-single-entry-proof',
  rootDir
});
assert.equal(pipelineReceipt.schema, 'evercraft.forensiscope.analysis-receipt.v1');
assert.equal(pipelineReceipt.status, 'ready');
assert.equal(pipelineReceipt.source.sha256, sourceHashAfter);
assert.equal(pipelineReceipt.execution.quality.status, 'pass');
assert.ok(pipelineReceipt.metrics.pipeline_wall_time_ms > 0);
assert.ok(pipelineReceipt.metrics.execution_wall_time_ms > 0);
assert.ok(pipelineReceipt.metrics.media_seconds_per_execution_second > 0);
assert.ok(pipelineReceipt.metrics.evidence_graph_json_bytes > 0);
assert.ok(pipelineReceipt.metrics.transcript_chars > 0);
assert.ok(pipelineReceipt.metrics.llm_evidence_atoms > 0);
assert.ok(pipelineReceipt.metrics.comparison_samples > 0);
assert.equal(pipelineReceipt.result.transcription_state, 'transcribed');
assert.ok(pipelineReceipt.result.transcript_segments > 0);
assert.ok(/^forensiscope-evidence:sha256:[a-f0-9]{64}$/.test(
  pipelineReceipt.result.evidence_ref
));
assert.ok(/^forensiscope-provenance:sha256:[a-f0-9]{64}$/.test(
  pipelineReceipt.result.provenance_ref
));
assert.ok(/^sha256:[a-f0-9]{64}$/.test(
  pipelineReceipt.result.provenance_digest
));
assert.equal(pipelineReceipt.truth_boundary.source_path_returned, false);
assert.equal(pipelineReceipt.truth_boundary.public_machine_intake_enabled, false);
assert.equal(pipelineReceipt.truth_boundary.checkout_or_payment_created, false);

const pipelineAccess = issueEvidenceAccessToken({
  evidenceRef: pipelineReceipt.result.evidence_ref,
  scopes: ['query'],
  ttlSeconds: 3600,
  subject: 'forensiscope-pipeline-proof'
});
const pipelineQuery = invokeForensiScopeGatewayTool({
  name: 'forensiscope_query_evidence',
  args: {
    evidence_ref: pipelineReceipt.result.evidence_ref,
    access_token: pipelineAccess.access_token,
    query: 'boundary-3',
    top_k: 2,
    context_radius_seconds: 3
  },
  rootDir
});
assert.equal(pipelineQuery.access.verified, true);
assert.ok(pipelineQuery.result.match_count > 0);

assert.throws(
  () => issueForensiScopeAnalysisHandoff({
    analysisReceipt: pipelineReceipt,
    handoff: {
      confirmed: false,
      recipient: 'forensiscope-proof-agent'
    }
  }),
  /explicit confirmation/
);

const analysisHandoff = issueForensiScopeAnalysisHandoff({
  analysisReceipt: pipelineReceipt,
  handoff: {
    confirmed: true,
    recipient: 'forensiscope-proof-agent'
  },
  scopes: ['query', 'context', 'timeline', 'verify'],
  ttlSeconds: 3600
});
assert.equal(
  analysisHandoff.schema,
  'evercraft.forensiscope.analysis-handoff.v1'
);
assert.equal(
  analysisHandoff.evidence_ref,
  pipelineReceipt.result.evidence_ref
);
assert.equal(analysisHandoff.boundaries.human_confirmed, true);
assert.equal(analysisHandoff.boundaries.raw_media_included, false);
assert.equal(analysisHandoff.boundaries.source_path_included, false);
assert.equal(
  analysisHandoff.boundaries.evidence_ref_is_not_authorization_by_itself,
  true
);
assert.ok(
  analysisHandoff.tools.includes('forensiscope_build_context_packet')
);
assert.ok(
  analysisHandoff.tools.includes('forensiscope_verify_analysis')
);
assert.equal(
  analysisHandoff.provenance_ref,
  pipelineReceipt.result.provenance_ref
);

const handoffVerification = invokeForensiScopeGatewayTool({
  name: 'forensiscope_verify_analysis',
  args: {
    evidence_ref: analysisHandoff.evidence_ref,
    provenance_ref: analysisHandoff.provenance_ref,
    access_token: analysisHandoff.access.token
  },
  rootDir
});
assert.equal(
  handoffVerification.schema,
  'evercraft.forensiscope.gateway-verification-result.v1'
);
assert.equal(handoffVerification.result.verified, true);
assert.equal(
  handoffVerification.result.provenance_ref,
  analysisHandoff.provenance_ref
);
assert.equal(
  handoffVerification.result.privacy.transcript_text_included,
  false
);
assert.equal(
  handoffVerification.result.privacy.authorization_actor_included,
  false
);
assert.ok(/^sha256:[a-f0-9]{64}$/.test(
  handoffVerification.audit.event_hash
));

const handoffQuery = invokeForensiScopeGatewayTool({
  name: 'forensiscope_query_evidence',
  args: {
    evidence_ref: analysisHandoff.evidence_ref,
    access_token: analysisHandoff.access.token,
    query: 'boundary-3',
    top_k: 2,
    context_radius_seconds: 3
  },
  rootDir
});
assert.equal(handoffQuery.access.verified, true);
assert.ok(handoffQuery.result.match_count > 0);
assert.ok(/^sha256:[a-f0-9]{64}$/.test(handoffQuery.audit.event_hash));
assert.ok(/^sha256:[a-f0-9]{64}$/.test(handoffQuery.audit.request_digest));
assert.ok(/^sha256:[a-f0-9]{64}$/.test(handoffQuery.audit.result_digest));

const auditLedger = fs.readFileSync(evidenceAuditPath(rootDir), 'utf8');
assert.ok(auditLedger.includes(handoffQuery.audit.event_id));
assert.equal(auditLedger.includes(analysisHandoff.access.token), false);
assert.equal(auditLedger.includes('boundary-3'), false);
assert.equal(auditLedger.includes(mockTranscriberPath), false);

const handoffRevocation = revokeEvidenceGrant({
  grantId: analysisHandoff.access.grant_id,
  evidenceRef: analysisHandoff.evidence_ref,
  reason: 'distributed-proof-revocation',
  rootDir
});
assert.ok(/^sha256:[a-f0-9]{64}$/.test(handoffRevocation.revocation_hash));
assert.throws(
  () => invokeForensiScopeGatewayTool({
    name: 'forensiscope_query_evidence',
    args: {
      evidence_ref: analysisHandoff.evidence_ref,
      access_token: analysisHandoff.access.token,
      query: 'boundary-3',
      top_k: 1
    },
    rootDir
  }),
  /grant has been revoked/
);

const comparisonPipelineReceipt = await runForensiScopeAnalysis({
  source: {
    path: comparisonSourcePath,
    sha256: comparisonSourceHash
  },
  authorization: {
    confirmed: true,
    scope: 'synthetic-cross-recording-proof',
    authorized_by: 'forensiscope-distributed-proof',
    confirmed_at: new Date().toISOString()
  },
  jobId: 'forensiscope-cross-recording-proof',
  rootDir
});
assert.equal(comparisonPipelineReceipt.status, 'ready');
assert.equal(comparisonPipelineReceipt.source.sha256, comparisonSourceHash);
assert.notEqual(
  comparisonPipelineReceipt.result.evidence_ref,
  pipelineReceipt.result.evidence_ref
);

const comparisonGraphA = loadEvidenceGraph(
  pipelineReceipt.result.evidence_ref,
  { rootDir }
).graph;
const comparisonGraphB = loadEvidenceGraph(
  comparisonPipelineReceipt.result.evidence_ref,
  { rootDir }
).graph;
assert.ok(comparisonGraphA.comparison_index.perceptual_sample_count > 0);
assert.ok(comparisonGraphB.comparison_index.perceptual_sample_count > 0);

const crossRecording = compareForensiScopeEvidence(
  comparisonGraphA,
  comparisonGraphB
);
assert.equal(
  crossRecording.schema,
  'evercraft.forensiscope.cross-recording-comparison.v1'
);
assert.equal(crossRecording.identical_source_hash, false);
assert.ok(crossRecording.match_count > 0);
assert.ok(crossRecording.decoded_visual_matches > 0);

const comparisonAccessA = issueEvidenceAccessToken({
  evidenceRef: pipelineReceipt.result.evidence_ref,
  scopes: ['compare'],
  ttlSeconds: 3600,
  subject: 'forensiscope-compare-proof-a'
});
const comparisonAccessB = issueEvidenceAccessToken({
  evidenceRef: comparisonPipelineReceipt.result.evidence_ref,
  scopes: ['compare'],
  ttlSeconds: 3600,
  subject: 'forensiscope-compare-proof-b'
});
const gatewayComparison = invokeForensiScopeGatewayTool({
  name: 'forensiscope_compare_evidence',
  args: {
    evidence_ref_a: pipelineReceipt.result.evidence_ref,
    access_token_a: comparisonAccessA.access_token,
    evidence_ref_b: comparisonPipelineReceipt.result.evidence_ref,
    access_token_b: comparisonAccessB.access_token,
    max_matches: 100
  },
  rootDir
});
assert.equal(
  gatewayComparison.schema,
  'evercraft.forensiscope.gateway-comparison-result.v1'
);
assert.equal(gatewayComparison.access.length, 2);
assert.ok(gatewayComparison.access.every((entry) => entry.verified === true));
assert.ok(gatewayComparison.result.match_count > 0);
assert.ok(gatewayComparison.result.decoded_visual_matches > 0);

const mcpComparisonBody = {
  jsonrpc: '2.0',
  id: 9,
  method: 'tools/call',
  params: {
    name: 'forensiscope_compare_evidence',
    arguments: {
      evidence_ref_a: pipelineReceipt.result.evidence_ref,
      access_token_a: comparisonAccessA.access_token,
      evidence_ref_b: comparisonPipelineReceipt.result.evidence_ref,
      access_token_b: comparisonAccessB.access_token,
      max_matches: 100
    },
    _meta: modernMeta
  }
};
const mcpComparisonHttp = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/call',
    'mcp-name': 'forensiscope_compare_evidence',
    'mcp-param-evidence-access-a': comparisonAccessA.access_token,
    'mcp-param-evidence-access-b': comparisonAccessB.access_token
  },
  body: mcpComparisonBody,
  rootDir
});
assert.equal(mcpComparisonHttp.status, 200);
assert.equal(mcpComparisonHttp.body.result.isError, false);
assert.ok(
  mcpComparisonHttp.body.result.structuredContent.result.match_count > 0
);

const mcpComparisonBadHeader = handleForensiScopeMcpHttp({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/call',
    'mcp-name': 'forensiscope_compare_evidence',
    'mcp-param-evidence-access-a': comparisonAccessA.access_token,
    'mcp-param-evidence-access-b': comparisonAccessA.access_token
  },
  body: mcpComparisonBody,
  rootDir
});
assert.equal(mcpComparisonBadHeader.status, 400);
assert.equal(mcpComparisonBadHeader.body.error.code, -32020);

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
  scene_boundaries: receipt.reconciliation.scene_boundaries.length,
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
  evidence_query_search_mode: evidenceQuery.search_mode,
  semantic_engine_id: evidenceQuery.semantic.engine_id,
  semantic_only_query_matches: semanticOnlyQuery.match_count,
  semantic_only_query_top_id: semanticOnlyQuery.hits[0].evidence_id,
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
  evidence_access_scopes: evidenceAccess.scopes,
  gateway_access_verified: gatewayQuery.access.verified,
  gateway_access_scope: gatewayQuery.access.required_scope,
  mcp_modern_protocol: mcpDiscover.result.supportedVersions[0],
  mcp_legacy_protocol: legacyInitialize.result.protocolVersion,
  mcp_tool_count: modernToolList.result.tools.length,
  mcp_modern_query_matches: modernToolCall.result.structuredContent.result.match_count,
  mcp_legacy_context_atoms: legacyToolCall.result.structuredContent.result.atoms.length,
  mcp_http_modern_status: modernHttp.status,
  mcp_http_header_mismatch_status: modernHttpBadTokenHeader.status,
  mcp_http_header_mismatch_code: modernHttpBadTokenHeader.body.error.code,
  mcp_http_legacy_status: legacyHttp.status,
  single_entry_pipeline_state: pipelineReceipt.status,
  single_entry_evidence_ref: pipelineReceipt.result.evidence_ref,
  single_entry_transcript_segments: pipelineReceipt.result.transcript_segments,
  single_entry_query_matches: pipelineQuery.result.match_count,
  human_confirmed_handoff_tools: analysisHandoff.tools.length,
  human_confirmed_handoff_query_matches: handoffQuery.result.match_count,
  provenance_ref: pipelineReceipt.result.provenance_ref,
  provenance_verified: handoffVerification.result.verified,
  provenance_audit_hash: handoffVerification.audit.event_hash,
  evidence_access_audit_hash: handoffQuery.audit.event_hash,
  evidence_access_audit_privacy_verified: true,
  handoff_grant_revocation_hash: handoffRevocation.revocation_hash,
  handoff_grant_revocation_enforced: true,
  single_entry_pipeline_wall_ms: pipelineReceipt.metrics.pipeline_wall_time_ms,
  single_entry_execution_wall_ms: pipelineReceipt.metrics.execution_wall_time_ms,
  single_entry_media_seconds_per_execution_second:
    pipelineReceipt.metrics.media_seconds_per_execution_second,
  single_entry_evidence_graph_bytes:
    pipelineReceipt.metrics.evidence_graph_json_bytes,
  comparison_source_sha256: comparisonSourceHash,
  comparison_evidence_ref: comparisonPipelineReceipt.result.evidence_ref,
  cross_recording_matches: crossRecording.match_count,
  cross_recording_decoded_visual_matches: crossRecording.decoded_visual_matches,
  gateway_cross_recording_matches: gatewayComparison.result.match_count,
  gateway_cross_recording_decoded_visual_matches:
    gatewayComparison.result.decoded_visual_matches,
  mcp_cross_recording_matches:
    mcpComparisonHttp.body.result.structuredContent.result.match_count,
  mcp_cross_recording_header_guard: mcpComparisonBadHeader.body.error.code,
  public_machine_intake_enabled: false
};

fs.writeFileSync(
  path.join(proofDir, 'latest.json'),
  JSON.stringify(proof, null, 2) + '\n'
);

console.log(JSON.stringify(proof));
