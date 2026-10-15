#!/usr/bin/env node
/**
 * Fail-closed, safe-to-repeat human Audit Center release canary.
 * ZERO valid purchasable checkout payloads. Never creates payment sessions.
 * Does not require secrets, a browser login, or production authorizations.
 * This probes the Base44-hosted route only. Forge GitHub CI does NOT deploy Base44.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SURFACES = Object.freeze({
  buyer_checkout: 'https://systemia-audit-pro.base44.app/functions/createCheckout',
  public_preflight: 'https://systemia-audit-pro.base44.app/functions/auditAgentGateway?view=preflight&domain=localhost',
  central_quote: 'https://findmypart.base44.app/functions/evercraftPaymentsOps',
  raven_context_preflight: 'https://base44.app/api/apps/6a7adc9666bfd8c5c2fb4069/functions/ravenNexusPurchaseIntent',
});
export const OFFER_KEY = 'systemia.website_audit_quick_win_49.v1';
export const BUYER_ORIGIN = 'https://systemia-audit-pro.base44.app';

// Missing origin or missing Quick Win website is rejected by BOTH historical
// and patched checkout handlers before Stripe. Avoid the tempting "bad origin
// plus valid website" probe: an old unsafe handler could create a session.
export const NEGATIVE_CHECKOUT_CASES = Object.freeze([
  { name: 'quick_missing_origin', body: {tier:'quick',domain:'public-example.org'}, expected_error:'approved_buyer_origin_required' },
  { name: 'quick_missing_domain', body: {tier:'quick',origin:BUYER_ORIGIN}, expected_error:'public_https_domain_required' },
  { name: 'complete_missing_origin', body: {tier:'complete',domain:'public-example.org'}, expected_error:'approved_buyer_origin_required' },
]);

export function enforceNoPurchasablePayload({name,body}) {
  if (!body || typeof body !== 'object') throw new Error('unsafe_checkout_probe_payload');
  const originPresent = Boolean(String(body.origin || '').trim());
  const domainPresent = Boolean(String(body.domain || '').trim());
  if (originPresent && domainPresent) throw new Error("unsafe_checkout_probe_"+name+": would be purchasable");
  if (body.tier !== 'quick' && body.tier !== 'complete') throw new Error('unexpected_checkout_tier');
  return true;
}

function baseCheck(name, pass, observed, expected) {
  return {name, pass, observed, expected};
}

async function request(fetchImpl, url, method, body, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {'accept':'application/json', ...(body === undefined ? {} : {'content-type':'application/json'})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers?.get?.('content-type') || '';
    const text = await response.text();
    const payload = JSON.parse(text);
    return {status:response.status, payload, content_type:contentType};
  } catch (error) {
    return {status: response?.status || null, payload:null, transport_error:String(error?.message || error).slice(0,180)};
  }
}

export async function runAuditCenterCheckoutCanary({fetchImpl=globalThis.fetch, timeoutMs=12000, clock=()=>new Date().toISOString()}={}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  const checks=[];
  for (const test of NEGATIVE_CHECKOUT_CASES) {
    enforceNoPurchasablePayload(test);
    const res=await request(fetchImpl,SURFACES.buyer_checkout,'POST',test.body,timeoutMs);
    checks.push(baseCheck(test.name,
      res.status===400 && res.payload?.error===test.expected_error && res.payload?.checkout_created===false,
      {http:res.status, error:res.payload?.error || null, checkout_created:res.payload?.checkout_created ?? null, transport_error:res.transport_error || null},
      {http:400,error:test.expected_error,checkout_created:false}));
  }
  const quote=await request(fetchImpl,SURFACES.central_quote,'POST',{action:'quote',offer_key:OFFER_KEY},timeoutMs);
  checks.push(baseCheck('central_quote_read_only',
    quote.status===200 && quote.payload?.ok===true && quote.payload?.offer?.offer_key===OFFER_KEY && quote.payload?.offer?.amount_cents===4900 && quote.payload?.offer?.currency==='usd' && quote.payload?.fulfillment?.ready===true,
    {http:quote.status, offer_key:quote.payload?.offer?.offer_key || null, amount_cents:quote.payload?.offer?.amount_cents ?? null, fulfillment_ready:quote.payload?.fulfillment?.ready ?? null, transport_error:quote.transport_error || null},
    {http:200,offer_key:OFFER_KEY,amount_cents:4900,fulfillment_ready:true}));
  const preflight=await request(fetchImpl,SURFACES.public_preflight,'GET',undefined,timeoutMs);
  checks.push(baseCheck('free_preflight_localhost_refused',
    preflight.status===200 && preflight.payload?.format_eligible===false && preflight.payload?.checkout_created===false && preflight.payload?.payment_confirmed===false,
    {http:preflight.status, format_eligible:preflight.payload?.format_eligible ?? null, checkout_created:preflight.payload?.checkout_created ?? null, payment_confirmed:preflight.payload?.payment_confirmed ?? null, transport_error:preflight.transport_error || null},
    {http:200,format_eligible:false,checkout_created:false,payment_confirmed:false}));
  const context=await request(fetchImpl,SURFACES.raven_context_preflight,'POST',{
    action:'website_audit_prepayment_preflight',
    capability_key:'website-audit-quick-win',
    user_confirmed:false,
    website_url:'https://customer-business.org/',
  },timeoutMs);
  checks.push(baseCheck('raven_audit_domain_preflight_without_payment',
    context.status===200&&context.payload?.ok===true&&context.payload?.schema==='raven.website-audit-context-preflight.v1'&&
      context.payload?.audited_domain==='customer-business.org'&&context.payload?.checkout_created===false&&
      context.payload?.payment_state==='unpaid'&&context.payload?.fulfillment_release===false,
    {http:context.status,schema:context.payload?.schema||null,audited_domain:context.payload?.audited_domain||null,checkout_created:context.payload?.checkout_created??null,transport_error:context.transport_error||null},
    {http:200,schema:'raven.website-audit-context-preflight.v1',audited_domain:'customer-business.org',checkout_created:false}));
  const passed=checks.filter(c=>c.pass).length;
  return {
    schema:'evercraft.audit-center.hosted-release-canary.v1',
    observed_at:clock(),
    source:'forge-operator/github-readonly-external-gate',
    release_state:passed===checks.length?'negative_path_passed_not_payment_certified':'blocked_live_mismatch',
    passed, failed:checks.length-passed, checks,
    purchase_eligible_requests_sent:0,
    raven_domain_custody_preflight_only:true,
    processor_sessions_independently_checked:false,
    payment_authority:'Evercraft Payments / Stripe, not this canary',
    truthful_boundary:'A fully passing canary proves only hosted negative-path checks, a read-only $49 quote and a non-purchasing Raven domain preflight. It does not prove authenticated checkout, Stripe settlement, customer receipt, actual order, fulfillment, source revision identity or production release approval. Never promote to sell-now based on this result alone.',
    independent_source_revision_verified:false,
    provider_paid_verified:false,
    fulfillment_delivered_verified:false,
  };
}

const invokedDirectly=Boolean(process.argv[1]) && fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if (invokedDirectly) {
  const path='artifacts/audit-center-checkout-canary/latest.json';
  const result=await runAuditCenterCheckoutCanary();
  mkdirSync('artifacts/audit-center-checkout-canary',{recursive:true});
  writeFileSync(path,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({release_state:result.release_state,passed:result.passed,failed:result.failed,checks:result.checks.map(x=>({name:x.name,pass:x.pass,observed:x.observed})),receipt:path},null,2));
  if(process.argv.includes('--require-negative-paths') && result.failed) process.exitCode=1;
}
