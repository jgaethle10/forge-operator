function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function normalizeContact(contact = {}) {
  const startMs = timeMs(contact.start_at);
  const endMs = timeMs(contact.end_at);
  if (!contact.contact_id) throw new Error('contact_id_required');
  if (!startMs || !endMs || endMs <= startMs) throw new Error('contact_window_invalid');

  const state = String(contact.state || '').trim().toLowerCase();
  if (!['predicted', 'verified'].includes(state)) {
    throw new Error('contact_state_invalid');
  }

  const bandwidthMbps = finite(contact.bandwidth_mbps, 0);
  const efficiency = Math.max(0.05, Math.min(1, finite(contact.link_efficiency, 0.7)));
  const durationSeconds = Math.max(0, (endMs - startMs) / 1000);
  const transferableBytes = Math.floor(
    bandwidthMbps * 1_000_000 / 8 * durationSeconds * efficiency
  );

  return {
    contact_id: String(contact.contact_id),
    from: String(contact.from || ''),
    to: String(contact.to || ''),
    state,
    authorized: contact.authorized === true,
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    start_ms: startMs,
    end_ms: endMs,
    bandwidth_mbps: bandwidthMbps,
    link_efficiency: efficiency,
    transferable_bytes: transferableBytes,
    evidence: contact.evidence ? String(contact.evidence) : null
  };
}

export class TransientContactQueue {
  constructor({ maxEntries = 1000 } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries || 1000));
    this.contacts = new Map();
    this.entries = new Map();
  }

  upsertContact(contact) {
    const normalized = normalizeContact(contact);
    this.contacts.set(normalized.contact_id, normalized);
    return this.contact(normalized.contact_id);
  }

  contact(contactId) {
    const row = this.contacts.get(String(contactId));
    if (!row) return null;
    const { start_ms, end_ms, ...publicRow } = row;
    return structuredClone(publicRow);
  }

  schedule({
    bundle_id,
    envelope_ref,
    payload_bytes,
    expires_at,
    contact_id,
    metadata = {}
  } = {}) {
    const bundleId = String(bundle_id || '').trim();
    const envelopeRef = String(envelope_ref || '').trim();
    const contactId = String(contact_id || '').trim();
    const expiresMs = timeMs(expires_at);

    if (!bundleId) throw new Error('bundle_id_required');
    if (!envelopeRef) throw new Error('envelope_ref_required');
    if (!contactId) throw new Error('contact_id_required');
    if (!expiresMs) throw new Error('expires_at_invalid');
    if (!this.contacts.has(contactId)) throw new Error('contact_not_found');

    if (!this.entries.has(bundleId) && this.entries.size >= this.maxEntries) {
      throw new Error('transient_contact_queue_full');
    }

    const row = {
      schema: 'evercraft.transient-contact-bundle.v1',
      bundle_id: bundleId,
      envelope_ref: envelopeRef,
      payload_bytes: Math.max(0, Math.floor(finite(payload_bytes, 0))),
      expires_at: new Date(expiresMs).toISOString(),
      expires_ms: expiresMs,
      contact_id: contactId,
      metadata: structuredClone(metadata || {}),
      state: 'held',
      released_at: null,
      release_receipt_ref: null
    };

    this.entries.set(bundleId, row);
    return this.bundle(bundleId);
  }

  bundle(bundleId) {
    const row = this.entries.get(String(bundleId));
    if (!row) return null;
    const { expires_ms, ...publicRow } = row;
    return structuredClone(publicRow);
  }

  evaluate(bundleId, now = new Date()) {
    const row = this.entries.get(String(bundleId));
    if (!row) return { ready: false, reason: 'bundle_not_found' };
    if (row.state === 'released') return { ready: false, reason: 'already_released' };

    const nowMs = now instanceof Date ? now.getTime() : timeMs(now);
    if (!Number.isFinite(nowMs)) return { ready: false, reason: 'now_invalid' };
    if (nowMs >= row.expires_ms) return { ready: false, reason: 'bundle_expired' };

    const contact = this.contacts.get(row.contact_id);
    if (!contact) return { ready: false, reason: 'contact_not_found' };
    if (contact.authorized !== true) return { ready: false, reason: 'contact_not_authorized' };
    if (!contact.evidence) return { ready: false, reason: 'contact_evidence_missing' };
    if (contact.state !== 'verified') {
      return { ready: false, reason: 'contact_not_verified' };
    }
    if (nowMs < contact.start_ms) return { ready: false, reason: 'contact_not_open' };
    if (nowMs >= contact.end_ms) return { ready: false, reason: 'contact_closed' };
    if (contact.transferable_bytes < row.payload_bytes) {
      return { ready: false, reason: 'contact_capacity_insufficient' };
    }

    return {
      ready: true,
      reason: null,
      bundle: this.bundle(bundleId),
      contact: this.contact(row.contact_id)
    };
  }

  ready(now = new Date()) {
    return [...this.entries.keys()]
      .map((bundleId) => this.evaluate(bundleId, now))
      .filter((decision) => decision.ready === true);
  }

  markReleased(bundleId, {
    receipt_ref,
    released_at = new Date()
  } = {}) {
    const row = this.entries.get(String(bundleId));
    if (!row) throw new Error('bundle_not_found');
    if (row.state === 'released') return this.bundle(bundleId);

    const receiptRef = String(receipt_ref || '').trim();
    if (!receiptRef) throw new Error('release_receipt_ref_required');

    row.state = 'released';
    row.released_at = released_at instanceof Date
      ? released_at.toISOString()
      : new Date(released_at).toISOString();
    row.release_receipt_ref = receiptRef;
    return this.bundle(bundleId);
  }

  summary(now = new Date()) {
    const rows = [...this.entries.values()];
    const readyCount = this.ready(now).length;
    return {
      schema: 'evercraft.transient-contact-queue-summary.v1',
      contacts: this.contacts.size,
      bundles: rows.length,
      held: rows.filter((row) => row.state === 'held').length,
      released: rows.filter((row) => row.state === 'released').length,
      ready: readyCount
    };
  }
}
