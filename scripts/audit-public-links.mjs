#!/usr/bin/env node
/**
 * Evercraft public route + payment-link inventory. Read-only.
 * Default is SOURCE ONLY. Opt in to --probe for HTTP GET/HEAD checks of
 * first-party GitHub Pages routes; never contacts Base44 or initiates checkout.
 *
 * node scripts/audit-public-links.mjs > link-audit.json
 * node scripts/audit-public-links.mjs --probe > link-audit.json
 *
 * Network outcomes never prove a purchase, posting, fulfillment or settlement.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const site = 'https://jgaethle10.github.io/forge-operator/';
const probe = process.argv.includes('--probe');
const max = Number(process.env.EVERCRAFT_AUDIT_PROBE_LIMIT || 100);
const all = [];
function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes:true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile() && ent.name === 'index.html') {
      const path = relative(root,p).replaceAll('\\','/');
      const route = path === 'index.html' ? '' : path.slice(0,-'index.html'.length);
      all.push({kind:'owned_public_source',source:'public/'+path,url:site+route,
        family:path.split('/')[0],source_present:true,
        observed_http:null,observed_at:null,verified_live:false,
        operational:false,settled:false});
    }
  }
}
walk(root);
all.sort((a,b)=>a.url.localeCompare(b.url));
const paymentFile = new URL('../public/mesh/checkout-ready/verified-links.json', import.meta.url);
const payment = JSON.parse(readFileSync(paymentFile,'utf8'));
const payments = (payment.links || []).map(x=>({
  kind:'processor_link_record',key:x.key,product:x.name,price:x.price,
  url:x.url,source:'public/mesh/checkout-ready/verified-links.json',
  snapshot_date:payment.checked_on,source_present:true,observed_http:null,
  observed_at:null,verified_live:false,operational:false,settled:false,
  payment_authority:'Evercraft Payments',
  caveat:'Historical processor-link record, not proof of an Evercraft order or payment'
}));
// Cross-check the three source-of-truth documents without assuming commerce is live.
const productDirectory = JSON.parse(readFileSync(new URL('../public/mesh/checkout-ready/products.json', import.meta.url),'utf8'));
const commercialReadiness = JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-commercial-readiness.json', import.meta.url),'utf8'));
const readinessFindings = [];
const priceByKey = new Map(payments.map(x=>[x.key,x]));
const productRows = (productDirectory.products || []).map(p=>{
  const source = priceByKey.get(p.sku_key);
  const expectedPage = 'public/' + new URL(p.landing_page).pathname.replace(/^\\/,'').replace(/^forge-operator\\//,'') + 'index.html';
  const sourceRoute = all.find(x=>x.source===expectedPage);
  const problems = [];
  if(!source) problems.push('no_exact_payment_link_inventory_record');
  if(source && source.url!==p.checkout_url) problems.push('catalog_checkout_url_mismatch');
  if(source && Number.parseInt(source.price.replace(/[^0-9]/g,''),10)!==p.price_usd) problems.push('catalog_price_mismatch');
  if(!sourceRoute) problems.push('missing_product_landing_page_source');
  const result={sku_key:p.sku_key,product:p.exact_checkout_product,
    listed_price_usd:p.price_usd,landing_page:p.landing_page,
    processor_checkout_url:p.checkout_url,source_page_present:!!sourceRoute,
    original_processor_link_recorded:!!source,
    exact_sku_source_consistent:problems.length===0,
    issues:problems,public_url_verified:false,
    processor_form_verified_now:false,canonical_order_verified:false,
    payment_received_verified:false,fulfillment_verified:false};
  if(problems.length) readinessFindings.push({sku_key:p.sku_key,issues:problems});
  return result;
});
if(productRows.length!==payments.length) readinessFindings.push({issue:'product_count_differs_from_exact_payment_links'});
const nativeCheckout={
  current_state:commercialReadiness.current_state,
  checkout_ready:commercialReadiness.commercial_checkout_ready===true,
  may_charge_customers:commercialReadiness.may_charge_customers===true,
  authenticated_provider_paid_receipt_observed:
    commercialReadiness.current_owned_payment_rail?.authenticated_provider_paid_receipt_observed===true,
  warning:'Native Evercraft Payments release is separate from seven existing exact-SKU hosted processor checkouts.'
};
const processorSnapshot={
  checked_on:commercialReadiness.separate_systemia_hosted_stripe?.checked_on||payment.checked_on,
  browser_verified_at:commercialReadiness.separate_systemia_hosted_stripe?.automated_browser_checked_at||null,
  browser_verified_count:commercialReadiness.separate_systemia_hosted_stripe?.automated_rendered_exact_sku_forms_verified||0,
  live_verified_now:false,automatic_reconciliation_proven:false,
  payment_received_verified:false
};

const legacy = JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json', import.meta.url),'utf8'));
const archived = (legacy.offers || []).map(x=>({
  kind:'legacy_buyer_offer_archived',key:x.slug,product:x.title,
  price_usd:x.amount_cents/100,
  source:'public/.well-known/evercraft-payments-buyer-doors.json',
  url:x.buyer_url,source_present:true,verified_live:false,
  contact_prohibited:true,reason:'Retired external provider boundary; never probe'
}));
const groups = Object.groupBy ? Object.groupBy(all,x=>x.family)
  : all.reduce((r,x)=>{(r[x.family]??=[]).push(x);return r},Object.create(null));
const overview = Object.fromEntries(Object.entries(groups)
  .map(([name,items])=>[name,items.length]));
const findings = [];
if (probe) {
  // Only explicit, limited, first-party routes. No arbitrary redirects.
  // Front-load the founder-reported broken and revenue-critical doors.
  // Sorting alphabetically alone would bury Clip/Journal beneath generated pages.
  const priorities = [
    'mesh/checkout-ready/', 'try/', 'journal/', 'legacy-rescue-lab/',
    'work-saban/', 'findmypart/',
    'forensiscope/', 'research/', 'fallen-studios/', 'rivet/'
  ].map(route=>site+route);
  const eligible = all.filter(x=>x.url.startsWith(site));
  const selected = new Set();
  const candidates = [...priorities.map(url=>eligible.find(x=>x.url===url))
    .filter(Boolean), ...eligible.filter(x=>x.url.split('/').length<=7)]
    .filter(x=>!selected.has(x.url)&&selected.add(x.url))
    .slice(0,Math.max(0,Math.min(max,500)));
  for (let i=0;i<candidates.length;i+=8) {
    await Promise.all(candidates.slice(i,i+8).map(async x=>{
      const checked = new Date().toISOString();
      try {
        const response = await fetch(x.url,{method:'GET',redirect:'manual',
          headers:{'user-agent':'Evercraft-Link-Inventory-ReadOnly/1.0','accept':'text/html'},
          signal:AbortSignal.timeout(8000)});
        x.observed_http=response.status;x.observed_at=checked;
        x.redirect_location=response.headers.get('location')||null;
        x.verified_live=response.status===200 &&
          /text\/html/i.test(response.headers.get('content-type')||'');
        // HTTP 200 alone does not establish a working product.
        if (!x.verified_live) findings.push({url:x.url,status:x.observed_http,
          redirect:x.redirect_location});
        await response.body?.cancel();
      } catch(e) {
        x.observed_at=checked;x.error=String(e?.name || 'network_error');
        findings.push({url:x.url,error:x.error});
      }
    }));
  }
}
const result={schema:'evercraft.public-link-inventory.v1',
  created_at:new Date().toISOString(),mode:probe?'first_party_get_probe':'source_only',
  ownership:'Evercraft',no_checkout_attempted:true,no_payment_attempted:true,
  no_legacy_provider_contact:true,
  scope:{source_index_pages:all.length,site_families:Object.keys(groups).length,
    payment_links_in_snapshot:payments.length,legacy_archived_offers:archived.length,
    probed:all.filter(x=>x.observed_at).length},
  note:'Source existence != public routing != functional product != payment completion. Observed HTTP null means untested. Generated routes are not separate businesses.',
  families:overview,findings,revenue_readiness:{native_checkout:nativeCheckout,processor_snapshot:processorSnapshot,source_consistency_findings:readinessFindings,products:productRows},public_routes:all,payment_link_records:payments,
  archived_legacy_offers:archived};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
