import { loadEvidenceGraph } from './evidence-store.mjs';
import { verifyEvidenceAccessToken } from './evidence-access.mjs';
import { compareForensiScopeEvidence } from './evidence-compare.mjs';
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

const COMPARE_TOOL = Object.freeze({
  name: 'forensiscope_compare_evidence',
  description:
    'Compare two completed authorized ForensiScope evidence sets for decoded visual matches and perceptual near-matches.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'evidence_ref_a',
      'access_token_a',
      'evidence_ref_b',
      'access_token_b'
    ],
    properties: {
      evidence_ref_a: {
        type: 'string',
        pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}
function withEvidenceAccess(tool) {
  const schema = structuredClone(
    tool.inputSchema || { type: 'object', properties: {} }
  );
  schema.type = 'object';
  schema.additionalProperties = false;
  schema.properties = {
    evidence_ref: {
      type: 'string',
      pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}$',
      description:
        'Immutable reference for a completed, authorized ForensiScope evidence graph.'
    },
    access_token: {
      type: 'string',
      minLength: 64,
      'x-mcp-header': 'Evidence-Access',
      description:
        'Scoped, expiring ForensiScope evidence-access capability for this evidence_ref.'
    },
    ...(schema.properties || {})
  };
  schema.required = [
    ...new Set(['evidence_ref', 'access_token', ...(schema.required || [])])
  ];
  return {
    ...structuredClone(tool),
    inputSchema: schema
  };
}

export function listForensiScopeGatewayTools() {
  return [
    ...listForensiScopeAgentTools().map(withEvidenceAccess),
    structuredClone(COMPARE_TOOL)
  ];
}

export function invokeForensiScopeGatewayTool({
  name,
  args = {},
  rootDir = process.cwd()
} = {}) {
  if (name === 'forensiscope_compare_evidence') {
    const evidenceRefA = String(args.evidence_ref_a || '');
    const evidenceRefB = String(args.evidence_ref_b || '');
    const accessTokenA = String(args.access_token_a || '');
    const accessTokenB = String(args.access_token_b || '');
    if (!evidenceRefA || !evidenceRefB) {
      throw new Error('ForensiScope comparison requires both evidence refs.');
    }
    if (!accessTokenA || !accessTokenB) {
      throw new Error('ForensiScope comparison requires access grants for both evidence refs.');
    }

    const accessA = verifyEvidenceAccessToken(accessTokenA, {
      evidenceRef: evidenceRefA,
      requiredScope: 'compare'
    });
    const accessB = verifyEvidenceAccessToken(accessTokenB, {
      evidenceRef: evidenceRefB,
      requiredScope: 'compare'
    });
    const loadedA = loadEvidenceGraph(evidenceRefA, { rootDir });
    const loadedB = loadEvidenceGraph(evidenceRefB, { rootDir });
    const result = compareForensiScopeEvidence(
      loadedA.graph,
      loadedB.graph,
      {
        maxHamming: Number(args.max_hamming_distance ?? 6),
        maxColorDistance: Number(args.max_color_distance ?? 42),
        maxMatches: Number(args.max_matches ?? 500)
      }
    );

    return {
      schema: 'evercraft.forensiscope.gateway-comparison-result.v1',
      tool: name,
      evidence_refs: [loadedA.evidence_ref, loadedB.evidence_ref],
      graph_digests: [loadedA.graph_digest, loadedB.graph_digest],
      source_sha256: [loadedA.graph.source_sha256, loadedB.graph.source_sha256],
      access: [
        {
          verified: accessA.verified,
          required_scope: accessA.required_scope,
          expires_at_unix: accessA.expires_at_unix
        },
        {
          verified: accessB.verified,
          required_scope: accessB.required_scope,
          expires_at_unix: accessB.expires_at_unix
        }
      ],
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

  const evidenceRef = String(args.evidence_ref || '');
  const accessToken = String(args.access_token || '');
  if (!evidenceRef) throw new Error('ForensiScope gateway requires evidence_ref.');
  if (!accessToken) throw new Error('ForensiScope gateway requires access_token.');

  const requiredScope = TOOL_SCOPES[name];
  if (!requiredScope) {
    throw new Error(
      `Unsupported ForensiScope gateway tool: ${String(name || '')}`
    );
  }

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

      },
      access_token_a: {
        type: 'string',
        minLength: 64,
        'x-mcp-header': 'Evidence-Access-A'
      },
      evidence_ref_b: {
        type: 'string',
        pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}
function withEvidenceAccess(tool) {
  const schema = structuredClone(
    tool.inputSchema || { type: 'object', properties: {} }
  );
  schema.type = 'object';
  schema.additionalProperties = false;
  schema.properties = {
    evidence_ref: {
      type: 'string',
      pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}$',
      description:
        'Immutable reference for a completed, authorized ForensiScope evidence graph.'
    },
    access_token: {
      type: 'string',
      minLength: 64,
      'x-mcp-header': 'Evidence-Access',
      description:
        'Scoped, expiring ForensiScope evidence-access capability for this evidence_ref.'
    },
    ...(schema.properties || {})
  };
  schema.required = [
    ...new Set(['evidence_ref', 'access_token', ...(schema.required || [])])
  ];
  return {
    ...structuredClone(tool),
    inputSchema: schema
  };
}

export function listForensiScopeGatewayTools() {
  return listForensiScopeAgentTools().map(withEvidenceAccess);
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
  if (!requiredScope) {
    throw new Error(
      `Unsupported ForensiScope gateway tool: ${String(name || '')}`
    );
  }

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

      },
      access_token_b: {
        type: 'string',
        minLength: 64,
        'x-mcp-header': 'Evidence-Access-B'
      },
      max_hamming_distance: {
        type: 'integer',
        minimum: 0,
        maximum: 64,
        default: 6
      },
      max_color_distance: {
        type: 'integer',
        minimum: 0,
        maximum: 765,
        default: 42
      },
      max_matches: {
        type: 'integer',
        minimum: 1,
        maximum: 5000,
        default: 500
      }
    }
  }
});

function withEvidenceAccess(tool) {
  const schema = structuredClone(
    tool.inputSchema || { type: 'object', properties: {} }
  );
  schema.type = 'object';
  schema.additionalProperties = false;
  schema.properties = {
    evidence_ref: {
      type: 'string',
      pattern: '^forensiscope-evidence:sha256:[a-f0-9]{64}$',
      description:
        'Immutable reference for a completed, authorized ForensiScope evidence graph.'
    },
    access_token: {
      type: 'string',
      minLength: 64,
      'x-mcp-header': 'Evidence-Access',
      description:
        'Scoped, expiring ForensiScope evidence-access capability for this evidence_ref.'
    },
    ...(schema.properties || {})
  };
  schema.required = [
    ...new Set(['evidence_ref', 'access_token', ...(schema.required || [])])
  ];
  return {
    ...structuredClone(tool),
    inputSchema: schema
  };
}

export function listForensiScopeGatewayTools() {
  return listForensiScopeAgentTools().map(withEvidenceAccess);
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
  if (!requiredScope) {
    throw new Error(
      `Unsupported ForensiScope gateway tool: ${String(name || '')}`
    );
  }

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
