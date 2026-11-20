import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS, CATEGORIES, STATE_LABELS } from '../public/aiden-lab/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/aiden-lab');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Aiden science catalog has real, source-bound research rooms', () => {
  assert.ok(TOPICS.length >= 12);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length);
  assert.ok(CATEGORIES.includes('Health & medicine'));
  assert.ok(CATEGORIES.includes('Earth & environment'));
  assert.ok(CATEGORIES.includes('Space & flight'));
  assert.ok(CATEGORIES.includes('Computing & robotics'));
  for (const topic of TOPICS) {
    assert.match(topic.id, /^[a-z0-9-]+$/);
    assert.ok(topic.title.length >= 10);
    assert.ok(topic.summary.length >= 30);
    assert.ok(topic.question.endsWith('?'));
    assert.ok(topic.evidence.length > 45);
    assert.ok(topic.unknown.length > 35);
    assert.ok(topic.icon);
    assert.ok(CATEGORIES.includes(topic.category));
    assert.ok(Object.hasOwn(STATE_LABELS, topic.state));
    assert.ok(topic.links.length >= 1);
    for (const link of topic.links) {
      assert.ok(link.label.length > 4);
      const url = new URL(link.url, 'https://evercraft.example/aiden-lab/');
      assert.equal(url.protocol, 'https:');
      if (!link.url.startsWith('../')) {
        assert.ok(
          ['github.com', 'pubmed.ncbi.nlm.nih.gov', 'clinicaltrials.gov', 'earthquake.usgs.gov'].includes(url.hostname),
          'Unapproved source host in ' + topic.id
        );
      }
    }
  }
});

test('Medical research does not claim clinical validation', () => {
  const medical = TOPICS.filter((topic) => topic.category === 'Health & medicine');
  assert.ok(medical.length >= 3);
  for (const topic of medical) {
    assert.match(topic.unknown.toLowerCase(), /not|require|without/);
    assert.equal(topic.state, 'source_code');
  }
});

test('Public shell exposes real navigation and safe, accessible controls', () => {
  const html = read('index.html');
  for (const id of ['explore', 'medical', 'method', 'sources', 'search', 'filters', 'topicGrid', 'savedFilter', 'topicDialog']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /Skip to science atlas/);
  assert.match(html, /No account required/);
  assert.match(html, /not medical advice/i);
  assert.match(html, /script type="module" src="\.\/app\.mjs"/);
  assert.match(read('styles.css'), /prefers-reduced-motion/);
  assert.match(read('mark.svg'), /<svg/);
});

test('Explorer is read-only, privacy-first, and does not depend on third-party runtime', () => {
  const code = read('app.mjs');
  assert.match(code, /localStorage/);
  assert.match(code, /textContent/);
  assert.match(code, /aria-pressed/);
  assert.match(code, /noopener noreferrer/);
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.geolocation|innerHTML\s*=/);
  assert.doesNotMatch(read('index.html'), /base44|firebase|stripe\.com/i);
});
