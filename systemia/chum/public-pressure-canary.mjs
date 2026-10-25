#!/usr/bin/env node
// Public read-only canary. Does not generate buyer traffic or process payment.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const host = process.env.CHUM_PUBLIC_BASE || 'https://fabric.systemiacommandcenters.com';
const urls = [
  '/llms.txt',
  '/.well-known/evercraft-chum.json',
  '/offers.json',
  '/robots.txt',
  '/sitemap.xml',
  '/offers'
].map(path => new URL(path, host).toString());
const paymentLinks = [
  ['weekly-social', 'https://buy.stripe.com/4gM3cweaOcwJ1Za1I84AU0d'],
  ['asset-diagnosis', 'https://buy.stripe.com/dRm9AU0jYdANdHS72s4AU0a'],
  ['ai-boardroom-standard', 'https://buy.stripe.com/14AdRaaYC68lcDO0E44AU08'],
  ['ai-boardroom-financial', 'https://buy.stripe.com/3cIbJ2feSfIVcDO1I84AU09'],
  ['knowledge-activation', 'https://buy.stripe.com/dRmfZifeS1S59rCdqQ4AU07'],
  ['social-intelligence-launch', 'https://buy.stripe.com/8x24gA1o2eER0V672s4AU0b'],
  ['institutional-memory-system', 'https://buy.stripe.com/14AfZid6K54hfQ00E44AU06']
];
async function probe(url, kind, key) {
  const allowed = new Set(['fabric.systemiacommandcenters.com', 'buy.stripe.com', 'checkout.stripe.com']);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !allowed.has(parsed.hostname)) {
      return { key, kind, outcome: 'BLOCKED', reason: 'unapproved_origin' };
    }
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'Evercraft-CHUM-Canary/1.0' } });
    const location = res.headers.get('location');
    const redirectHost = location ? new URL(location, url).hostname : null;
    const validRedirect = !redirectHost || allowed.has(redirectHost);
    // Never assert that a checkout rendered merely because the hosted origin responded.
    const ok = res.status >= 200 && res.status < 400 && validRedirect;
    const body = res.status === 200 && kind === 'discovery' ? (await res.text()).slice(0, 100000) : '';
    return { key, kind, url, status: res.status, redirect_host: redirectHost,
      content_type: res.headers.get('content-type'), body_sha256: body ? createHash('sha256').update(body).digest('hex') : null,
      outcome: ok ? 'HTTP_REACHABLE_ONLY' : 'BLOCKED', reason: validRedirect ? null : 'unapproved_redirect' };
  } catch (err) {
    return { key, kind, url, outcome: 'UNOBSERVED', reason: err.name === 'AbortError' ? 'timeout' : 'request_failed' };
  } finally { clearTimeout(timeout); }
}
const targets = [...urls.map(url => [url, 'discovery', new URL(url).pathname]), ...paymentLinks.map(([key, url]) => [url, 'stripe_link', key])];
const results = [];
for (const [url, kind, key] of targets) results.push(await probe(url, kind, key));
const receipt = { schema: 'evercraft.chum.public-pressure-canary.v1', observed_at: new Date().toISOString(),
  proof_scope: 'unauthenticated_http_only_no_checkout_render_no_purchase', results };
const output = process.env.CHUM_RECEIPT_PATH || '/tmp/chum-public-canary.json';
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ receipt_path: output, observed_at: receipt.observed_at,
  reachable: results.filter(x => x.outcome === 'HTTP_REACHABLE_ONLY').length,
  blocked: results.filter(x => x.outcome === 'BLOCKED').length,
  unobserved: results.filter(x => x.outcome === 'UNOBSERVED').length,
  results }, null, 2));
if (results.some(x => x.outcome !== 'HTTP_REACHABLE_ONLY')) process.exitCode = 1;
