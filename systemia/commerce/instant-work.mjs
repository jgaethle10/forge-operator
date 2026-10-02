import { randomUUID } from 'node:crypto';

const EXCLUDED_PUBLIC_IDS = new Set([
  'rivet-site-underwriting-v1',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function priceUsd(tier) {
  const numeric = Number(tier?.price_usd ?? tier?.price_usd_normalized);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const raw = clean(tier?.price);
  const match = raw.match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedTier(tier, index) {
  const usd = priceUsd(tier);
  if (!Number.isFinite(usd)) return null;
  return {
    offer_key: clean(tier?.offer_key) || `tier_${index + 1}`,
    name: clean(tier?.name) || 'Paid option',
    billing: clean(tier?.billing) || 'one_time',
    price_usd: usd,
    amount_cents: Math.round(usd * 100),
    scope: clean(tier?.scope) || null,
    fulfillment: clean(tier?.fulfillment) || null,
  };
}

export function buildInstantWorkCatalog(machineCatalog) {
  const offers = Array.isArray(machineCatalog?.offers) ? machineCatalog.offers : [];

  return offers
    .filter((offer) =>
      offer?.commercial_state === 'sell_now' &&
      clean(offer?.public_id) &&
      clean(offer?.name) &&
      !EXCLUDED_PUBLIC_IDS.has(clean(offer.public_id))
    )
    .map((offer) => {
      const tiers = (Array.isArray(offer.offers) ? offer.offers : [])
        .map(normalizedTier)
        .filter(Boolean)
        .sort((a, b) => a.price_usd - b.price_usd);

      return {
        public_id: clean(offer.public_id),
        name: clean(offer.name),
        problem: clean(offer.problem),
        pricing: clean(offer.pricing),
        payment_authority: clean(offer.payment_authority) || 'Evercraft Payments',
        confirmation: clean(offer.confirmation),
        machine_state: clean(offer.machine_state),
        tiers,
        entry_offer: tiers[0] || null,
      };
    })
    .filter((offer) => offer.tiers.length > 0)
    .sort((a, b) => {
      const priceA = a.entry_offer?.price_usd ?? Number.POSITIVE_INFINITY;
      const priceB = b.entry_offer?.price_usd ?? Number.POSITIVE_INFINITY;
      return priceA - priceB || a.name.localeCompare(b.name);
    });
}

export function createEvercraftPaymentOrder({
  offer,
  offerKey,
  confirmed,
  origin,
}) {
  if (confirmed !== true) {
    throw new Error('Explicit human confirmation is required before checkout preparation.');
  }

  const tiers = Array.isArray(offer?.tiers) ? offer.tiers : [];
  const selected = clean(offerKey)
    ? tiers.find((tier) => tier.offer_key === clean(offerKey))
    : tiers[0];

  if (!selected) throw new Error('Selected paid offer is unavailable.');

  const orderId = 'epo_' + randomUUID().replace(/-/g, '');
  const base = clean(origin);
  const continuePath =
    '/api/chum/go/' + encodeURIComponent(offer.public_id) +
    '?surface=' + encodeURIComponent('instant_work') +
    '&provider=' + encodeURIComponent('evercraft') +
    '&offer_key=' + encodeURIComponent(selected.offer_key) +
    '&order_id=' + encodeURIComponent(orderId);

  return {
    schema: 'evercraft.payments.order.v1',
    order_id: orderId,
    authority: 'Evercraft Payments',
    settlement_router: 'Raven Nexus',
    settlement_adapter: 'selected_downstream',
    payment_state: 'not_verified',
    checkout_state: 'prepared_for_human_continuation',
    currency: 'USD',
    amount_cents: selected.amount_cents,
    amount_usd: selected.price_usd,
    product: {
      public_id: offer.public_id,
      name: offer.name,
      offer_key: selected.offer_key,
      offer_name: selected.name,
    },
    doctrine: {
      checkout_creation_is_not_payment_proof: true,
      paid_state_requires_authoritative_provider_verification: true,
      fulfillment_requires_verified_payment: true,
    },
    continue_url: base ? new URL(continuePath, base).toString() : continuePath,
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function storefrontHtml(catalog) {
  const cards = catalog.map((offer) => {
    const buttons = offer.tiers.map((tier) =>
      `<button type="button" data-public-id="${escapeHtml(offer.public_id)}" data-offer-key="${escapeHtml(tier.offer_key)}">${escapeHtml(tier.name)} · $${escapeHtml(tier.price_usd)}</button>`
    ).join('');

    return `<article><h2>${escapeHtml(offer.name)}</h2><p>${escapeHtml(offer.problem)}</p><p><strong>${escapeHtml(offer.pricing)}</strong></p><div class="tiers">${buttons}</div></article>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Instant Work</title>
<meta name="description" content="Buy bounded Evercraft work directly. Evercraft Payments owns the order; Raven Nexus routes settlement.">
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#0d0f12;color:#f6f7f8}
main{max-width:980px;margin:auto;padding:48px 20px 80px}
h1{font-size:clamp(2.2rem,6vw,4.8rem);line-height:.95;margin:0 0 18px}
.lede{max-width:760px;font-size:1.08rem;color:#c9ced6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:32px}
article{border:1px solid #2a2f36;border-radius:18px;padding:20px;background:#15181d}
article h2{margin-top:0}
article p{color:#cbd0d7;line-height:1.45}
.tiers{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
button{border:0;border-radius:999px;padding:11px 15px;font-weight:700;cursor:pointer}
.small{font-size:.88rem;color:#9299a4;margin-top:28px}
#status{min-height:1.4em;margin-top:18px}
</style>
</head>
<body><main>
<h1>Buy useful work now.</h1>
<p class="lede">Choose a bounded Evercraft deliverable. Your click prepares an Evercraft Payments order. Raven Nexus selects the settlement rail downstream. No checkout is treated as paid until provider verification succeeds.</p>
<div class="grid">${cards}</div>
<p id="status" role="status"></p>
<p class="small">Evercraft Payments is the order authority. Settlement providers are adapters, not the system of record.</p>
</main>
<script>
const statusEl=document.getElementById('status');
document.addEventListener('click', async (event) => {
  const button=event.target.closest('button[data-public-id]');
  if(!button) return;
  button.disabled=true;
  statusEl.textContent='Preparing secure Evercraft Payments handoff…';
  try{
    const response=await fetch('/api/instant-work/order',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        public_id:button.dataset.publicId,
        offer_key:button.dataset.offerKey,
        confirmed:true
      })
    });
    const payload=await response.json();
    if(!response.ok || !payload?.continue_url) throw new Error(payload?.error || 'Unable to prepare order.');
    window.location.assign(payload.continue_url);
  }catch(error){
    statusEl.textContent=error?.message || 'Unable to prepare order.';
    button.disabled=false;
  }
});
</script>
</body></html>`;
}

export function registerInstantWorkRoutes(app, {
  loadMachineCatalog,
  requestOrigin,
  limiter = null,
} = {}) {
  if (typeof loadMachineCatalog !== 'function') {
    throw new Error('loadMachineCatalog is required.');
  }

  const handlers = limiter ? [limiter] : [];

  app.get('/api/instant-work', ...handlers, (_req, res) => {
    const offers = buildInstantWorkCatalog(loadMachineCatalog());
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      schema: 'evercraft.instant-work.catalog.v1',
      provider: 'Evercraft LLC',
      payment_authority: 'Evercraft Payments',
      settlement_router: 'Raven Nexus',
      count: offers.length,
      offers,
    });
  });

  app.get('/instant-work', ...handlers, (_req, res) => {
    const offers = buildInstantWorkCatalog(loadMachineCatalog());
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(storefrontHtml(offers));
  });

  app.post('/api/instant-work/order', ...handlers, (req, res) => {
    try {
      const offers = buildInstantWorkCatalog(loadMachineCatalog());
      const publicId = clean(req.body?.public_id);
      const offer = offers.find((row) => row.public_id === publicId);
      if (!offer) {
        res.status(404).json({ ok: false, error: 'Instant-work offer is unavailable.' });
        return;
      }

      const order = createEvercraftPaymentOrder({
        offer,
        offerKey: req.body?.offer_key,
        confirmed: req.body?.confirmed,
        origin: typeof requestOrigin === 'function' ? requestOrigin(req) : '',
      });

      res.status(201).json({
        ok: true,
        ...order,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
