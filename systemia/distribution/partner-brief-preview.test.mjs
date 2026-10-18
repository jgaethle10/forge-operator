import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../public/partners/workflow-continuity/index.html', import.meta.url), 'utf8');
const brief = readFileSync(new URL('../../docs/commerce/WORKFLOW_CONTINUITY_PARTNER_BRIEF_20261017.md', import.meta.url), 'utf8');

test('review-only partner page cannot accidentally index before promotion', () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /Partner briefing · Review candidate/);
  assert.match(html, /not an active reseller agreement/);
});
test('partner brief routes to exact approved prices and owned customer offer pages', () => {
  for (const [price, slug] of [['$250','workflow-xray'],['$49','website-audit']]) {
    assert.match(html, new RegExp(price.replace('$','\\$')));
    assert.ok(html.includes('https://fabric.systemiacommandcenters.com/offers/'+slug));
    assert.ok(brief.includes('https://fabric.systemiacommandcenters.com/offers/'+slug));
  }
});
test('proof and checkout uncertainty remain conspicuous', () => {
  assert.match(html, /intentionally synthetic checkout scenario/);
  assert.match(html, /Checkout, settlement and fulfillment require separate verification/);
  assert.match(brief, /NOT SENT/);
  assert.match(brief, /No automatic resale or revenue share rights are implied/);
});
test('semantic accessible layout and reduced motion present', () => {
  for(const pattern of [/<html lang="en">/,/<meta name="viewport"/,/<main>/,/<h1 id="hero-title">/,/aria-labelledby="hero-title"/,/@media\(max-width:790px\)/,/@media\(prefers-reduced-motion:reduce\)/,/:focus-visible/]) {
    assert.match(html,pattern);
  }
});
test('no active external submission or secret collector in partner preview', () => {
  assert.doesNotMatch(html, /<form|fetch\s*\(|https:\/\/findmypart\.base44\.app|<script|api[_-]?key|sk_live_/i);
  assert.equal((html.match(/class="action primary"/g)||[]).length,1);
  assert.ok(!html.includes('guaranteed results'));
});
