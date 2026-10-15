import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateInventory, probeOffer, main, INVENTORY } from '../scripts/verify-public-product-urls.mjs';

const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const copy = () => structuredClone(inventory);
const item = (id) => inventory.offers.find(o => o.id === id);
const html = (body, options={}) => new Response(body, { status: options.status || 200, headers: { 'content-type': options.type || 'text/html', ...(options.headers || {}) } });
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

test('all five canonical owned endpoints are accounted for and offline probe makes no network call', async () => {
  assert.equal(validateInventory(inventory).offer_count, 5);
  const x = await main([], async () => { throw Error('network not permitted in offline mode'); });
  assert.equal(x.ok, true);
  assert.equal(x.network_called, false);
  assert.equal(x.offer_count, 5);
});

test('unknown, duplicate, and missing products fail closed', () => {
  const duplicate = copy(); duplicate.offers.push({ ...duplicate.offers[0] });
  assert.throws(() => validateInventory(duplicate), /unknown_or_duplicate/);
  const missing = copy(); missing.offers.pop();
  assert.throws(() => validateInventory(missing), /incomplete_url_manifest/);
  const extra = copy(); extra.offers[0].id = 'unknown-app';
  assert.throws(() => validateInventory(extra), /unknown_or_duplicate/);
});

test('mistyped host, HTTPS downgrade, changed route, and malicious query are rejected', () => {
  for (const candidate of [
    'https://findmypart.base44.app.evil.invalid/',
    'http://findmypart.base44.app/functions/findMyPartAgentGateway?view=docs',
    'https://findmypart.base44.app/',
    'https://findmypart.base44.app/functions/findMyPartAgentGateway?view=docs&redirect=evil',
  ]) {
    const changed = copy(); changed.offers[0].url = candidate;
    assert.throws(() => validateInventory(changed), /canonical_url_drift/);
  }
});

test('no paid promotion without verified provider receipt', () => {
  const unsafe = copy(); unsafe.offers[0].paid_promotion_allowed = true;
  assert.throws(() => validateInventory(unsafe), /paid_promotion_without_payment_proof/);
  const misleading = copy(); misleading.offers[3].paid_checkout_state = 'provider_verified';
  misleading.offers[3].paid_promotion_allowed = true;
  assert.throws(() => validateInventory(misleading), /paid_promotion_without_payment_proof/);
});

test('distribution released requires independent publication receipt', () => {
  const changed = copy(); changed.offers[1].distribution_state = 'released';
  assert.throws(() => validateInventory(changed), /released_without_publication_receipt/);
});

test('HTML and JSON must have meaningful product signatures', () => {
  const changed = copy(); changed.offers[0].marker = '<div>';
  assert.throws(() => validateInventory(changed), /missing_html_content_signature/);
  const changed2 = copy(); changed2.offers[1].json_equals = {};
  assert.throws(() => validateInventory(changed2), /missing_json_contract/);
});

test('valid FindMyPart docs pass semantic GET only, never checkout', async () => {
  const calls=[];
  const answer=await probeOffer(item('findmypart-agent-docs'), async (url,opts) => {
    calls.push({url,opts}); return html('<h1>FindMyPart is callable by AI agents.</h1>');
  });
  assert.equal(answer.state,'verified_http_content_only');
  assert.equal(answer.checkout_verified,false);
  assert.equal(answer.mobile_buyer_tested,false);
  assert.equal(answer.publication_verified,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.method,'GET');
  assert.equal(calls[0].opts.redirect,'manual');
});

test('actual Career Command JSON offer contract is required', async () => {
  const valid = { ok:true,offer:{offer_key:'career.interview_sprint_19.v1',amount_cents:1900} };
  const result=await probeOffer(item('career-sprint-offer'), async()=>json(valid));
  assert.equal(result.state,'verified_http_content_only');
  await assert.rejects(() => probeOffer(item('career-sprint-offer'),async()=>json({...valid,offer:{...valid.offer,amount_cents:4900}})),/json_contract_mismatch/);
});

test('redirects and non-200 responses fail without visiting another host', async () => {
  let called=0;
  await assert.rejects(() => probeOffer(item('findmypart-agent-docs'), async()=>{ called++;return new Response(null,{status:302,headers:{location:'https://evil.invalid/'}}); }),/non_200_or_redirect/);
  assert.equal(called,1);
});

test('generic HTML app shell, wrong MIME, and oversize content are refused', async () => {
  const x=item('systemia-free-domain-check');
  await assert.rejects(() => probeOffer(x,async()=>html('<div id="root"></div>')),/html_product_signature_missing/);
  await assert.rejects(() => probeOffer(x,async()=>html(x.marker,{type:'application/json'})),/unexpected_mime/);
  await assert.rejects(() => probeOffer(x,async()=>html(x.marker,{headers:{'content-length':'1000000'}})),/oversize_content_length/);
  await assert.rejects(() => probeOffer(x,async()=>html('x'.repeat(99000)+x.marker)),/response_too_large/);
});

test('unapproved destinations never reach transport', async () => {
  const x={...item('blackbox-free-crash-test'),url:'https://evil.invalid/collect'};
  await assert.rejects(() => probeOffer(x,async()=>{ throw Error('must not call'); }),/unapproved_destination/);
});

test('live probe receipt preserves payment/publishing uncertainty', async () => {
  const calls=[];
  const output=await main(['--live'],async (url, opts)=>{
    calls.push({url,method:opts.method});
    const entry=inventory.offers.find(x=>x.url===url);
    if(entry.content_type==='application/json') return json({ok:true,offer:{offer_key:'career.interview_sprint_19.v1',amount_cents:1900}});
    return html('<html><head><title>'+entry.marker+'</title></head><body>bounded demonstration</body></html>');
  });
  assert.equal(output.ok,true);
  assert.equal(calls.length,5);
  assert.ok(calls.every(x=>x.method==='GET'));
  assert.ok(output.results.every(x=>x.state==='verified_http_content_only' && x.checkout_verified===false && x.publication_verified===false));
  assert.equal(output.payment_proof,false);
  assert.equal(output.publishing_proof,false);
});

test('negative live probe reports failed_closed rather than inventing success', async () => {
  const output=await main(['--live'],async()=>html('<html>not the intended product</html>'));
  assert.equal(output.ok,false);
  assert.equal(output.results.length,5);
  assert.ok(output.results.every(x=>x.state==='failed_closed'));
});

test('CLI rejects unknown modes and never offers a POST/payment mode', async () => {
  await assert.rejects(()=>main(['--buy']),/only_--live_is_supported/);
  await assert.rejects(()=>main(['--live','--post']),/only_--live_is_supported/);
});
