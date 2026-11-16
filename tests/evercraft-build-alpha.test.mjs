import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePrompt, renderWebsite, escapeHtml, MAX_PROMPT_LENGTH} from '../public/build/engine.mjs';

test('website idea creates bounded, no-charge preview brief', () => {
  const brief = analyzePrompt({
    prompt:'Build my landscaping business a website with a gallery and estimate requests.',
    brand:'Cedar & Stone', kind:'website',
  });
  assert.equal(brief.schema,'evercraft.build.brief.v1');
  assert.equal(brief.state,'local_preview_only');
  assert.equal(brief.category,'Landscaping');
  assert.equal(brief.preview_supported,true);
  assert.ok(brief.requested_features.includes('Estimate requests'));
  assert.ok(brief.requested_features.includes('Project gallery'));
  assert.match(brief.deliverable,/No live backend/);
  assert.match(brief.warnings.join(' '),/No payment/);
  const html = renderWebsite(brief);
  assert.match(html,/Cedar &amp; Stone/);
  assert.match(html,/planned, not connected/);
  assert.match(html,/not a launched customer site/i);
  assert.doesNotMatch(html,/<script\b/i);
  assert.doesNotMatch(html,/<form\b/i);
});

test('app and automation requests do not masquerade as working applications', () => {
  for (const kind of ['app','automation']) {
    const brief = analyzePrompt({prompt:'Make me a customer billing and booking dashboard.',kind});
    assert.equal(brief.preview_supported,false);
    assert.match(brief.deliverable,/brief only/i);
    assert.throws(() => renderWebsite(brief),/Static preview/);
  }
});

test('untrusted business name is escaped and cannot inject HTML', () => {
  const brand = '<img src=x onerror=alert(1)>& "Hello"';
  const brief = analyzePrompt({prompt:'Build me a simple bakery website with a menu.',brand});
  const html = renderWebsite(brief);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;&amp;/);
  assert.equal(escapeHtml("'<>&\""),'&#39;&lt;&gt;&amp;&quot;');
});

test('invalid categories, short prompts, and oversized prompts are rejected', () => {
  assert.throws(() => analyzePrompt({prompt:'Make site'}),/at least 12/);
  assert.throws(() => analyzePrompt({prompt:'Make a website for a bakery.',kind:'deploy'}),/supported project/);
  assert.throws(() => analyzePrompt({prompt:'x'.repeat(MAX_PROMPT_LENGTH+1)}),/1,500/);
});

test('scope is exported as proposed requirements without execution authority', () => {
  const brief = analyzePrompt({
    prompt:'Build a restaurant website with accounts, payments, reservations, and a map.',
    kind:'landing',
  });
  assert.equal(brief.preview_supported,true);
  assert.equal(brief.state,'local_preview_only');
  assert.ok(brief.requested_features.includes('Customer accounts'));
  assert.ok(brief.requested_features.includes('Appointment scheduling'));
  assert.ok(brief.requested_features.includes('Location information'));
  assert.match(brief.warnings.join(' '),/No public website is deployed/);
  const html = renderWebsite(brief);
  assert.match(html,/planned, not connected/);
  assert.doesNotMatch(html,/https?:\/\/.*(stripe|checkout)/i);
});
