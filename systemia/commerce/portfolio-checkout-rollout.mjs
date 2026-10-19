import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAYMENT_OFFERS } from '../mcp/public-payment-offers.mjs';

/**
 * Exact checkout continuation already exists through Evercraft Payments.
 * This adapter maps known approved SKUs to product and agent entry points.
 * It NEVER starts checkout, claims a payment, creates a new SKU, or changes
 * the merchant. Price and scope are taken from the approved buyer-door ledger.
 */
const BUYER_HOME = 'https://findmypart.base44.app/functions/evercraftBuy';
const FABRIC_HOME = 'https://fabric.systemiacommandcenters.com';
const CORE_SKUS = Object.freeze({
  'website-audit': { offer_key: 'systemia.website_audit_quick_win_49.v1', amount_cents: 4900 },
  'part-quick': { offer_key: 'findmypart.quick_hunt_19.v1', amount_cents: 1900 },
  'site-survive': { offer_key: 'evercraft_network.site_survive_rapid_audit_250.v1', amount_cents: 25000 },
});

function ensure(condition, code) {
  if (!condition) throw new Error('portfolio_payment_rollout_' + code);
}
export function buildPortfolioCheckoutMatrix({ buyer, crosswalk, catalog, contracts = PUBLIC_PAYMENT_OFFERS }) {
  ensure(buyer?.schema === 'evercraft.payments.public-buyer-doors.v1', 'buyer_schema');
  ensure(crosswalk?.schema === 'evercraft.fabric.verified-human-handoffs.v1', 'crosswalk_schema');
  ensure(buyer.live_buyer_home === BUYER_HOME, 'buyer_authority');
  ensure(buyer.revenue_verified_usd === null, 'unknown_revenue_must_remain_unknown');
  ensure(Array.isArray(buyer.offers) && buyer.offers.length === 13, 'approved_offer_count');
  ensure(Array.isArray(crosswalk.capabilities) && crosswalk.capabilities.length === 5, 'explicit_agent_mapping_count');
  ensure(Array.isArray(catalog?.capabilities), 'catalog_missing');

  const approved = new Map();
  const approvedKeys = new Set();
  for (const row of buyer.offers) {
    ensure(typeof row.slug === 'string' && /^[a-z0-9-]+$/.test(row.slug), 'bad_slug');
    ensure(!approved.has(row.slug) && !approvedKeys.has(row.offer_key), 'duplicate_approved_sku');
    ensure(row.currency === 'usd' && Number.isSafeInteger(row.amount_cents) && row.amount_cents > 0, 'invalid_amount');
    ensure(row.buyer_url === BUYER_HOME + '?offer=' + row.slug, 'redirect_mismatch');
    ensure(row.fulfillment_contract_state === 'ready_at_observation', 'fulfillment_contract_held');
    ensure(row.buyer_form_state === 'synthetic_post_redirect_verified' &&
      row.provider_page_state === 'live_mode_https_200_at_observation', 'buyer_observation_not_supported');
    ensure(row.payment_receipt_state === 'not_observed', 'provider_payment_claim_requires_new_audit');
    const contract = contracts[row.slug] || CORE_SKUS[row.slug];
    ensure(contract?.offer_key === row.offer_key && contract?.amount_cents === row.amount_cents &&
      (contract.currency === undefined || contract.currency === 'usd'), 'approved_sku_contract_drift_' + row.slug);
    approved.set(row.slug, row);
    approvedKeys.add(row.offer_key);
  }
  ensure(Object.keys(contracts).length + Object.keys(CORE_SKUS).length === approved.size &&
    [...Object.keys(contracts), ...Object.keys(CORE_SKUS)].every(slug => approved.has(slug)), 'unknown_approved_products');

  const catalogById = new Map(catalog.capabilities.map(c => [c.public_id, c]));
  const mappings = new Map();
  for (const entry of crosswalk.capabilities) {
    ensure(!mappings.has(entry.public_id) && catalogById.has(entry.public_id), 'unknown_or_duplicate_agent_capability');
    const item = catalogById.get(entry.public_id);
    ensure(item.commercial_state === 'sell_now', 'capability_not_for_sale');
    ensure(Array.isArray(entry.offer_slugs) && entry.offer_slugs.length &&
      entry.offer_slugs.includes(entry.primary_offer_slug) &&
      new Set(entry.offer_slugs).size === entry.offer_slugs.length, 'invalid_crosswalk');
    const primary = approved.get(entry.primary_offer_slug);
    ensure(primary && Math.round(Number(item.entry_paid_offer?.price_usd_normalized) * 100) === primary.amount_cents,
      'capability_primary_price_drift');
    for (const slug of entry.offer_slugs) {
      ensure(approved.has(slug), 'unapproved_agent_sku');
      ensure(![...mappings.values()].some(x => x.offer_slugs.includes(slug)), 'multiple_agent_sku_owners');
    }
    mappings.set(entry.public_id, entry);
  }

  const bySlug = new Map();
  for (const [publicId, entry] of mappings) {
    for (const slug of entry.offer_slugs) bySlug.set(slug, publicId);
  }
  const routes = [...approved.values()].map(row => {
    const publicId = bySlug.get(row.slug) || null;
    return {
      offer_slug: row.slug, offer_key: row.offer_key, offer_title: row.title,
      price_cents: row.amount_cents, currency: row.currency,
      approved_human_buyer_url: row.buyer_url,
      native_fabric_offer_url: FABRIC_HOME + '/offers/' + row.slug,
      mapped_agent_capability: publicId,
      connection_state: publicId ? 'exact_price_agent_handoff_review_candidate' : 'approved_human_offer_no_exact_agent_mapping',
      checkout_boundary: 'human_confirmation_then_evercraft_payments',
      observed_provider_checkout_state: row.provider_page_state,
      payment_verified: false, fulfillment_verified: false, payout_verified: false,
    };
  });

  const mapped = routes.filter(r => r.mapped_agent_capability);
  const unmapped = routes.filter(r => !r.mapped_agent_capability);
  return {
    schema: 'evercraft.fabric.portfolio-checkout-rollout.v1',
    source_state: 'approved_buyer_door_snapshot_with_source_only_agent_mapping',
    review_required: true,
    ready_for_publication: false,
    direct_offer_pages_source_wired: routes.length,
    exact_agent_capability_count: mappings.size,
    exact_agent_buyer_routes: mapped.length,
    approved_buyer_routes_needing_product_specific_agent_mapping: unmapped.length,
    total_discoverable_catalog_capabilities: catalog.capabilities.length,
    routes, unmapped_offer_slugs: unmapped.map(x => x.offer_slug),
    workflow: ['discover_specialist', 'show_exact_scope_price', 'human_approves',
      'evercraft_payments_checkout', 'provider_verified_paid', 'entitlement', 'artifact_delivery_receipt'],
    workflow_verified_through: 'provider_checkout_page_reached_in_prior_observation',
    verification_missing: ['independent_live_each_offer_checkout_canary', 'provider_paid_receipt',
      'refund_and_dispute', 'customer_entitlement', 'shipping_and_recipient_access'],
    changes_payment_authority: false, starts_transaction: false, synthetic_payment_is_revenue: false,
  };
}

export function buildPortfolioCheckoutMatrixFromRepository() {
  const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  return buildPortfolioCheckoutMatrix({
    buyer: read('public/.well-known/evercraft-payments-buyer-doors.json'),
    crosswalk: read('systemia/commerce/portfolio-human-buyer-handoffs-next.json'),
    catalog: read('public/chum/capabilities.json'),
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(buildPortfolioCheckoutMatrixFromRepository(), null, 2) + '\n');
}
