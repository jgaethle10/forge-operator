#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { offerCapabilityForSlug, renderOfferPage } from '../systemia/mcp/fabric-public-site.mjs';

// Preview only. Uses THE SAME HTML renderer as production but explicitly disables
// the form before writing any file. No buyer details or payment API is called.
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/build-fabric-payments-design-review.mjs <new-directory>');
const item = offerCapabilityForSlug('payments-pilot', []);
if (item?.entry_paid_offer?.price_usd_normalized !== 750) throw new Error('pilot_source_price_drift');
let html = renderOfferPage(item);
const originalForm = '<form class="checkout-form" method="post" action="/api/offers/payments-pilot/checkout">';
if (!html.includes(originalForm)) throw new Error('pilot_checkout_form_changed_unexpectedly');
if (!html.includes('Continue to checkout · $750') || !html.includes('class="pilot-buy-panel"'))
  throw new Error('pilot_buy_panel_not_ready');
html = html.replace(originalForm, '<form class="checkout-form" method="post" action="#" onsubmit="return false" data-preview-no-order="true">');
// Replace the unavailable relative production logo with an explicitly nonbrand
// proof icon for a self-contained offline file. Production branding is unchanged.
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="9" fill="#285cff"/><text x="18" y="25" font-family="Arial,sans-serif" font-size="21" font-weight="700" text-anchor="middle" fill="white">E</text></svg>';
html = html.replace('src="/assets/evercraft-icon.png"', 'src="data:image/svg+xml,' + encodeURIComponent(icon) + '"');
html = html.replace('</head>', '<style>.qa-preview-ribbon{position:fixed;z-index:99;top:8px;right:8px;padding:6px 9px;background:#f0cb72;color:#102032;border-radius:8px;font:700 10px/1.2 ui-sans-serif,sans-serif;box-shadow:0 5px 20px #0008}</style></head>');
html = html.replace('<body>', '<body><div class="qa-preview-ribbon">SOURCE PREVIEW • NOT LIVE • NO CHARGE</div>');
if (!html.includes('onsubmit="return false"') || html.includes('action="/api/offers/payments-pilot/checkout"'))
  throw new Error('pilot_offline_form_not_disabled');

const target = path.resolve(destination);
fs.mkdirSync(target, { recursive: true });
const file = path.join(target, 'payments-pilot.html');
fs.writeFileSync(file, html, { flag: 'wx' });
fs.writeFileSync(path.join(target, 'README.txt'),
  'Evercraft Fabric Payments Founding Integration | Code-sourced art review\n'
  + 'HTML derived from renderOfferPage on the PR branch. Form deliberately disabled. '
  + 'Visible brand icon is a placeholder. This is not a screenshot of deployed production, '
  + 'not an approval of mobile accessibility or actual payment.\n',
  {flag:'wx'});
process.stdout.write(JSON.stringify({ schema:'evercraft.fabric.payments-mobile-design-review.v1',
  html:file, source:'renderOfferPage', offer:'payments-pilot', price_cents:75000,
  production_form_unchanged:true, local_form_disabled:true, published:false })+'\n');
