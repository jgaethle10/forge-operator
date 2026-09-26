import assert from 'node:assert/strict';
import { scanLegacyRescuePublicSources, validatePublicSource } from './legacy-rescue-public-scan.mjs';

assert.throws(() => validatePublicSource({ key:'bad', url:'http://example.com' }), /https/);
assert.throws(() => validatePublicSource({ key:'bad', url:'https://127.0.0.1/a' }), /private/);
assert.throws(() => validatePublicSource({ key:'bad', url:'https://evil.test/a', allowed_hosts:['example.com'] }), /allowlisted/);

const source = {
  key:'test-source',
  name:'Test source',
  url:'https://example.com/page',
  allowed_hosts:['example.com'],
  min_poll_minutes:5,
  emit_on_first_seen:false,
  urgency:90,
  buyer_access:80,
  proofability:95,
  evidence_quality:100,
  days_to_cash:75,
};

const fakeFetch = async () => ({ ok:true, status:200, text:async () => '<html><body>version one</body></html>' });
const first = await scanLegacyRescuePublicSources({
  sources:[source],
  previousState:{sources:{}},
  fetchImpl:fakeFetch,
  now:new Date('2026-09-25T05:00:00Z'),
});
assert.equal(first.signals.length,0);
assert.equal(first.receipts[0].state,'seeded');

const same = await scanLegacyRescuePublicSources({
  sources:[source],
  previousState:first.state,
  fetchImpl:fakeFetch,
  now:new Date('2026-09-25T05:06:00Z'),
});
assert.equal(same.signals.length,0);
assert.equal(same.receipts[0].state,'unchanged');

const changedFetch = async () => ({ ok:true, status:200, text:async () => '<html><body>version two</body></html>' });
const changed = await scanLegacyRescuePublicSources({
  sources:[source],
  previousState:same.state,
  fetchImpl:changedFetch,
  now:new Date('2026-09-25T05:12:00Z'),
});
assert.equal(changed.signals.length,1);
assert.equal(changed.signals[0].change_type,'amendment');
assert.equal(changed.signals[0].urgency,90);
assert.equal(changed.receipts[0].state,'changed');

const notDue = await scanLegacyRescuePublicSources({
  sources:[{...source,min_poll_minutes:30}],
  previousState:changed.state,
  fetchImpl:async () => { throw new Error('must not fetch'); },
  now:new Date('2026-09-25T05:20:00Z'),
});
assert.equal(notDue.receipts[0].state,'skipped_not_due');

console.log(JSON.stringify({ok:true, seeded:first.receipts[0].state, changed:changed.signals.length, not_due:notDue.receipts[0].state}));

const linkSource = {
  ...source,
  key:'listing-source',
  url:'https://example.com/listing',
  discover_links:true,
  allowed_link_hosts:['example.com'],
  link_match_terms:['rfp'],
  emit_links_on_first_seen:false,
  emit_body_change_signal:false,
};
const listingFetch = async () => ({
  ok:true,
  status:200,
  text:async () => '<a href="/rfp/legacy-one">Legacy RFP One</a>',
});
const linkBaseline = await scanLegacyRescuePublicSources({
  sources:[linkSource],
  previousState:{
    sources:{
      'listing-source':{
        url:'https://example.com/listing',
        fingerprint:'old-fingerprint-without-link-baseline',
        last_checked_at:'2026-09-25T05:00:00Z',
      },
    },
  },
  fetchImpl:listingFetch,
  now:new Date('2026-09-25T05:31:00Z'),
});
assert.equal(linkBaseline.signals.length,0);
assert.equal(linkBaseline.receipts[0].link_baseline_missing,true);
assert.equal(linkBaseline.receipts[0].emitted_link_signals,0);
assert.equal(linkBaseline.state.sources['listing-source'].known_links.length,1);


const buyerSource = {
  key:'ibmi-buyer',
  name:'Example Manufacturing IBM i career evidence',
  company:'Example Manufacturing',
  url:'https://example.com/careers/ibmi',
  allowed_hosts:['example.com'],
  min_poll_minutes:5,
  emit_on_first_seen:false,
  emit_body_change_signal:false,
  buyer_signal:true,
  source_type:'official_company',
};
const buyerFetch = async () => ({
  ok:true,
  status:200,
  text:async () => '<html><body><h1>IBM i Programmer</h1><p>Join our team. Maintain RPGLE, SQLRPGLE, CL and DB2 applications plus APIs.</p></body></html>',
});
const buyerScan = await scanLegacyRescuePublicSources({
  sources:[buyerSource],
  previousState:{sources:{}},
  fetchImpl:buyerFetch,
  now:new Date('2026-09-25T20:30:00Z'),
});
assert.equal(buyerScan.signals.length,0);
assert.equal(buyerScan.buyer_signals.length,1);
assert.equal(buyerScan.buyer_signals[0].technology_use_state,'observed_public_strong');
assert.equal(buyerScan.buyer_signals[0].release_state,'unknown');
assert.equal(buyerScan.buyer_signals[0].buying_intent_state,'unknown');
assert.equal(buyerScan.buyer_signals[0].recommended_offer_key,'ibmi_estate_xray_250');
assert.equal(buyerScan.receipts[0].buyer_signal_state,'research_candidate');

// A hiring page mentioning IBM i 7.4 explicitly may route to the release-specific
// diagnostic, but even then it does not prove buying intent.
const v74BuyerFetch = async () => ({
  ok:true,
  status:200,
  text:async () => '<html><body>IBM i 7.4 RPG IV CL DB2 developer wanted. Upgrade and modernization work.</body></html>',
});
const v74BuyerScan = await scanLegacyRescuePublicSources({
  sources:[{...buyerSource,key:'ibmi-buyer-74',url:'https://example.com/careers/ibmi-74'}],
  previousState:{sources:{}},
  fetchImpl:v74BuyerFetch,
  now:new Date('2026-09-25T20:31:00Z'),
});
assert.equal(v74BuyerScan.buyer_signals[0].observed_release,'7.4');
assert.equal(v74BuyerScan.buyer_signals[0].recommended_offer_key,'ibmi_74_deadline_xray_250');
assert.equal(v74BuyerScan.buyer_signals[0].buying_intent_state,'unknown');
