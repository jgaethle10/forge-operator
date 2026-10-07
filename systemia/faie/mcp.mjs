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
          thesis_assumptions: {
            type: 'array',
            maxItems: 40,
            items: {
              anyOf: [
                { type: 'string', minLength: 1, maxLength: 500 },
                {
                  type: 'object',
                  required: ['statement'],
                  properties: {
                    assumption_id: { type: 'string', maxLength: 160 },
                    statement: { type: 'string', minLength: 1, maxLength: 500 },
                    criticality: { type: 'string', maxLength: 40 }
                  },
                  additionalProperties: false
                }
              ]
            }
          },
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
      name: 'compare_faie_candidates',
      title: 'Compare candidate food-infrastructure or agriculture scopes by evidence readiness',
      description: 'Run the same bounded FAIE evidence rubric across 2 to 8 candidate regions or sites. The returned rank is evidence-readiness only, not site suitability or an investment recommendation.',
      inputSchema: {
        type: 'object',
        required: ['question', 'candidates'],
        properties: {
          question: {
            type: 'string',
            minLength: 3,
            maxLength: 1200
          },
          candidates: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: {
              type: 'object',
              required: ['label'],
              properties: {
                label: { type: 'string', minLength: 1, maxLength: 160 },
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
                thesis_assumptions: {
                  type: 'array',
                  maxItems: 40,
                  items: { type: 'string', minLength: 1, maxLength: 500 }
                },
                horizon_days: { type: 'integer', minimum: 1, maximum: 3650 }
              },
              additionalProperties: false
            }
          },
          asset_types: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1, maxLength: 160 }
          },
          crop: { type: 'string', maxLength: 120 },
          water_source: { type: 'string', maxLength: 120 },
          thesis_assumptions: {
            type: 'array',
            maxItems: 40,
            items: { type: 'string', minLength: 1, maxLength: 500 }
          },
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

export async function executeFaieMcpRpc(runtime, rpc, { now } = {}) {
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
      thesis_assumptions: Array.isArray(args.thesis_assumptions) ? args.thesis_assumptions.slice(0, 40) : [],
      horizon_days: boundedInt(args.horizon_days, 90, 1, 3650),
      include_weak_evidence: args.include_weak_evidence === true
    }, now ? { now } : {});

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

  if (tool === 'compare_faie_candidates') {
    const question = clean(args.question, 1200);
    if (question.length < 3) {
      return rpcError(id, -32602, 'question must contain at least 3 characters.');
    }
    if (!Array.isArray(args.candidates) || args.candidates.length < 2 || args.candidates.length > 8) {
      return rpcError(id, -32602, 'candidates must contain between 2 and 8 items.');
    }

    const candidates = args.candidates.slice(0, 8).map((candidate, index) => ({
      label: clean(candidate?.label || ('Candidate ' + (index + 1)), 160),
      region_keys: uniqueStrings(candidate?.region_keys, 50),
      asset_types: uniqueStrings(candidate?.asset_types, 30),
      crop: clean(candidate?.crop, 120),
      water_source: clean(candidate?.water_source, 120),
      thesis_assumptions: Array.isArray(candidate?.thesis_assumptions)
        ? candidate.thesis_assumptions.map((item) => clean(item, 500)).filter(Boolean).slice(0, 40)
        : [],
      horizon_days: boundedInt(candidate?.horizon_days, boundedInt(args.horizon_days, 90, 1, 3650), 1, 3650)
    }));

    const comparison = runtime.previewComparison({
      question,
      candidates,
      asset_types: uniqueStrings(args.asset_types, 30),
      crop: clean(args.crop, 120),
      water_source: clean(args.water_source, 120),
      thesis_assumptions: Array.isArray(args.thesis_assumptions)
        ? args.thesis_assumptions.map((item) => clean(item, 500)).filter(Boolean).slice(0, 40)
        : [],
      horizon_days: boundedInt(args.horizon_days, 90, 1, 3650),
      include_weak_evidence: args.include_weak_evidence === true
    }, now ? { now } : {});

    return rpcResult(id, toolResult({
      ok: true,
      product: 'FAIE',
      comparison,
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
