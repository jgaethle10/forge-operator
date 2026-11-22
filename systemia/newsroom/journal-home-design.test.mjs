import assert from 'node:assert/strict';
import test from 'node:test';
import { renderJournalHome } from './journal-home-design.mjs';

const article = {
  slug: 'first-owned-story', title: 'A real discovery', dek: 'An evidence-backed report.',
  desk: 'Science', published_at: '2026-11-20T20:00:00.000Z'
};
test('flagship home is readable, navigable and honest about archive-only editions', () => {
  const html = renderJournalHome([], [article]);
  assert.match(html, /No current live edition/);
  assert.match(html, /Archived reporting, not a live update/);
  assert.match(html, /href="\.\/first-owned-story\/"/);
  assert.match(html, /id="desk-science"/);
  assert.match(html, /aria-label="Journal sections"/);
  assert.match(html, /@media\(max-width:550px\)/);
  assert.match(html, /Not documentary imagery/);
  assert.doesNotMatch(html, /text-card-first|breaking now/i);
});
test('current story gets accurate edition state without duplicate false archive status', () => {
  const html = renderJournalHome([article], []);
  assert.match(html, /Current reporting available/);
  assert.match(html, /id="latest-title"/);
  assert.match(html, /id="lead-title"/);
  assert.doesNotMatch(html, /No current live edition/);
  assert.doesNotMatch(html, /href="#archive"/);
});
test('story titles, captions and desk names are HTML-escaped', () => {
  const html = renderJournalHome([{
    ...article, title: '<script>alert(1)</script>', desk: '<img src=x>',
    hero_visual: {url:'https://example.com/photo.jpg',alt:'A "quoted" <thing>',caption:'<unsafe>'}
  }], []);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /A &quot;quoted&quot; &lt;thing&gt;/);
  assert.match(html, /&lt;unsafe&gt;/);
});
