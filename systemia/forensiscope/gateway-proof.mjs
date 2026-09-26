import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistEvidenceGraph } from './evidence-store.mjs';
import { issueEvidenceAccessToken } from './evidence-access.mjs';
import {
  listForensiScopeGatewayTools,
  invokeForensiScopeGatewayTool
} from './agent-gateway.mjs';
import { persistForensiScopeProvenance } from './provenance.mjs';
import { revokeEvidenceGrant } from './evidence-revocation.mjs';
import { evidenceAuditPath } from './evidence-audit.mjs';

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-gateway-proof-'));
const sourceSha = crypto.createHash('sha256').update('gateway-proof-source').digest('hex');

const graph = {
  schema: 'evercraft.forensiscope.evidence-graph.v1',
  source_sha256: sourceSha,
  node_count: 2,
  edge_count: 0,
  nodes: [
    {
      id: 'segment-1',
      kind: 'transcript_segment',
      start_seconds: 0,
      end_seconds: 5,
      text: 'ForensiScope gateway proof boundary alpha.',
      engine_id: 'proof-transcriber'
    },
    {
      id: 'segment-2',
      kind: 'transcript_segment',
      start_seconds: 5,
      end_seconds: 10,
      text: 'ForensiScope gateway proof boundary beta.',
      engine_id: 'proof-transcriber'
    }
  ],
  edges: [],
  semantic_index: {
    state: 'not_configured',
    engine_id: null,
    dimensions: 0,
    entry_count: 0
  },
  comparison_index: {
    perceptual_sample_count: 0
  }
};

const stored = persistEvidenceGraph(graph, { rootDir });
const analysisReceipt = {
  schema: 'evercraft.forensiscope.analysis-receipt.v1',
  status: 'ready',
  job_id: 'gateway-proof-job',
  source: { sha256: sourceSha },
  result: {
    evidence_ref: stored.evidence_ref,
    evidence_graph_digest: stored.graph_digest
  },
  execution: {
    execution_fabric: 'gateway-proof',
    results_digest: 'sha256:' + crypto.createHash('sha256').update('results').digest('hex'),
    logical_agents: 1,
    physical_workers: 1,
    quality: { status: 'passed' }
  },
  truth_boundary: {
    source_integrity_preserved: true
  }
};
const provenance = persistForensiScopeProvenance({
  analysisReceipt,
  graph,
  rootDir
});

const tools = listForensiScopeGatewayTools();
assert.equal(tools.length, 6);
assert.deepEqual(
  tools.map((tool) => tool.name).sort(),
  [
    'forensiscope_build_context_packet',
    'forensiscope_compare_evidence',
    'forensiscope_get_duplicate_relationships',
    'forensiscope_get_timeline',
    'forensiscope_query_evidence',
    'forensiscope_verify_analysis'
  ]
);

const access = issueEvidenceAccessToken({
  evidenceRef: stored.evidence_ref,
  scopes: ['query', 'verify'],
  ttlSeconds: 3600,
  subject: 'gateway-proof-agent'
});

const query = invokeForensiScopeGatewayTool({
  name: 'forensiscope_query_evidence',
  args: {
    evidence_ref: stored.evidence_ref,
    access_token: access.access_token,
    query: 'boundary alpha',
    top_k: 2
  },
  rootDir
});
assert.equal(query.access.verified, true);
assert.ok(query.result.match_count > 0);
assert.ok(/^sha256:[a-f0-9]{64}$/.test(query.audit.event_hash));

const verification = invokeForensiScopeGatewayTool({
  name: 'forensiscope_verify_analysis',
  args: {
    evidence_ref: stored.evidence_ref,
    provenance_ref: provenance.provenance_ref,
    access_token: access.access_token
  },
  rootDir
});
assert.equal(verification.result.verified, true);
assert.equal(verification.result.privacy.transcript_text_included, false);

const ledger = fs.readFileSync(evidenceAuditPath(rootDir), 'utf8');
assert.equal(ledger.includes(access.access_token), false);
assert.equal(ledger.includes('boundary alpha'), false);

const revocation = revokeEvidenceGrant({
  grantId: access.grant_id,
  evidenceRef: stored.evidence_ref,
  reason: 'gateway-proof',
  rootDir
});
assert.ok(/^sha256:[a-f0-9]{64}$/.test(revocation.revocation_hash));
assert.throws(
  () => invokeForensiScopeGatewayTool({
    name: 'forensiscope_query_evidence',
    args: {
      evidence_ref: stored.evidence_ref,
      access_token: access.access_token,
      query: 'beta',
      top_k: 1
    },
    rootDir
  }),
  /grant has been revoked/
);

console.log(JSON.stringify({
  schema: 'evercraft.forensiscope.gateway-proof.v1',
  status: 'passed',
  tool_count: tools.length,
  evidence_ref: stored.evidence_ref,
  provenance_ref: provenance.provenance_ref,
  query_matches: query.result.match_count,
  audit_hash: query.audit.event_hash,
  revocation_hash: revocation.revocation_hash
}, null, 2));
