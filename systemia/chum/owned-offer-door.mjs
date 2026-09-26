function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function priceForTier(tier) {
  if (tier?.price) return String(tier.price);
  const numeric = Number(tier?.price_usd);
  return Number.isFinite(numeric) ? '$' + numeric.toLocaleString('en-US') : 'See published pricing';
}

export function renderOwnedOfferDoor({ offer, continuePath, canonicalUrl }) {
  const tiers = Array.isArray(offer?.offers) ? offer.offers : [];
  const tierMarkup = tiers.length
    ? tiers.map((tier) => {
        const name = esc(tier?.name || tier?.offer_key || 'Paid option');
        const price = esc(priceForTier(tier));
        const billing = tier?.billing ? ' · ' + esc(String(tier.billing).replace(/_/g, ' ')) : '';
        return '<li><strong>' + name + '</strong><span>' + price + billing + '</span></li>';
      }).join('')
    : '<li><strong>Published pricing</strong><span>' + esc(offer?.pricing || 'See offer review') + '</span></li>';

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="index,follow,max-snippet:-1">',
    '<title>' + esc(offer?.name || 'Evercraft offer') + ' | Evercraft</title>',
    '<meta name="description" content="' + esc(offer?.problem || 'Review this Evercraft capability and its published pricing before continuing.') + '">',
    '<link rel="canonical" href="' + esc(canonicalUrl || '') + '">',
    '<style>body{margin:0;background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}.wrap{max-width:760px;margin:0 auto;padding:48px 22px 72px}.eyebrow{color:#a1a1aa;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase}.card{border:1px solid #27272a;border-radius:18px;padding:22px;margin:22px 0;background:#111113}.price-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}.price-list li{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #27272a;padding:10px 0}.price-list li:last-child{border-bottom:0}.cta{display:inline-block;background:#fafafa;color:#09090b;text-decoration:none;font-weight:750;border-radius:12px;padding:13px 18px;margin-top:8px}.muted{color:#a1a1aa;font-size:.94rem}@media(max-width:560px){.price-list li{display:block}.price-list span{display:block;margin-top:3px}}</style>',
    '</head><body><main class="wrap">',
    '<p class="eyebrow">Evercraft · Purchase review</p>',
    '<h1>' + esc(offer?.name || 'Evercraft offer') + '</h1>',
    '<p>' + esc(offer?.problem || offer?.confirmation || 'Review the capability before continuing.') + '</p>',
    '<section class="card" aria-labelledby="pricing-heading">',
    '<h2 id="pricing-heading">Published pricing</h2>',
    '<p>' + esc(offer?.pricing || 'Current paid options are shown below.') + '</p>',
    '<ul class="price-list">' + tierMarkup + '</ul>',
    '</section>',
    '<section class="card" aria-labelledby="continue-heading">',
    '<h2 id="continue-heading">Continue when this fits</h2>',
    '<p>' + esc(offer?.confirmation || 'You choose whether to continue. No payment obligation is created by viewing this page.') + '</p>',
    '<a class="cta" href="' + esc(continuePath || '#') + '" aria-label="Continue to purchase review for ' + esc(offer?.name || 'this offer') + '">Continue to purchase review</a>',
    '<p class="muted">No charge happens on this page. Checkout creation is not proof of payment. Paid state requires authoritative provider verification.</p>',
    '</section>',
    '</main></body></html>'
  ].join('\n');
}
