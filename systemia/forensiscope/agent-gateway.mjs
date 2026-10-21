import { loadEvidenceGraph } from './evidence-store.mjs';
import {
  listForensiScopeAgentTools,
  invokeForensiScopeAgentTool
} from './agent-tools.mjs';

function withEvidenceRef(tool) {
  const schema = structuredClone(tool.inputSchema || { type: 'object', properties: {} });
  schema.type = 'object';
  schema.additionalProperties = false;
  schema.properties = {
    evidence_ref: {
      type: 'string',
      pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}$',
      description: 'Immutable reference for a completed, authorized ForensiScope evidence graph.'
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
