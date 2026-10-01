import crypto from 'node:crypto';

function clean(value) {
  return String(value ?? '').trim();
}

function sha256(value) {
  return 'sha256:' + crypto.createHash('sha256').update(String(value)).digest('hex');
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))].sort();
}

export function buildMachineActionManifest(receipt) {
  if (receipt?.schema !== 'evercraft.chum.mcp-canary.v2') {
    throw new Error('mcp_canary_receipt_schema_invalid');
  }

  const checkedAt = clean(receipt.checked_at);
  if (!checkedAt || !Number.isFinite(new Date(checkedAt).getTime())) {
    throw new Error('mcp_canary_checked_at_invalid');
  }

  const receiptDigest = sha256(JSON.stringify(receipt));
  const rows = (receipt.rows || []).map((row) => {
    const toolNames = row?.tools_list?.valid === true
      ? uniqueSorted(row.tools_list.names || [])
      : [];
    const listed = row?.initialize?.valid === true &&
      row?.tools_list?.valid === true &&
      toolNames.length > 0;

    return {
      product_key: clean(row.product_key) || null,
      name: clean(row.name) || null,
      registry_name: clean(row.registry_name) || null,
      mcp: clean(row.mcp) || null,
      observation_state: listed ? 'verified_tools_list' : 'unverified',
      initialize_verified: row?.initialize?.valid === true,
      tools_list_verified: row?.tools_list?.valid === true,
      tool_count: toolNames.length,
      tool_names: toolNames,
      commerce_signals: listed
        ? uniqueSorted(row?.tools_list?.commerce_signals || [])
        : [],
      tool_call_verified: false,
      registry: {
        checked: row?.registry?.checked === true,
        present: row?.registry?.present === true,
        active: row?.registry?.active === true,
        latest: row?.registry?.latest === true,
        version: clean(row?.registry?.version) || null,
        published_at: clean(row?.registry?.published_at) || null,
      },
      evidence_state: listed ? 'observed_live_tools_list' : 'unverified',
      observed_at: checkedAt,
      source_receipt_schema: receipt.schema,
      source_receipt_sha256: receiptDigest,
    };
  });

  const verified = rows.filter((row) => row.observation_state === 'verified_tools_list');

  return {
    schema: 'evercraft.machine-action-manifest.v1',
    observed_at: checkedAt,
    source_receipt_schema: receipt.schema,
    source_receipt_sha256: receiptDigest,
    summary: {
      target_count: rows.length,
      verified_tools_list_count: verified.length,
      unverified_count: rows.length - verified.length,
      observed_tool_count: verified.reduce((sum, row) => sum + row.tool_count, 0),
    },
    rows,
    truth_boundary: {
      tools_list_presence_is_not_successful_tool_call: true,
      tools_list_presence_is_not_payment_or_entitlement: true,
      tools_list_presence_is_not_provider_pickup: true,
      unverified_or_failed_target_never_invents_tools: true,
      machine_action_manifest_grants_authority: false,
    },
  };
}

export function findObservedTool(manifest, { product_key = null, registry_name = null, tool_name } = {}) {
  if (manifest?.schema !== 'evercraft.machine-action-manifest.v1') {
    throw new Error('machine_action_manifest_schema_invalid');
  }
  const toolName = clean(tool_name);
  if (!toolName) throw new Error('tool_name_required');

  const productKey = clean(product_key);
  const registryName = clean(registry_name);
  if (!productKey && !registryName) throw new Error('product_key_or_registry_name_required');

  const row = (manifest.rows || []).find((candidate) =>
    candidate.observation_state === 'verified_tools_list' &&
    (!productKey || candidate.product_key === productKey) &&
    (!registryName || candidate.registry_name === registryName)
  ) || null;

  return {
    observed: Boolean(row?.tool_names?.includes(toolName)),
    tool_call_verified: false,
    row,
    truth_boundary:
      'Observed means the exact tool name appeared in a live tools/list receipt. It does not prove tools/call success or grant authority.',
  };
}
