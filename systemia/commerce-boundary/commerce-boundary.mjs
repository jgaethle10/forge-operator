import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

function clean(value) { return String(value ?? '').trim(); }
function safeKey(value, field, max = 255) {
  const key = clean(value);
  if (!key || key.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}
function sha(value) { return 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function appHash(appKey) { return createHash('sha256').update(appKey).digest('hex').slice(0, 32); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const SUCCESS = new Set(['paid','succeeded','complete','completed']);

export class EvercraftCommerceBoundary {
  constructor({ stateDir, adapters = {} } = {}) {
    if (!stateDir) throw new Error('commerce_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.ledgerDir = path.join(this.stateDir, 'verified-payments');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
    this.adapters = new Map();
    for (const [provider, adapter] of Object.entries(adapters || {})) this.registerProvider(provider, adapter);
  }

  registerProvider(providerInput, adapter) {
    const provider = safeKey(providerInput, 'payment_provider', 127);
    if (!adapter || typeof adapter.fetchPayment !== 'function') throw new Error('payment_adapter_invalid');
    this.adapters.set(provider, adapter);
    return this;
  }

  #location(appKeyInput, providerInput, paymentRefInput) {
    const appKey = safeKey(appKeyInput, 'app_key', 127);
    const provider = safeKey(providerInput, 'payment_provider', 127);
    const paymentRef = safeKey(paymentRefInput, 'payment_ref', 255);
    const refHash = createHash('sha256').update(`${provider}\n${paymentRef}`).digest('hex');
    return { appKey, provider, paymentRef, file: path.join(this.ledgerDir, appHash(appKey), `${refHash}.json`) };
  }

  #appendReceipt(body) {
    const receipt = { ...body, receipt_hash: sha(body) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  async verifyPayment({ appKey, provider, paymentRef, expected = {}, context = {}, now = new Date() } = {}) {
    const location = this.#location(appKey, provider, paymentRef);
    if (fs.existsSync(location.file)) {
      const prior = JSON.parse(fs.readFileSync(location.file, 'utf8'));
      if (prior?.schema !== 'evercraft.commerce.verified-payment.v1') throw new Error('verified_payment_schema_invalid');
      return { replayed: true, payment: structuredClone(prior), receipt: null };
    }
    const adapter = this.adapters.get(location.provider);
    if (!adapter) throw new Error('payment_adapter_not_registered');
    const observed = await adapter.fetchPayment({
      paymentRef: location.paymentRef,
      appKey: location.appKey,
      provider: location.provider,
      context
    });
    const status = clean(observed?.status).toLowerCase();
    if (!SUCCESS.has(status)) throw new Error('payment_not_successful');
    const amountMinor = Number(observed?.amount_minor ?? observed?.amountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error('payment_amount_invalid');
    const currency = clean(observed?.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('payment_currency_invalid');
    if (expected.amount_minor != null && Number(expected.amount_minor) !== amountMinor) throw new Error('payment_amount_mismatch');
    if (expected.currency && clean(expected.currency).toUpperCase() !== currency) throw new Error('payment_currency_mismatch');
    const at = new Date(now).toISOString();
    const body = {
      schema: 'evercraft.commerce.verified-payment.v1',
      verification_id: `payment_verification_${randomUUID()}`,
      app_key_hash: sha(location.appKey),
      provider: location.provider,
      payment_ref_hash: sha(location.paymentRef),
      provider_event_ref_hash: observed?.provider_event_ref ? sha(String(observed.provider_event_ref)) : null,
      status,
      amount_minor: amountMinor,
      currency,
      verified_at: at,
      provider_authoritative: true,
      card_data_stored: false
    };
    const payment = { ...body, verification_hash: sha(body) };
    atomicJson(location.file, payment);
    const receipt = this.#appendReceipt({
      schema: 'evercraft.commerce.verification-receipt.v1',
      receipt_id: `commerce_receipt_${randomUUID()}`,
      verification_hash: payment.verification_hash,
      app_key_hash: payment.app_key_hash,
      provider: payment.provider,
      payment_ref_hash: payment.payment_ref_hash,
      amount_minor: payment.amount_minor,
      currency: payment.currency,
      provider_authoritative: true,
      card_data_stored: false,
      occurred_at: at
    });
    return { replayed: false, payment: structuredClone(payment), receipt };
  }

  lookup({ appKey, provider, paymentRef } = {}) {
    const location = this.#location(appKey, provider, paymentRef);
    if (!fs.existsSync(location.file)) throw new Error('verified_payment_not_found');
    return structuredClone(JSON.parse(fs.readFileSync(location.file, 'utf8')));
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    return {
      schema: 'evercraft.commerce.health.v1',
      state: 'healthy',
      registered_providers: [...this.adapters.keys()].sort(),
      provider_authoritative_verification: true,
      creates_payment_obligations: false,
      stores_card_data: false
    };
  }
}
