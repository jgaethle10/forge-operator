function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function publicRefs(refs = []) {
  return (Array.isArray(refs) ? refs : [])
    .map((ref) => clean(ref, 2000))
    .filter((ref) => /^https?:\/\//i.test(ref));
}

export function publicFaieInvestigation(investigation) {
  if (!investigation) return null;
  return {
    ...structuredClone(investigation),
    findings: (investigation.findings || []).map((finding) => ({
      ...structuredClone(finding),
      provenance_ref_count: Array.isArray(finding.provenance_refs)
        ? finding.provenance_refs.length
        : 0,
      provenance_refs: publicRefs(finding.provenance_refs)
    })),
    evidence_ledger: (investigation.evidence_ledger || []).map((row) => ({
      ...structuredClone(row),
      provenance_ref_count: Array.isArray(row.provenance_refs)
        ? row.provenance_refs.length
        : 0,
      provenance_refs: publicRefs(row.provenance_refs)
    }))
  };
}

export function faieMcpTools() {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  return [
    {
      name: 'investigate_faie_evidence',
      title: 'Investigate agriculture, land, water, production, or resilience evidence',
      description: 'Run a bounded FAIE evidence investigation. Public MCP investigations are ephemeral previews and do not persist the caller question into the shared investigation archive.',
      inputSchema: {
        type: 'object',
        required: ['question'],
        properties: {
          question: {
            type: 'string',
            minLength: 3,
            maxLength: 1200,
            description: 'The bounded evidence question to investigate.'
          },
          region_keys: {
            type: 'array',
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 160 }
          },
          asset_types: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1, maxLength: 160 }
          },
          crop: { type: 'string', maxLength: 120 },
          water_source: { type: 'string', maxLength: 120 },
          horizon_days: {
            type: 'integer',
            minimum: 1,
            maximum: 3650,
            default: 90
          },
          include_weak_evidence: {
            type: 'boolean',
            default: false
          }
        },
        additionalProperties: false
      },
      annotations
    },
    {
      name: 'get_faie_signal_snapshot',
      title: 'Read the current FAIE signal field',
      description: 'Return the latest public-safe FAIE signal snapshot. Read-only and non-transactional.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 25
          }
        },
        additionalProperties: false
      },
      annotations
    },
    {
      name: 'get_faie_health',
      title: 'Read FAIE runtime health',
      description: 'Return FAIE resident, source-health, and signal-count status without exposing private investigation content.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations
    }
  ];
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false
  };
}

function uniqueStrings(value, maxItems, maxLength = 160) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => clean(item, maxLength))
      .filter(Boolean)
  )].slice(0, maxItems);
}

export async function executeFaieMcpRpc(runtime, rpc) {
  if (!runtime) throw new Error('faie_runtime_required');

  const method = clean(rpc?.method, 120);
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'evercraft-faie',
        version: '1.0.0'
      },
      instructions: 'FAIE is read-only evidence support for agriculture, land, water, production, and resilience questions. Modeled, reported, observed, and verified evidence remain distinct. Public MCP investigations are ephemeral and do not authorize consequential action, publication, payment, or equipment control.'
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: faieMcpTools() });
  }

  if (method === 'notifications/initialized') return null;

  if (method !== 'tools/call') {
    return rpcError(id, -32601, 'Method not found.');
  }

  const tool = clean(rpc?.params?.name, 160);
  const args = rpc?.params?.arguments || {};

  if (tool === 'investigate_faie_evidence') {
    const question = clean(args.question, 1200);
    if (question.length < 3) {
      return rpcError(id, -32602, 'question must contain at least 3 characters.');
    }

    const investigation = runtime.preview({
      question,
      region_keys: uniqueStrings(args.region_keys, 50),
      asset_types: uniqueStrings(args.asset_types, 30),
      crop: clean(args.crop, 120),
      water_source: clean(args.water_source, 120),
      horizon_days: boundedInt(args.horizon_days, 90, 1, 3650),
      include_weak_evidence: args.include_weak_evidence === true
    });

    return rpcResult(id, toolResult({
      ok: true,
      product: 'FAIE',
      investigation: publicFaieInvestigation(investigation),
      persisted: false,
      external_action_taken: false,
      decision_authority: false,
      publication_authority: false
    }));
  }

  if (tool === 'get_faie_signal_snapshot') {
    const limit = boundedInt(args.limit, 25, 1, 100);
    return rpcResult(id, toolResult({
      ok: true,
      product: 'FAIE',
      snapshot: runtime.snapshot(limit),
      external_action_taken: false
    }));
  }

  if (tool === 'get_faie_health') {
    return rpcResult(id, toolResult({
      ok: true,
      product: 'FAIE',
      health: runtime.health(),
      external_action_taken: false
    }));
  }

  return rpcError(id, -32602, 'Unknown or unsupported FAIE tool.');
}
