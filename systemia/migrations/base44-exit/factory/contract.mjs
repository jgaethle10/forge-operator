import crypto from 'node:crypto';

const SECRET_VALUE_KEY = /(secret|token|password|credential|private[_-]?key|api[_-]?key|authorization|cookie|session[_-]?key)/i;
const SOURCE_ID_KEY = /(^|_)(app_?id|source_?id|base44_?id|record_?id)$/i;

function clean(value) {
  return String(value ?? '').trim();
}

function arr(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function bool(value) {
  return value === true;
}

function sha(value) {
  return 'sha256:' + crypto.createHash('sha256').update(String(value)).digest('hex');
}

function secretSafeClone(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => secretSafeClone(item));
  if (!value || typeof value !== 'object') {
    if (SECRET_VALUE_KEY.test(key) && value != null) return '[REDACTED]';
    return value;
  }

  const out = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (SOURCE_ID_KEY.test(childKey)) continue;
    if (SECRET_VALUE_KEY.test(childKey)) {
      if (Array.isArray(childValue)) out[childKey] = childValue.map((v) => clean(v)).filter(Boolean);
      else out[childKey] = childValue == null ? null : '[REDACTED]';
      continue;
    }
    out[childKey] = secretSafeClone(childValue, childKey);
  }
  return out;
}

export function sourceFingerprint(raw = {}) {
  const source =
    raw.source_record_fingerprint ||
    raw.app_id ||
    raw.appId ||
    raw.source_id ||
    raw.id ||
    raw.name ||
    raw.title ||
    JSON.stringify(raw);
  return raw.source_record_fingerprint || sha(source);
}

export function sanitizeSourceRecord(raw = {}) {
  const safe = secretSafeClone(raw);
  delete safe.id;
  delete safe.app_id;
  delete safe.appId;
  delete safe.source_id;
  delete safe.base44_id;

  return {
    ...safe,
    name: clean(raw.name || raw.title || 'Unnamed Base44 app'),
    source_record_fingerprint: sourceFingerprint(raw),
    source_identifiers_redacted: true,
    source_platform: 'base44'
  };
}

function countLike(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  if (Number.isFinite(Number(value))) return Number(value);
  return 0;
}

export function inferFeatures(rawInput = {}) {
  const raw = sanitizeSourceRecord(rawInput);
  const entities = arr(raw.entities || raw.entity_names || raw.schemas);
  const connectors = arr(raw.connectors || raw.connected_connectors);
  const functions = arr(raw.functions || raw.function_names || raw.api_functions);
  const envKeys = arr(raw.env_keys || raw.environment_keys).map(clean).filter(Boolean);
  const domains = arr(raw.custom_domains || raw.domains);
  const jobs = arr(raw.jobs || raw.scheduled_jobs || raw.crons);
  const webhooks = arr(raw.webhooks);
  const storage = arr(raw.storage_buckets || raw.storage_surfaces);
  const machine = arr(raw.public_machine_surfaces || raw.machine_surfaces);
  const subscriptions = arr(raw.realtime_subscriptions || raw.subscriptions || raw.entity_subscriptions);

  const entityCount = Math.max(countLike(raw.entity_count), entities.length);
  const functionCount = Math.max(countLike(raw.function_count), functions.length);
  const connectorCount = Math.max(countLike(raw.connector_count), connectors.length);

  return {
    entity_count: entityCount,
    function_count: functionCount,
    connector_count: connectorCount,
    entities,
    functions,
    connectors,
    env_keys: envKeys,
    custom_domains: domains,
    scheduled_jobs: jobs,
    webhooks,
    storage_surfaces: storage,
    public_machine_surfaces: machine,
    realtime_subscriptions: subscriptions,
    auth: bool(raw.auth) || bool(raw.uses_auth) || entities.includes('User'),
    storage: bool(raw.storage) || bool(raw.uses_storage) || storage.length > 0,
    scheduled_work: bool(raw.scheduled_work) || jobs.length > 0,
    webhook_ingress: bool(raw.webhook_ingress) || webhooks.length > 0,
    payments: bool(raw.payments) || bool(raw.uses_payments),
    public_machine_access: bool(raw.public_machine_access) || machine.length > 0,
    custom_domain: domains.length > 0,
    external_connectors: connectorCount > 0,
    server_functions: functionCount > 0,
    structured_data: entityCount > 0,
    realtime: bool(raw.realtime) || bool(raw.uses_realtime) || subscriptions.length > 0,
    secrets_required: envKeys.length > 0 || bool(raw.secrets_required)
  };
}

const TARGETS = {
  app_fabric_compatibility: {
    key: 'app_fabric_compatibility',
    purpose: 'Preserve high-value Base44 SDK call geometry while authority and runtime move onto Evercraft.'
  },
  public_edge: {
    key: 'public_edge',
    purpose: 'Serve browser assets and preserve public routes without Base44.'
  },
  yard_runtime: {
    key: 'yard_runtime',
    purpose: 'Run application and function workloads inside the Evercraft-owned execution plane.'
  },
  canonical_data: {
    key: 'canonical_data',
    purpose: 'Persist application entities outside Base44 with schema and data integrity receipts.'
  },
  identity_boundary: {
    key: 'identity_boundary',
    purpose: 'Preserve user identity, sessions, authorization, and role boundaries.'
  },
  secret_store: {
    key: 'secret_store',
    purpose: 'Re-key secrets into an Evercraft-controlled secret boundary. Secret values never enter migration receipts.'
  },
  object_storage: {
    key: 'object_storage',
    purpose: 'Host uploaded files and generated artifacts outside Base44.'
  },
  resident_scheduler: {
    key: 'resident_scheduler',
    purpose: 'Run scheduled and resident jobs with idempotency, leases, receipts, and retry policy.'
  },
  connector_gateway: {
    key: 'connector_gateway',
    purpose: 'Re-authorize external OAuth/API connectors without copying provider credentials from Base44.'
  },
  webhook_gateway: {
    key: 'webhook_gateway',
    purpose: 'Terminate inbound webhooks on Evercraft-controlled routes with replay protection.'
  },
  commerce_boundary: {
    key: 'commerce_boundary',
    purpose: 'Preserve checkout and payment verification while keeping payment truth provider-authoritative.'
  },
  fabric_discovery: {
    key: 'fabric_discovery',
    purpose: 'Expose approved machine-facing routes through Evercraft Fabric/CHUM without leaking private topology.'
  },
  portfolio_sentinel: {
    key: 'portfolio_sentinel',
    purpose: 'Canary the new route after cutover and detect regressions or drift.'
  },
  realtime_bus: {
    key: 'realtime_bus',
    purpose: 'Provide Evercraft-owned realtime entity/event subscriptions for applications that depend on live updates.'
  }
};

export function requiredTargets(features = {}) {
  const keys = ['app_fabric_compatibility', 'public_edge', 'portfolio_sentinel'];
  if (features.server_functions) keys.push('yard_runtime');
  if (features.structured_data) keys.push('canonical_data');
  if (features.auth) keys.push('identity_boundary');
  if (features.secrets_required) keys.push('secret_store');
  if (features.storage) keys.push('object_storage');
  if (features.scheduled_work) keys.push('resident_scheduler');
  if (features.external_connectors) keys.push('connector_gateway');
  if (features.webhook_ingress) keys.push('webhook_gateway');
  if (features.payments) keys.push('commerce_boundary');
  if (features.public_machine_access) keys.push('fabric_discovery');
  if (features.realtime) keys.push('realtime_bus');
  return [...new Set(keys)].map((key) => TARGETS[key]);
}

function gate(key, required, evidence = false, detail = '') {
  return {
    gate: key,
    required: Boolean(required),
    satisfied: !required || Boolean(evidence),
    detail
  };
}

function evidence(raw, key) {
  return raw?.readiness?.[key] === true || raw?.evidence?.[key] === true || raw?.[key] === true;
}

export function buildCutoverGates(rawInput = {}, featuresInput = null) {
  const raw = sanitizeSourceRecord(rawInput);
  const features = featuresInput || inferFeatures(raw);
  return [
    gate('source_code_captured', true, evidence(raw, 'source_code_captured'), 'Source code and function code are reproducibly captured.'),
    gate('route_inventory_captured', true, evidence(raw, 'route_inventory_captured'), 'Browser, API, machine, webhook, and callback routes are inventoried.'),
    gate('schema_mapped', features.structured_data, evidence(raw, 'schema_mapped'), 'Entity schema has a destination mapping.'),
    gate('data_snapshot_verified', features.structured_data, evidence(raw, 'data_snapshot_verified'), 'Data snapshot row counts, checksums, and sampling receipts match.'),
    gate('delta_sync_plan_verified', features.structured_data, evidence(raw, 'delta_sync_plan_verified'), 'Writes between snapshot and cutover can be reconciled.'),
    gate('identity_replatformed', features.auth, evidence(raw, 'identity_replatformed'), 'Users, roles, and authorization behavior are preserved without copying session secrets.'),
    gate('functions_replatformed', features.server_functions, evidence(raw, 'functions_replatformed'), 'Server functions run on the Evercraft runtime with parity tests.'),
    gate('connectors_reauthorized', features.external_connectors, evidence(raw, 'connectors_reauthorized'), 'External connectors are re-authorized directly at the provider.'),
    gate('webhooks_repointed', features.webhook_ingress, evidence(raw, 'webhooks_repointed'), 'Webhook senders target the new Evercraft endpoint and replay protection is verified.'),
    gate('jobs_recreated', features.scheduled_work, evidence(raw, 'jobs_recreated'), 'Scheduled jobs exist with idempotency and retry receipts.'),
    gate('storage_migrated', features.storage, evidence(raw, 'storage_migrated'), 'Object/file storage is copied and references resolve.'),
    gate('secrets_rekeyed', features.secrets_required, evidence(raw, 'secrets_rekeyed'), 'Secret material is re-issued into Evercraft-controlled storage, not exported as plaintext.'),
    gate('payment_path_verified', features.payments, evidence(raw, 'payment_path_verified'), 'Checkout and payment verification remain provider-authoritative.'),
    gate('machine_surfaces_verified', features.public_machine_access, evidence(raw, 'machine_surfaces_verified'), 'MCP/OpenAPI/A2A/discovery doors point to the new authority.'),
    gate('realtime_replatformed', features.realtime, evidence(raw, 'realtime_replatformed'), 'Realtime subscriptions use an Evercraft-owned bus and pass reconnect, ordering, authorization, and delivery parity tests.'),
    gate('custom_domains_ready', features.custom_domain, evidence(raw, 'custom_domains_ready'), 'DNS, TLS, redirects, and callback URLs are staged.'),
    gate('parity_suite_passed', true, evidence(raw, 'parity_suite_passed'), 'Critical user journeys and API contracts pass against the new stack.'),
    gate('observability_ready', true, evidence(raw, 'observability_ready'), 'Health, logs, error receipts, latency, and dependency health are visible.'),
    gate('rollback_proven', true, evidence(raw, 'rollback_proven'), 'Traffic can return to the source without data ambiguity during the bounded rollback window.'),
    gate('write_freeze_or_dual_write_verified', features.structured_data, evidence(raw, 'write_freeze_or_dual_write_verified'), 'Final cutover prevents lost writes.'),
    gate('post_cutover_sentinel_ready', true, evidence(raw, 'post_cutover_sentinel_ready'), 'Portfolio Sentinel can probe the destination immediately after cutover.')
  ];
}

export function evaluateCutoverReadiness(gates = []) {
  const required = gates.filter((row) => row.required);
  const blocked = required.filter((row) => !row.satisfied);
  return {
    required_gates: required.length,
    satisfied_gates: required.length - blocked.length,
    blocked_gates: blocked.map((row) => row.gate),
    status: blocked.length === 0 ? 'cutover_ready' : 'not_cutover_ready'
  };
}

export function buildEvacuationPlan(rawInput = {}) {
  const raw = sanitizeSourceRecord(rawInput);
  const features = inferFeatures(raw);
  const targets = requiredTargets(features);
  const gates = buildCutoverGates(raw, features);
  const readiness = evaluateCutoverReadiness(gates);
  const sourceIdRedacted = raw.source_identifiers_redacted === true;

  const complexityScore =
    1 +
    Math.min(10, Math.ceil(features.entity_count / 20)) +
    Math.min(10, Math.ceil(features.function_count / 10)) +
    (features.auth ? 2 : 0) +
    (features.external_connectors ? 2 : 0) +
    (features.payments ? 3 : 0) +
    (features.webhook_ingress ? 2 : 0) +
    (features.scheduled_work ? 2 : 0) +
    (features.storage ? 2 : 0) +
    (features.public_machine_access ? 2 : 0) +
    (features.realtime ? 2 : 0);

  return {
    schema: 'evercraft.base44-evac.app-plan.v1',
    source: {
      platform: 'base44',
      name: raw.name,
      fingerprint: raw.source_record_fingerprint,
      identifiers_redacted: sourceIdRedacted,
      destructive_source_actions_allowed: false
    },
    features,
    destination_targets: targets,
    cutover_gates: gates,
    readiness,
    complexity_score: complexityScore,
    doctrine: {
      source_is_read_only_until_explicit_decommission: true,
      no_plaintext_secret_export: true,
      no_credential_copy_between_providers: true,
      destination_truth_must_be_independently_verified: true,
      data_counts_and_checksums_required: features.structured_data,
      rollback_before_cutover: true,
      traffic_shift_is_not_source_deletion: true,
      source_decommission_requires_separate_human_gate: true
    }
  };
}

export function reconcilePortfolioPlans(plans = []) {
  const safePlans = plans.filter(Boolean);
  const counts = {
    total: safePlans.length,
    cutover_ready: 0,
    not_cutover_ready: 0
  };
  const targetCounts = {};
  const gateBlockers = {};
  let complexity = 0;

  for (const plan of safePlans) {
    counts[plan.readiness?.status] = (counts[plan.readiness?.status] || 0) + 1;
    complexity += Number(plan.complexity_score || 0);
    for (const target of plan.destination_targets || []) {
      targetCounts[target.key] = (targetCounts[target.key] || 0) + 1;
    }
    for (const gate of plan.readiness?.blocked_gates || []) {
      gateBlockers[gate] = (gateBlockers[gate] || 0) + 1;
    }
  }

  return {
    schema: 'evercraft.base44-evac.portfolio-plan.v1',
    status: 'reconciled',
    summary: counts,
    aggregate_complexity_score: complexity,
    destination_target_counts: targetCounts,
    blocker_counts: gateBlockers,
    source_platform: 'base44',
    source_mutations_applied: 0,
    source_decommissions_applied: 0
  };
}

export function assertNoSecretValues(value) {
  const serialized = JSON.stringify(value);
  const suspicious = [
    /"password"\s*:\s*"(?!\[REDACTED\])/i,
    /"api[_-]?key"\s*:\s*"(?!\[REDACTED\])/i,
    /"secret"\s*:\s*"(?!\[REDACTED\])/i,
    /"token"\s*:\s*"(?!\[REDACTED\])/i,
    /"private[_-]?key"\s*:\s*"(?!\[REDACTED\])/i
  ];
  const match = suspicious.find((pattern) => pattern.test(serialized));
  if (match) throw new Error('Migration plan contains a secret-like value.');
  return true;
}
