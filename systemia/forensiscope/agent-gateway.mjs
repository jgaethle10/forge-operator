import { loadEvidenceGraph } from './evidence-store.mjs';
import { verifyEvidenceAccessToken } from './evidence-access.mjs';
import {
  listForensiScopeAgentTools,
  invokeForensiScopeAgentTool
} from './agent-tools.mjs';

const TOOL_SCOPES = Object.freeze({
  forensiscope_query_evidence: 'query',
  forensiscope_build_context_packet: 'context',
  forensiscope_get_timeline: 'timeline',
  forensiscope_get_duplicate_relationships: 'duplicates'
});

function withEvidenceRef(tool) {
  const schema = structuredClone(tool.inputSchema || { type: 'object', properties: {} });
  schema.type = 'object';
  schema.additionalProperties = false;
  schema.properties = {
    evidence_ref: {
      type: 'string',
      pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}
  };
  schema.required = [...new Set(['evidence_ref', 'access_token', ...(schema.required || [])])];
  return {
    ...structuredClone(tool),
    inputSchema: schema
  };
}

export function listForensiScopeGatewayTools() {
  return listForensiScopeAgentTools().map(withEvidenceRef);
}

export function invokeForensiScopeGatewayTool({
  name,
  args = {},
  rootDir = process.cwd()
} = {}) {
  const evidenceRef = String(args.evidence_ref || '');
  const accessToken = String(args.access_token || '');
  if (!evidenceRef) throw new Error('ForensiScope gateway requires evidence_ref.');
  if (!accessToken) throw new Error('ForensiScope gateway requires access_token.');

  const requiredScope = TOOL_SCOPES[name];
  if (!requiredScope) throw new Error(`Unsupported ForensiScope gateway tool: ${String(name || '')}`);

  const access = verifyEvidenceAccessToken(accessToken, {
    evidenceRef,
    requiredScope
  });
  const loaded = loadEvidenceGraph(evidenceRef, { rootDir });
  const toolArgs = { ...args };
  delete toolArgs.evidence_ref;
  delete toolArgs.access_token;

  const result = invokeForensiScopeAgentTool({
    name,
    args: toolArgs,
    graph: loaded.graph
  });

  return {
    schema: 'evercraft.forensiscope.gateway-result.v1',
    tool: name,
    evidence_ref: loaded.evidence_ref,
    graph_digest: loaded.graph_digest,
    source_sha256: loaded.graph.source_sha256,
    access: {
      verified: access.verified,
      required_scope: access.required_scope,
      expires_at_unix: access.expires_at_unix
    },
    result,
    authority: {
      completed_evidence_query_only: true,
      accepts_raw_media: false,
      starts_analysis_jobs: false,
      creates_checkout: false,
      creates_payment_obligation: false
    }
  };
}
,
      description: 'Immutable reference for a completed, authorized ForensiScope evidence graph.'
    },
    access_token: {
      type: 'string',
      minLength: 64,
      'x-mcp-header': 'Evidence-Access',
      description: 'Scoped, expiring ForensiScope evidence-access capability for this evidence_ref.'
    },
    ...(schema.properties || {})
  };
  schema.required = [...new Set(['evidence_ref', ...(schema.required || [])])];
  return {
    ...structuredClone(tool),
    inputSchema: schema
  };
}

export function listForensiScopeGatewayTools() {
  return listForensiScopeAgentTools().map(withEvidenceRef);
}

export function invokeForensiScopeGatewayTool({
  name,
  args = {},
  rootDir = process.cwd()
} = {}) {
  const evidenceRef = String(args.evidence_ref || '');
  if (!evidenceRef) throw new Error('ForensiScope gateway requires evidence_ref.');

  const loaded = loadEvidenceGraph(evidenceRef, { rootDir });
  const toolArgs = { ...args };
  delete toolArgs.evidence_ref;

  const result = invokeForensiScopeAgentTool({
    name,
    args: toolArgs,
    graph: loaded.graph
  });

  return {
    schema: 'evercraft.forensiscope.gateway-result.v1',
    tool: name,
    evidence_ref: loaded.evidence_ref,
    graph_digest: loaded.graph_digest,
    source_sha256: loaded.graph.source_sha256,
    result,
    authority: {
      completed_evidence_query_only: true,
      accepts_raw_media: false,
      starts_analysis_jobs: false,
      creates_checkout: false,
      creates_payment_obligation: false
    }
  };
}
