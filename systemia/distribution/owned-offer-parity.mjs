/**
 * Read-only public offer parity audit.
 * Compares declared public /offers.json routes against exact approved buyer SKUs,
 * and catalog IDs. Never posts forms, creates orders, or asserts payment.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const ALIASES=Object.freeze({'findmypart':'part-quick'});
const OWNED_SPECIAL=Object.freeze({'ibmi-rescue':25000,'legacy-rescue':29900});
const cents=value=>typeof value==='string'&&/^\$\d+(?:\.\d{2})?$/.test(value)
  ?Math.round(Number(value.slice(1))*100):null;

export function reconcileOwnedOfferCatalog({ publicOffers, buyerDoors, capabilities }) {
  if (publicOffers?.schema!=='evercraft.public-human-offers.v1' ||
    buyerDoors?.schema!=='evercraft.payments.public-buyer-doors.v1' ||
    !Array.isArray(capabilities?.capabilities)) throw new TypeError('catalog_schema_mismatch');
  if (!Array.isArray(publicOffers.offers)||!Array.isArray(buyerDoors.offers)) throw new TypeError('offers_missing');
  const buyerBySlug=new Map(buyerDoors.offers.map(x=>[x.slug,x]));
  const catalogById=new Map(capabilities.capabilities.map(x=>[x.public_id,x]));
  const seen=new Set();
  const routes=publicOffers.offers.map(row=>{
    if(!row||typeof row.slug!=='string'||!(/^[a-z0-9-]+$/.test(row.slug))||seen.has(row.slug))
      throw new TypeError('duplicate_or_invalid_public_slug');
    seen.add(row.slug);
    const buyerSlug=ALIASES[row.slug]||row.slug;
    const buyer=buyerBySlug.get(buyerSlug)||null;
    const expectedCents=buyer?.amount_cents??OWNED_SPECIAL[row.slug]??null;
    const amount=cents(row.price);
    const exactCanonicalUrl=ORIGIN+'/offers/'+row.slug;
    const identity=catalogById.get(row.public_id)||null;
    const canonicalIdMatches=!!identity&&identity.commercial_state==='sell_now'&&
      cents(identity.entry_paid_offer?.price)===amount;
    const failures=[];
    if(!Number.isSafeInteger(expectedCents)) failures.push('no_approved_price_reference');
    if(amount!==expectedCents) failures.push('price_drift');
    if(row.url!==exactCanonicalUrl) failures.push('unexpected_host_or_slug');
    if(row.human_confirmation_required!==true) failures.push('human_confirmation_not_declared');
    if(row.checkout_is_not_payment!==true||row.paid_delivery_verified!==false) failures.push('paid_state_misrepresented');
    return {
      slug:row.slug, public_id:row.public_id, price:row.price,
      expected_cents:expectedCents, declared_cents:amount,
      declared_public_url:row.url,
      canonical_capability_mapping:canonicalIdMatches?'exact_declared_match':'unverified_or_generic_payment_id',
      checkout_post_verified:false, provider_paid_verified:false, fulfillment_verified:false,
      failures,
    };
  });
  const missingApprovedSlugs=buyerDoors.offers.filter(x=>!seen.has(x.slug)&&
    !(x.slug==='part-quick'&&seen.has('findmypart'))).map(x=>x.slug);
  const mismatches=routes.filter(x=>x.failures.length>0);
  return {
    schema:'evercraft.distribution.owned-offer-parity.v1',
    source_scope:'public_declaration_only_not_live_verification',
    declared_public_offer_count:routes.length,
    buyer_snapshot_offer_count:buyerDoors.offers.length,
    canonical_id_declared_match_count:routes.filter(x=>x.canonical_capability_mapping==='exact_declared_match').length,
    generic_or_unverified_id_count:routes.filter(x=>x.canonical_capability_mapping!=='exact_declared_match').length,
    missing_approved_buyer_slugs:missingApprovedSlugs,
    mismatches, routes,
    safe_to_claim_end_to_end:false, provider_paid_verified:false, revenue_verified:false
  };
}

async function fetchText(url) {
  const res=await fetch(url,{headers:{'Accept':'application/json, text/html;q=0.9','User-Agent':'Evercraft-distribution-readonly-canary/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!res.ok) throw new Error('GET_'+res.status+'_'+url);
  return await res.text();
}
async function main(){
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  const buyerDoors=load('public/.well-known/evercraft-payments-buyer-doors.json');
  const capabilities=load('public/chum/capabilities.json');
  const live=process.argv.includes('--live');
  const publicOffers=live?JSON.parse(await fetchText(ORIGIN+'/offers.json')):
    JSON.parse(fs.readFileSync(path.resolve(process.argv.find(a=>a.endsWith('.json'))||'systemia/distribution/owned-offer-parity-fixture.json'),'utf8'));
  const report=reconcileOwnedOfferCatalog({publicOffers,buyerDoors,capabilities});
  if(live) {
    const pageResults=[];
    for(const route of report.routes) {
      try {
        const html=await fetchText(route.declared_public_url);
        const expectedPriceText=route.price;
        const hasPrice=html.includes(expectedPriceText);
        pageResults.push({slug:route.slug,http_get_ok:true,price_text_present:hasPrice,
          has_form_markup:/<form[\s>]/i.test(html),has_customer_email_field:/name=["'](?:customer_ref|email|customer_email)["']/i.test(html),
          checkout_post_verified:false,paid_verified:false});
      }catch(e) {pageResults.push({slug:route.slug,http_get_ok:false,error:String(e).slice(0,140)});}
    }
    report.live_readback={
      observed_at_utc:new Date().toISOString(),origin:ORIGIN,method:'GET_only_no_orders',
      route_results:pageResults, verified_count:pageResults.filter(x=>x.http_get_ok&&x.price_text_present).length,
      fields_unverified:pageResults.filter(x=>!x.has_customer_email_field).map(x=>x.slug)
    };
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.mismatches.length||report.missing_approved_buyer_slugs.length||
    (live&&report.live_readback.verified_count!==report.declared_public_offer_count)) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('Public offer parity unavailable: '+e.message);process.exitCode=1});
