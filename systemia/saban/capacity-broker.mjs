import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const json = (v) => JSON.stringify(canon(v));
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : json(v)).digest('hex');
const hmac = (v, key) => createHmac('sha256', key).update(json(v)).digest('hex');
const safeEq = (a, b) => {
  try { const x = Buffer.from(String(a), 'hex'); const y = Buffer.from(String(b), 'hex'); return x.length === y.length && timingSafeEqual(x, y); } catch { return false; }
};
const uniq = (v = []) => [...new Set(v.map(x => String(x).trim().toLowerCase()).filter(Boolean))];
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

export function normalizeCapacityOffer(raw, providerId) {
  const monthly = num(raw.monthly_price_usd, Infinity);
  const offer = {
    schema: 'evercraft.saban.capacity-offer.v1',
    provider_id: String(providerId), offer_id: String(raw.offer_id || ''), region: String(raw.region || ''),
    jurisdiction: String(raw.jurisdiction || '').toUpperCase(), currency: String(raw.currency || 'USD').toUpperCase(),
    monthly_price_usd: monthly, term_days: num(raw.term_days, 30), renewable: raw.renewable === true,
    auto_renew_supported: raw.auto_renew_supported === true, cpu_units: num(raw.cpu_units), memory_mb: num(raw.memory_mb),
    storage_gb: num(raw.storage_gb), bandwidth_mbps: num(raw.bandwidth_mbps), uptime_percent: num(raw.uptime_percent),
    labels: uniq(raw.labels), allocator_endpoint: raw.allocator_endpoint ? String(raw.allocator_endpoint) : null,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  };
  if (!offer.offer_id || !offer.region || !Number.isFinite(monthly) || monthly < 0) throw new Error('capacity_offer_invalid');
  return offer;
}

export function offerMeetsPolicy(o, p = {}) {
  const allowedProviders = uniq(p.allowed_providers || []); const allowedJurisdictions = uniq(p.allowed_jurisdictions || []).map(x => x.toUpperCase());
  if (allowedProviders.length && !allowedProviders.includes(o.provider_id.toLowerCase())) return [false, 'provider_not_allowed'];
  if (allowedJurisdictions.length && !allowedJurisdictions.includes(o.jurisdiction)) return [false, 'jurisdiction_not_allowed'];
  if (o.currency !== 'USD') return [false, 'currency_not_supported'];
  if (o.monthly_price_usd > num(p.max_monthly_usd, Infinity)) return [false, 'monthly_price_exceeds_limit'];
  if (o.term_days > num(p.max_term_days, Infinity)) return [false, 'term_exceeds_limit'];
  if (o.cpu_units < num(p.min_cpu_units)) return [false, 'cpu_below_minimum'];
  if (o.memory_mb < num(p.min_memory_mb)) return [false, 'memory_below_minimum'];
  if (o.storage_gb < num(p.min_storage_gb)) return [false, 'storage_below_minimum'];
  if (o.bandwidth_mbps < num(p.min_bandwidth_mbps)) return [false, 'bandwidth_below_minimum'];
  if (o.uptime_percent < num(p.min_uptime_percent)) return [false, 'uptime_below_minimum'];
  if (p.require_renewable === true && !o.renewable) return [false, 'renewability_required'];
  for (const label of uniq(p.required_labels || [])) if (!o.labels.includes(label)) return [false, `missing_label:${label}`];
  return [true, null];
}

export function scoreCapacityOffer(o, p = {}, existing = []) {
  const max = Math.max(1, num(p.max_monthly_usd, o.monthly_price_usd || 1));
  const price = Math.max(0, 1 - o.monthly_price_usd / max) * 40;
  const reliability = Math.max(0, Math.min(1, (o.uptime_percent - 99) / 1)) * 20;
  const resources = Math.min(20, Math.log2(1 + o.cpu_units) * 3 + Math.log2(1 + o.memory_mb / 1024) * 2 + Math.log2(1 + o.storage_gb));
  const diversity = existing.some(n => n.provider_id === o.provider_id && n.region === o.region) ? 0 : existing.some(n => n.provider_id === o.provider_id) ? 6 : 12;
  return Number((price + reliability + resources + diversity).toFixed(4));
}

export function createApprovalEnvelope({ approvalId, authority, policy, expiresAt }, key) {
  if (!key) throw new Error('approval_key_required');
  const body = { schema: 'evercraft.saban.capacity-approval.v1', approval_id: String(approvalId), authority: String(authority), policy: canon(policy || {}), expires_at: String(expiresAt), issued_at: new Date().toISOString() };
  return { ...body, signature: `hmac-sha256:${hmac(body, key)}` };
}

export function verifyApprovalEnvelope(envelope, key) {
  if (!envelope || envelope.schema !== 'evercraft.saban.capacity-approval.v1' || !key) return { ok: false, reason: 'approval_invalid' };
  if (Date.parse(envelope.expires_at || 0) <= Date.now()) return { ok: false, reason: 'approval_expired' };
  const { signature, ...body } = envelope; const expected = hmac(body, key); const actual = String(signature || '').replace(/^hmac-sha256:/, '');
  return safeEq(expected, actual) ? { ok: true, policy: body.policy, approval_id: body.approval_id, authority: body.authority } : { ok: false, reason: 'approval_signature_invalid' };
}

export class SabanCapacityBroker {
  constructor({ approvalKey, stateFile = null } = {}) {
    if (!approvalKey) throw new Error('approvalKey is required');
    this.approvalKey = approvalKey; this.stateFile = stateFile; this.providers = new Map(); this.state = { reservations: {}, receipts: [] };
    if (stateFile && fs.existsSync(stateFile)) this.state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
  persist() { if (!this.stateFile) return; fs.mkdirSync(path.dirname(this.stateFile), { recursive: true }); const t = `${this.stateFile}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(this.state, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(t, this.stateFile); }
  receipt(type, data) { const r = { schema: 'evercraft.saban.capacity-broker-receipt.v1', type, at: new Date().toISOString(), ...data }; r.receipt_hash = `sha256:${sha(r)}`; this.state.receipts.push(r); this.persist(); return r; }
  registerProvider(adapter) { if (!adapter?.id || adapter.authorized !== true || typeof adapter.discover !== 'function' || typeof adapter.reserve !== 'function') throw new Error('authorized_provider_adapter_required'); this.providers.set(String(adapter.id), adapter); return this; }
  async discover({ requirements = {}, providerIds = null } = {}) {
    const wanted = providerIds ? new Set(providerIds.map(String)) : null; const offers = []; const rejected = [];
    for (const [id, adapter] of this.providers) {
      if (wanted && !wanted.has(id)) continue;
      try { for (const raw of await adapter.discover(requirements) || []) offers.push(normalizeCapacityOffer(raw, id)); }
      catch (e) { rejected.push({ provider_id: id, reason: String(e?.message || e) }); }
    }
    this.receipt('capacity.discovered', { offer_count: offers.length, provider_count: this.providers.size }); return { offers, rejected };
  }
  plan({ offers, policy = {}, existingNodes = [] }) {
    const rejected = []; const eligible = [];
    for (const offer of offers || []) { const [ok, reason] = offerMeetsPolicy(offer, policy); if (!ok) rejected.push({ offer_id: offer.offer_id, provider_id: offer.provider_id, reason }); else eligible.push({ offer, score: scoreCapacityOffer(offer, policy, existingNodes) }); }
    eligible.sort((a, b) => b.score - a.score || a.offer.monthly_price_usd - b.offer.monthly_price_usd);
    const result = { schema: 'evercraft.saban.capacity-plan.v1', selected: eligible[0] || null, alternates: eligible.slice(1, 4), rejected, policy: canon(policy), generated_at: new Date().toISOString() };
    this.receipt('capacity.planned', { selected_offer_id: result.selected?.offer.offer_id || null, eligible_count: eligible.length, rejected_count: rejected.length }); return result;
  }
  async negotiate({ plan, approvalEnvelope = null }) {
    if (!plan?.selected?.offer) throw new Error('no_selected_capacity_offer'); const o = plan.selected.offer; const adapter = this.providers.get(o.provider_id); const verified = approvalEnvelope ? verifyApprovalEnvelope(approvalEnvelope, this.approvalKey) : { ok: false };
    const target = Math.max(0, Number((o.monthly_price_usd * 0.9).toFixed(2))); let proposal = { ...o, requested_monthly_price_usd: target };
    if (typeof adapter.negotiate === 'function') proposal = normalizeCapacityOffer(await adapter.negotiate({ offer: o, requested_monthly_price_usd: target, spend_authorized: verified.ok }) || o, o.provider_id);
    const result = { schema: 'evercraft.saban.capacity-negotiation.v1', original_offer: o, negotiated_offer: proposal, spend_authorized: verified.ok, auto_renew_requested: verified.ok && verified.policy?.allow_auto_renew === true && proposal.auto_renew_supported === true };
    this.receipt('capacity.negotiated', { offer_id: o.offer_id, provider_id: o.provider_id, spend_authorized: result.spend_authorized }); return result;
  }
  async reserve({ plan, approvalEnvelope, negotiated = null }) {
    const verified = verifyApprovalEnvelope(approvalEnvelope, this.approvalKey); if (!verified.ok) throw new Error(verified.reason);
    const offer = negotiated?.negotiated_offer || plan?.selected?.offer; if (!offer) throw new Error('no_selected_capacity_offer');
    const [allowed, reason] = offerMeetsPolicy(offer, verified.policy); if (!allowed) throw new Error(`approved_policy_rejects_offer:${reason}`);
    const key = `saban-capacity:${verified.approval_id}:${offer.provider_id}:${offer.offer_id}`; if (this.state.reservations[key]) return { ...this.state.reservations[key], deduplicated: true };
    const adapter = this.providers.get(offer.provider_id); if (!adapter?.authorized) throw new Error('provider_not_authorized');
    const providerReceipt = await adapter.reserve({ offer, idempotency_key: key, auto_renew: verified.policy?.allow_auto_renew === true && offer.auto_renew_supported === true, approval_ref: verified.approval_id });
    const reservation = { schema: 'evercraft.saban.capacity-reservation.v1', reservation_id: `scr_${sha(key).slice(0, 20)}`, idempotency_key: key, provider_id: offer.provider_id, offer_id: offer.offer_id, region: offer.region, jurisdiction: offer.jurisdiction, monthly_price_usd: offer.monthly_price_usd, term_days: offer.term_days, auto_renew: verified.policy?.allow_auto_renew === true && offer.auto_renew_supported === true, approval_id: verified.approval_id, provider_receipt: providerReceipt || {}, allocator_endpoint: providerReceipt?.allocator_endpoint || offer.allocator_endpoint || null, allocator_token_ref: providerReceipt?.allocator_token_ref || null, created_at: new Date().toISOString(), deduplicated: false };
    this.state.reservations[key] = reservation; this.receipt('capacity.reserved', { reservation_id: reservation.reservation_id, provider_id: reservation.provider_id, offer_id: reservation.offer_id, monthly_price_usd: reservation.monthly_price_usd, auto_renew: reservation.auto_renew }); this.persist(); return reservation;
  }
  snapshot() { return { schema: 'evercraft.saban.capacity-broker-snapshot.v1', providers: [...this.providers.keys()], reservations: Object.values(this.state.reservations), receipts: this.state.receipts.slice(-100) }; }
}
