import crypto from 'node:crypto';

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': { tools: {} },
  'io.modelcontextprotocol/clientInfo': {
    name: 'forensiscope-public-canary',
    version: '1.0.0'
  }
};

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeOrigin(origin) {
  const url = new URL(String(origin || ''));
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('ForensiScope canary origin must be HTTP(S).');
  }
  return url.origin;
}

function isLoopback(origin) {
  const host = new URL(origin).hostname.toLowerCase();
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
}

async function postMcp(origin, body, headers = {}) {
  const response = await fetch(origin + '/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

export async function canaryForensiScopePublicMcp({
  origin,
  deploymentReceiptHash,
  allowLoopbackProof = false
} = {}) {
  const normalizedOrigin = normalizeOrigin(origin);
  const loopback = isLoopback(normalizedOrigin);

  if (loopback && allowLoopbackProof !== true) {
    throw new Error('loopback is not a public ForensiScope route');
  }
  if (!loopback && !normalizedOrigin.startsWith('https://')) {
    throw new Error('public ForensiScope MCP route must use HTTPS');
  }

  const healthResponse = await fetch(normalizedOrigin + '/v1/health');
  const health = await healthResponse.json();
  const healthOk =
    healthResponse.ok &&
    health.ok === true &&
    health.service === 'forensiscope-evidence-query' &&
    health.runtime === 'Evercraft Compute' &&
    health.raw_media_intake === false &&
    health.starts_analysis_jobs === false &&
    health.checkout_or_payment === false &&
    health.evidence_access_required === true &&
    health.privacy_safe_access_audit_receipts === true &&
    health.deployment_receipt_bound === true &&
    health.deployment_receipt_ref === deploymentReceiptHash;

  const discover = await postMcp(
    normalizedOrigin,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: MODERN_META }
    },
    {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'server/discover'
    }
  );
  const discoverOk =
    discover.status === 200 &&
    discover.payload?.result?.supportedVersions?.includes('2026-07-28');

  const toolsList = await postMcp(
    normalizedOrigin,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: MODERN_META }
    },
    {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/list'
    }
  );
  const tools = toolsList.payload?.result?.tools || [];
  const toolsListOk = toolsList.status === 200 && tools.length >= 5;

  const rawMediaTools = tools.filter((tool) =>
    /upload|submit_media|raw_media|ingest_media|start_analysis/i.test(tool.name)
  );
  const checkoutTools = tools.filter((tool) =>
    /checkout|payment|purchase|charge/i.test(tool.name)
  );

  const singleEvidenceTools = tools.filter((tool) =>
    tool.name !== 'forensiscope_compare_evidence'
  );
  const comparison = tools.find((tool) =>
    tool.name === 'forensiscope_compare_evidence'
  );
  const scopedAccessDeclared =
    singleEvidenceTools.length > 0 &&
    singleEvidenceTools.every((tool) =>
      tool.inputSchema?.required?.includes('evidence_ref') &&
      tool.inputSchema?.required?.includes('access_token')
    ) &&
    Boolean(
      comparison?.inputSchema?.required?.includes('evidence_ref_a') &&
      comparison?.inputSchema?.required?.includes('access_token_a') &&
      comparison?.inputSchema?.required?.includes('evidence_ref_b') &&
      comparison?.inputSchema?.required?.includes('access_token_b')
    );

  const deniedWithoutAccess = await postMcp(
    normalizedOrigin,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'forensiscope_query_evidence',
        arguments: {
          evidence_ref: 'forensiscope-evidence:sha256:' + '0'.repeat(64),
          query: 'canary'
        },
        _meta: MODERN_META
      }
    },
    {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'forensiscope_query_evidence'
    }
  );
  const scopedAccessEnforced =
    deniedWithoutAccess.status === 200 &&
    deniedWithoutAccess.payload?.result?.isError === true &&
    /access_token/i.test(
      deniedWithoutAccess.payload?.result?.content?.[0]?.text || ''
    );

  const body = {
    schema: 'evercraft.forensiscope.public-mcp-canary.v1',
    origin: normalizedOrigin,
    scope: loopback ? 'loopback_proof' : 'public_https',
    verified: !loopback &&
      healthOk &&
      discoverOk &&
      toolsListOk &&
      scopedAccessDeclared &&
      scopedAccessEnforced &&
      rawMediaTools.length === 0 &&
      checkoutTools.length === 0,
    deployment_receipt_hash: deploymentReceiptHash,
    health_ok: healthOk,
    initialize_or_discover_ok: discoverOk,
    tools_list_ok: toolsListOk,
    tool_count: tools.length,
    tool_names: tools.map((tool) => tool.name).sort(),
    scoped_access_declared: scopedAccessDeclared,
    scoped_access_enforced: scopedAccessEnforced,
    raw_media_tools_exposed: rawMediaTools.length > 0,
    checkout_tools_exposed: checkoutTools.length > 0,
    observed_instance_id: health.instance_id || null,
    observed_at: new Date().toISOString()
  };

  return {
    ...body,
    receipt_hash: sha(body)
  };
}
