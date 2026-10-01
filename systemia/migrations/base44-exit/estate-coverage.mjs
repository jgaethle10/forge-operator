import { createHash } from 'node:crypto';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return clean(value).toLowerCase();
}

function sha(value) {
  return 'sha256:' + createHash('sha256').update(String(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sourceFingerprint(app = {}) {
  const rawId = clean(app.id || app.app_id || app.appId || app.source_id || '');
  if (!rawId) throw new Error('estate_coverage_source_id_required');
  return sha(rawId);
}

function safeSourceType(value) {
  const type = normalizeName(value);
  if (!type) return 'unknown';
  if (!/^[a-z0-9._-]{1,80}$/.test(type)) return 'other';
  return type;
}

function aliasIndex(aliasReceipts = []) {
  const map = new Map();
  for (const row of aliasReceipts || []) {
    const source = normalizeName(row?.source_name);
    const product = clean(row?.queue_product);
    const authority = clean(row?.authority_receipt_ref);
    if (!source || !product || !authority) throw new Error('estate_coverage_alias_receipt_invalid');
    if (map.has(source) && map.get(source).product !== product) throw new Error('estate_coverage_alias_conflict');
    map.set(source, { product, authority_receipt_ref: authority });
  }
  return map;
}

export function reconcileEstateCoverage({
  apps = [],
  queue = [],
  listingLimit = 100,
  aliasReceipts = []
} = {}) {
  if (!Array.isArray(apps)) throw new Error('estate_coverage_apps_array_required');
  if (!Array.isArray(queue)) throw new Error('estate_coverage_queue_array_required');

  const limit = Math.max(1, Number(listingLimit) || 100);
  const queueByName = new Map();
  for (const row of queue) {
    const product = clean(row?.product);
    if (!product) throw new Error('estate_coverage_queue_product_required');
    const key = normalizeName(product);
    if (queueByName.has(key)) throw new Error('estate_coverage_queue_duplicate_product');
    queueByName.set(key, row);
  }
  const aliases = aliasIndex(aliasReceipts);

  const sourceTypes = {};
  const normalizedGroups = new Map();
  const fingerprints = new Set();
  const observed = [];

  for (const app of apps) {
    const fingerprint = sourceFingerprint(app);
    if (fingerprints.has(fingerprint)) throw new Error('estate_coverage_duplicate_source_id');
    fingerprints.add(fingerprint);

    const normalized = normalizeName(app?.name || app?.title || '');
    const untitled = normalized === 'untitled' || normalized === '';
    const type = safeSourceType(app?.git_remote_source || app?.source_type || '');
    sourceTypes[type] = (sourceTypes[type] || 0) + 1;

    if (!normalizedGroups.has(normalized)) normalizedGroups.set(normalized, []);
    normalizedGroups.get(normalized).push(fingerprint);

    const exact = queueByName.get(normalized) || null;
    const alias = aliases.get(normalized) || null;
    const aliasedQueue = alias ? queueByName.get(normalizeName(alias.product)) : null;
    if (alias && !aliasedQueue) throw new Error('estate_coverage_alias_target_not_in_queue');

    const matched = exact || aliasedQueue || null;
    const matchMode = exact ? 'exact_normalized_name' : alias ? 'authorized_alias' : null;
    observed.push({
      source_fingerprint: fingerprint,
      disposition: untitled
        ? 'classify_before_migrate'
        : matched
          ? 'public_queue_match'
          : 'unqueued_needs_disposition',
      queue_product: matched ? clean(matched.product) : null,
      queue_wave: matched ? Number(matched.wave || 0) || null : null,
      match_mode: matchMode,
      alias_authority_receipt_ref: alias ? alias.authority_receipt_ref : null,
      source_name_emitted: Boolean(matched),
      source_id_emitted: false,
      source_type: type,
      untitled
    });
  }

  observed.sort((a, b) => a.source_fingerprint.localeCompare(b.source_fingerprint));

  const duplicateGroups = [];
  for (const [normalized, group] of normalizedGroups) {
    if (group.length <= 1) continue;
    const queueMatch = queueByName.get(normalized);
    duplicateGroups.push({
      normalized_name: queueMatch ? clean(queueMatch.product) : normalized === 'untitled' ? 'Untitled' : null,
      source_fingerprints: [...group].sort(),
      count: group.length,
      source_name_emitted: Boolean(queueMatch) || normalized === 'untitled'
    });
  }
  duplicateGroups.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));

  const matchedQueue = new Map();
  for (const row of observed) {
    if (!row.queue_product) continue;
    if (!matchedQueue.has(row.queue_product)) matchedQueue.set(row.queue_product, []);
    matchedQueue.get(row.queue_product).push(row.source_fingerprint);
  }

  const queueCoverage = queue.map((row) => {
    const product = clean(row.product);
    const matched = matchedQueue.get(product) || [];
    return {
      product,
      wave: Number(row.wave || 0) || null,
      state: matched.length === 1
        ? 'observed_exactly_once'
        : matched.length > 1
          ? 'ambiguous_multiple_sources'
          : 'not_observed_on_current_page',
      observed_source_count: matched.length,
      source_fingerprints: [...matched].sort()
    };
  });

  const listingCeilingHit = apps.length >= limit;
  const counts = {
    observed_apps: apps.length,
    public_queue_products: queue.length,
    matched_observed_apps: observed.filter((row) => row.disposition === 'public_queue_match').length,
    unqueued_observed_apps: observed.filter((row) => row.disposition === 'unqueued_needs_disposition').length,
    untitled_observed_apps: observed.filter((row) => row.disposition === 'classify_before_migrate').length,
    queue_products_observed_exactly_once: queueCoverage.filter((row) => row.state === 'observed_exactly_once').length,
    queue_products_not_observed_on_current_page: queueCoverage.filter((row) => row.state === 'not_observed_on_current_page').length,
    queue_products_with_ambiguous_sources: queueCoverage.filter((row) => row.state === 'ambiguous_multiple_sources').length,
    duplicate_normalized_name_groups: duplicateGroups.length
  };

  const coverage = {
    schema: 'evercraft.base44.estate-coverage.v1',
    observed_at: new Date().toISOString(),
    listing_limit: limit,
    listing_ceiling_hit: listingCeilingHit,
    inventory_complete_proven: false,
    inventory_completeness_reason: listingCeilingHit
      ? 'source_listing_reached_configured_ceiling'
      : 'source_api_does_not_prove_no_additional_pages_without_explicit_terminal_receipt',
    counts,
    source_types: Object.fromEntries(Object.entries(sourceTypes).sort(([a],[b]) => a.localeCompare(b))),
    page_fingerprint: sha(observed.map((row) => row.source_fingerprint).sort().join('\n')),
    queue_coverage: queueCoverage,
    observed,
    duplicate_normalized_name_groups: duplicateGroups,
    privacy: {
      raw_source_ids_emitted: false,
      unmatched_source_names_emitted: false,
      untitled_source_names_emitted_only_as_classification_label: true,
      source_credentials_emitted: false
    },
    doctrine: {
      unqueued_is_not_disposable: true,
      untitled_requires_classification_before_migration_or_archive: true,
      missing_from_current_page_does_not_mean_source_absent: true,
      coverage_does_not_authorize_cutover: true,
      coverage_does_not_authorize_source_decommission: true
    }
  };

  return coverage;
}

export function assertEstateCoveragePrivacy(coverage) {
  if (coverage?.privacy?.raw_source_ids_emitted !== false) throw new Error('estate_coverage_raw_source_id_policy_failed');
  if (coverage?.privacy?.unmatched_source_names_emitted !== false) throw new Error('estate_coverage_unmatched_name_policy_failed');
  for (const row of coverage?.observed || []) {
    if (row.source_id_emitted !== false) throw new Error('estate_coverage_source_id_emitted');
    if (row.disposition !== 'public_queue_match' && row.queue_product != null) {
      throw new Error('estate_coverage_unmatched_name_leak');
    }
  }
  return true;
}
