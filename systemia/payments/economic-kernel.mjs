import { createHash, randomUUID } from 'node:crypto';

export class PaymentsInvariantError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaymentsInvariantError';
    this.code = code;
  }
}

function fail(code, message) { throw new PaymentsInvariantError(code, message); }
function need(ok, code, message) { if (!ok) fail(code, message); }
function money(value, name) {
  need(Number.isSafeInteger(value) && value >= 0, 'invalid_minor_amount', name + ' must be a non-negative integer');
  return value;
}
function text(value, name) {
  need(typeof value === 'string' && value.trim(), 'invalid_string', name + ' must be non-empty');
  return value.trim();
}
function currency(value) {
  const result = text(value, 'currency').toUpperCase();
  need(/^[A-Z]{3}$/.test(result), 'invalid_currency', 'currency must be three letters');
  return result;
}
function clone(value) { return structuredClone(value); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function sum(rows) { return rows.reduce((total, row) => total + money(row.amount_minor, 'amount_minor'), 0); }

export class EvercraftPaymentsKernel {
  constructor({ clock = () => new Date().toISOString(), idFactory = randomUUID } = {}) {
    this.clock = clock;
    this.idFactory = idFactory;
    this.actors = new Map();
    this.quotes = new Map();
    this.orders = new Map();
    this.attempts = new Map();
    this.receipts = new Map();
    this.idempotency = new Map();
    this.ledger = [];
  }

  createActor({ actor_id, kind, display_name }) {
    const id = actor_id || 'actor_' + this.idFactory();
    need(!this.actors.has(id), 'actor_exists', 'actor already exists');
    const actor = { schema: 'evercraft.economic-actor.v1', actor_id: id, kind: text(kind, 'kind'), display_name: text(display_name, 'display_name'), created_at: this.clock() };
    this.actors.set(id, actor);
    return clone(actor);
  }

  createApprovedQuote({ quote_id, seller_actor_id, buyer_actor_id = null, currency: code, amount_minor, approved_by }) {
    need(this.actors.has(seller_actor_id), 'unknown_seller', 'seller must exist');
    if (buyer_actor_id) need(this.actors.has(buyer_actor_id), 'unknown_buyer', 'buyer must exist');
    const id = quote_id || 'quote_' + this.idFactory();
    need(!this.quotes.has(id), 'quote_exists', 'quote already exists');
    const amount = money(amount_minor, 'amount_minor');
    need(amount > 0, 'zero_value_quote', 'paid quote must be greater than zero');
    const quote = {
      schema: 'evercraft.price-quote.v1', quote_id: id, seller_actor_id, buyer_actor_id,
      currency: currency(code), amount_minor: amount,
      approval: { state: 'approved', approved_by: text(approved_by, 'approved_by'), approved_at: this.clock() },
      created_at: this.clock()
    };
    quote.quote_hash = hash(quote);
    this.quotes.set(id, quote);
    return clone(quote);
  }

  createOrder({ idempotency_key, quote_id, splits = [], entitlements = [], fulfillment_obligations = [] }) {
    const key = text(idempotency_key, 'idempotency_key');
    const quote = this.quotes.get(quote_id);
    need(quote && quote.approval.state === 'approved', 'unknown_or_unapproved_quote', 'approved quote required');
    const fingerprint = hash({ quote_id, splits, entitlements, fulfillment_obligations });
    const prior = this.idempotency.get(key);
    if (prior) {
      need(prior.fingerprint === fingerprint, 'idempotency_conflict', 'idempotency key reused with different economic content');
      return clone(this.orders.get(prior.order_id));
    }
    const normalizedSplits = splits.map((row, index) => ({
      split_id: row.split_id || 'split_' + (index + 1), beneficiary_actor_id: text(row.beneficiary_actor_id, 'beneficiary_actor_id'),
      amount_minor: money(row.amount_minor, 'split amount'), purpose: text(row.purpose || 'allocation', 'purpose'), state: 'allocated_not_paid'
    }));
    if (normalizedSplits.length) need(sum(normalizedSplits) === quote.amount_minor, 'split_total_mismatch', 'splits must exactly equal approved gross amount');
    const order = {
      schema: 'evercraft.payment-order.v1', order_id: 'order_' + this.idFactory(), idempotency_key: key,
      quote_id, quote_hash: quote.quote_hash, seller_actor_id: quote.seller_actor_id, buyer_actor_id: quote.buyer_actor_id,
      currency: quote.currency, amount_minor: quote.amount_minor, state: 'authorized_for_checkout', settlement_state: 'unsettled',
      splits: normalizedSplits,
      entitlements: entitlements.map((row, index) => ({ entitlement_id: row.entitlement_id || 'entitlement_' + (index + 1), capability: text(row.capability, 'capability'), quantity: row.quantity == null ? 1 : money(row.quantity, 'quantity'), state: 'locked_pending_payment' })),
      fulfillment_obligations: fulfillment_obligations.map((row, index) => ({ obligation_id: row.obligation_id || 'obligation_' + (index + 1), type: text(row.type || 'fulfillment', 'type'), subject: text(row.subject, 'subject'), state: 'locked_pending_payment' })),
      created_at: this.clock(), paid_at: null, receipt_id: null
    };
    this.orders.set(order.order_id, order);
    this.idempotency.set(key, { order_id: order.order_id, fingerprint });
    return clone(order);
  }

  createPaymentAttempt({ order_id, provider, provider_checkout_id = null }) {
    const order = this.orders.get(order_id);
    need(order, 'unknown_order', 'order required');
    need(order.state !== 'paid', 'order_already_paid', 'order already paid');
    const attempt = { schema: 'evercraft.payment-attempt.v1', attempt_id: 'attempt_' + this.idFactory(), order_id, provider: text(provider, 'provider'), provider_checkout_id, state: 'checkout_created_not_verified', created_at: this.clock() };
    this.attempts.set(attempt.attempt_id, attempt);
    order.state = 'checkout_created_not_verified';
    return clone(attempt);
  }

  verifySettlement({ attempt_id, evidence }) {
    const attempt = this.attempts.get(attempt_id);
    need(attempt, 'unknown_attempt', 'attempt required');
    const order = this.orders.get(attempt.order_id);
    need(order && order.state !== 'paid', 'order_already_paid', 'order already paid or missing');
    need(evidence && evidence.source === 'provider_server_verification', 'non_authoritative_payment_evidence', 'authoritative provider server verification required');
    need(evidence.verified === true && ['paid', 'succeeded'].includes(evidence.status), 'payment_not_settled', 'provider must verify settled payment');
    need(currency(evidence.currency) === order.currency, 'settlement_currency_mismatch', 'currency mismatch');
    need(money(evidence.amount_minor, 'settlement amount') === order.amount_minor, 'settlement_amount_mismatch', 'amount mismatch');
    const providerPaymentId = text(evidence.provider_payment_id, 'provider_payment_id');
    const at = this.clock();
    attempt.state = 'verified_paid';
    attempt.provider_payment_id = providerPaymentId;
    attempt.verified_at = at;
    order.state = 'paid';
    order.settlement_state = 'verified_settled';
    order.paid_at = at;
    order.entitlements = order.entitlements.map((row) => ({ ...row, state: 'active', activated_at: at }));
    order.fulfillment_obligations = order.fulfillment_obligations.map((row) => ({ ...row, state: 'ready_for_fulfillment', unlocked_at: at }));
    order.splits = order.splits.map((row) => ({ ...row, state: 'earned_pending_payout', earned_at: at }));
    const tx = 'ledger_tx_' + this.idFactory();
    const entries = [
      { schema: 'evercraft.ledger-entry.v1', ledger_transaction_id: tx, order_id: order.order_id, side: 'debit', account: 'external_settlement_asset', amount_minor: order.amount_minor, currency: order.currency },
      { schema: 'evercraft.ledger-entry.v1', ledger_transaction_id: tx, order_id: order.order_id, side: 'credit', account: 'gross_sales_clearing', amount_minor: order.amount_minor, currency: order.currency }
    ];
    this.assertBalancedTransaction(entries);
    this.ledger.push(...entries);
    const receipt = {
      schema: 'evercraft.revenue-receipt.v1', receipt_id: 'receipt_' + this.idFactory(), order_id: order.order_id,
      quote_id: order.quote_id, attempt_id, provider: attempt.provider, provider_payment_id: providerPaymentId,
      amount_minor: order.amount_minor, currency: order.currency, verified_at: at, ledger_transaction_id: tx,
      settlement_evidence_hash: hash(evidence), entitlements: clone(order.entitlements), fulfillment_obligations: clone(order.fulfillment_obligations), splits: clone(order.splits)
    };
    order.receipt_id = receipt.receipt_id;
    this.receipts.set(receipt.receipt_id, receipt);
    return clone(receipt);
  }

  assertBalancedTransaction(entries) {
    const debits = entries.filter((row) => row.side === 'debit').reduce((total, row) => total + money(row.amount_minor, 'debit'), 0);
    const credits = entries.filter((row) => row.side === 'credit').reduce((total, row) => total + money(row.amount_minor, 'credit'), 0);
    need(debits === credits, 'unbalanced_ledger_transaction', 'ledger debits must equal credits');
    return true;
  }

  getOrder(order_id) { return this.orders.has(order_id) ? clone(this.orders.get(order_id)) : null; }
  getLedgerForOrder(order_id) { return clone(this.ledger.filter((row) => row.order_id === order_id)); }
}
