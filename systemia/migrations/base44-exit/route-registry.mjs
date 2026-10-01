import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const SCHEMA = 'evercraft.base44.route-registry.v1';
const RECEIPT_SCHEMA = 'evercraft.base44.route-registry-receipt.v1';

function clean(value) {
  return String(value ?? '').trim();
}

function required(value, field) {
  const text = clean(value);
  if (!text) throw new Error(field + '_required');
  return text;
}

function safeKey(value, field) {
  const text = required(value, field).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(text)) throw new Error(field + '_invalid');
  return text;
}

function sha(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return 'sha256:' + createHash('sha256').update(input).digest('hex');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + process.pid + '.' + Math.random().toString(16).slice(2) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalizeDestination(value, { allowLoopbackProof = false } = {}) {
  const url = new URL(required(value, 'destination_url'));
  if (url.username || url.password) throw new Error('route_destination_credentials_forbidden');
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (loopback) {
    if (!allowLoopbackProof) throw new Error('route_destination_loopback_forbidden');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('route_destination_protocol_invalid');
  } else if (url.protocol !== 'https:') {
    throw new Error('route_destination_https_required');
  }
  return url.toString();
}

function entryId(productKey, surface) {
  return encodeURIComponent(productKey) + '__' + encodeURIComponent(surface);
}

export class Base44ExitRouteRegistry {
  constructor({ stateDir, allowLoopbackProof = false } = {}) {
    if (!stateDir) throw new Error('route_registry_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.allowLoopbackProof = Boolean(allowLoopbackProof);
    this.routesDir = path.join(this.stateDir, 'routes');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
    fs.mkdirSync(this.routesDir, { recursive: true, mode: 0o700 });
  }

  #file(productKey, surface) {
    const product = safeKey(productKey, 'product_key');
    const routeSurface = safeKey(surface, 'surface');
    return path.join(this.routesDir, entryId(product, routeSurface) + '.json');
  }

  #appendReceipt(body) {
    const receipt = {
      ...body,
      receipt_hash: sha(body)
    };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  get(productKey, surface) {
    const file = this.#file(productKey, surface);
    if (!fs.existsSync(file)) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record?.schema !== SCHEMA) throw new Error('route_registry_schema_invalid');
    return structuredClone(record);
  }

  stage({
    productKey,
    surface,
    destinationUrl,
    legacyUrl = '',
    releaseRef,
    deploymentReceiptRef,
    note = '',
    now = new Date()
  } = {}) {
    const product = safeKey(productKey, 'product_key');
    const routeSurface = safeKey(surface, 'surface');
    const destination = normalizeDestination(destinationUrl, {
      allowLoopbackProof: this.allowLoopbackProof
    });
    const release = required(releaseRef, 'release_ref');
    const deploymentReceipt = required(deploymentReceiptRef, 'deployment_receipt_ref');
    const at = new Date(now).toISOString();
    const previous = this.get(product, routeSurface);

    const record = {
      schema: SCHEMA,
      route_id: previous?.route_id || 'route_' + randomUUID(),
      product_key: product,
      surface: routeSurface,
      state: 'staged',
      destination_url: destination,
      destination_origin: new URL(destination).origin,
      legacy_route_fingerprint: clean(legacyUrl) ? sha(clean(legacyUrl)) : previous?.legacy_route_fingerprint || null,
      legacy_route_value_persisted: false,
      release_ref: release,
      deployment_receipt_ref: deploymentReceipt,
      route_binding_receipt_ref: null,
      route_probe_receipt_ref: null,
      cutover_receipt_ref: null,
      rollback_target: previous?.state === 'active' ? {
        destination_url: previous.destination_url,
        release_ref: previous.release_ref,
        route_binding_receipt_ref: previous.route_binding_receipt_ref,
        cutover_receipt_ref: previous.cutover_receipt_ref
      } : previous?.rollback_target || null,
      note: clean(note).slice(0, 500) || null,
      staged_at: at,
      verified_at: null,
      activated_at: null,
      updated_at: at
    };

    atomicJson(this.#file(product, routeSurface), record);
    const receipt = this.#appendReceipt({
      schema: RECEIPT_SCHEMA,
      receipt_id: 'route_registry_' + randomUUID(),
      operation: 'stage',
      product_key: product,
      surface: routeSurface,
      route_id: record.route_id,
      destination_fingerprint: sha(destination),
      release_ref: release,
      deployment_receipt_ref: deploymentReceipt,
      traffic_changed: false,
      legacy_route_value_emitted: false,
      occurred_at: at
    });
    return { record: structuredClone(record), receipt };
  }

  verify({
    productKey,
    surface,
    routeBindingReceiptRef,
    routeProbeReceiptRef,
    observedUrl = '',
    now = new Date()
  } = {}) {
    const product = safeKey(productKey, 'product_key');
    const routeSurface = safeKey(surface, 'surface');
    const current = this.get(product, routeSurface);
    if (!current) throw new Error('route_registry_entry_not_found');
    if (!['staged', 'verified'].includes(current.state)) throw new Error('route_registry_state_not_verifiable');

    const binding = required(routeBindingReceiptRef, 'route_binding_receipt_ref');
    const probe = required(routeProbeReceiptRef, 'route_probe_receipt_ref');
    if (clean(observedUrl)) {
      const observed = normalizeDestination(observedUrl, { allowLoopbackProof: this.allowLoopbackProof });
      if (observed !== current.destination_url) throw new Error('route_registry_probe_destination_mismatch');
    }

    const at = new Date(now).toISOString();
    const next = {
      ...current,
      state: 'verified',
      route_binding_receipt_ref: binding,
      route_probe_receipt_ref: probe,
      verified_at: at,
      updated_at: at
    };
    atomicJson(this.#file(product, routeSurface), next);
    const receipt = this.#appendReceipt({
      schema: RECEIPT_SCHEMA,
      receipt_id: 'route_registry_' + randomUUID(),
      operation: 'verify',
      product_key: product,
      surface: routeSurface,
      route_id: next.route_id,
      destination_fingerprint: sha(next.destination_url),
      route_binding_receipt_ref: binding,
      route_probe_receipt_ref: probe,
      traffic_changed: false,
      occurred_at: at
    });
    return { record: structuredClone(next), receipt };
  }

  activate({
    productKey,
    surface,
    cutoverReceiptRef,
    expectedRouteBindingReceiptRef,
    expectedReleaseRef,
    now = new Date()
  } = {}) {
    const product = safeKey(productKey, 'product_key');
    const routeSurface = safeKey(surface, 'surface');
    const current = this.get(product, routeSurface);
    if (!current) throw new Error('route_registry_entry_not_found');
    if (current.state !== 'verified') throw new Error('route_registry_verification_required');
    if (!current.route_probe_receipt_ref) throw new Error('route_registry_probe_receipt_required');
    if (current.route_binding_receipt_ref !== required(expectedRouteBindingReceiptRef, 'expected_route_binding_receipt_ref')) {
      throw new Error('route_registry_binding_receipt_mismatch');
    }
    if (current.release_ref !== required(expectedReleaseRef, 'expected_release_ref')) {
      throw new Error('route_registry_release_mismatch');
    }
    const cutover = required(cutoverReceiptRef, 'cutover_receipt_ref');
    const at = new Date(now).toISOString();
    const next = {
      ...current,
      state: 'active',
      cutover_receipt_ref: cutover,
      activated_at: at,
      updated_at: at
    };
    atomicJson(this.#file(product, routeSurface), next);
    const receipt = this.#appendReceipt({
      schema: RECEIPT_SCHEMA,
      receipt_id: 'route_registry_' + randomUUID(),
      operation: 'activate',
      product_key: product,
      surface: routeSurface,
      route_id: next.route_id,
      destination_fingerprint: sha(next.destination_url),
      release_ref: next.release_ref,
      route_binding_receipt_ref: next.route_binding_receipt_ref,
      route_probe_receipt_ref: next.route_probe_receipt_ref,
      cutover_receipt_ref: cutover,
      traffic_changed: true,
      occurred_at: at
    });
    return { record: structuredClone(next), receipt };
  }

  deactivate({ productKey, surface, reason = 'operator_requested', receiptRef, now = new Date() } = {}) {
    const product = safeKey(productKey, 'product_key');
    const routeSurface = safeKey(surface, 'surface');
    const current = this.get(product, routeSurface);
    if (!current) throw new Error('route_registry_entry_not_found');
    if (current.state !== 'active') throw new Error('route_registry_active_route_required');
    const authority = required(receiptRef, 'deactivation_receipt_ref');
    const at = new Date(now).toISOString();
    const next = {
      ...current,
      state: 'verified',
      cutover_receipt_ref: null,
      activated_at: null,
      updated_at: at
    };
    atomicJson(this.#file(product, routeSurface), next);
    const receipt = this.#appendReceipt({
      schema: RECEIPT_SCHEMA,
      receipt_id: 'route_registry_' + randomUUID(),
      operation: 'deactivate',
      product_key: product,
      surface: routeSurface,
      route_id: next.route_id,
      destination_fingerprint: sha(next.destination_url),
      authority_receipt_ref: authority,
      reason: clean(reason).slice(0, 240),
      traffic_changed: true,
      occurred_at: at
    });
    return { record: structuredClone(next), receipt };
  }

  resolve(productKey, surface, { includeVerifiedCandidate = false } = {}) {
    const record = this.get(productKey, surface);
    if (!record) return null;
    if (record.state === 'active') {
      return {
        product_key: record.product_key,
        surface: record.surface,
        destination_url: record.destination_url,
        release_ref: record.release_ref,
        route_binding_receipt_ref: record.route_binding_receipt_ref,
        cutover_receipt_ref: record.cutover_receipt_ref,
        authority: 'active_cutover'
      };
    }
    if (includeVerifiedCandidate && record.state === 'verified') {
      return {
        product_key: record.product_key,
        surface: record.surface,
        destination_url: record.destination_url,
        release_ref: record.release_ref,
        route_binding_receipt_ref: record.route_binding_receipt_ref,
        route_probe_receipt_ref: record.route_probe_receipt_ref,
        authority: 'verified_candidate_only'
      };
    }
    return null;
  }

  list() {
    if (!fs.existsSync(this.routesDir)) return [];
    return fs.readdirSync(this.routesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(this.routesDir, name), 'utf8')))
      .filter((row) => row?.schema === SCHEMA)
      .sort((a, b) => (a.product_key + ':' + a.surface).localeCompare(b.product_key + ':' + b.surface))
      .map((row) => structuredClone(row));
  }

  health() {
    const rows = this.list();
    return {
      schema: 'evercraft.base44.route-registry-health.v1',
      state: 'healthy',
      routes: rows.length,
      staged: rows.filter((row) => row.state === 'staged').length,
      verified: rows.filter((row) => row.state === 'verified').length,
      active: rows.filter((row) => row.state === 'active').length,
      legacy_route_values_persisted: false,
      automatic_cutover_allowed: false
    };
  }
}
