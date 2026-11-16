import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = id === 'business' ? 'gym' : '';
    this.textContent = '';
    this.children = [];
    this.events = {};
    this.style = {};
    this.attrs = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  addEventListener(type, fn) { this.events[type] = fn; }
  setAttribute(name, value) { this.attrs[name] = value; }
  scrollIntoView() {}
  focus() {}
  fire(type = 'click') {
    assert.equal(typeof this.events[type], 'function', 'Missing listener for ' + this.id + ':' + type);
    this.events[type]();
  }
}

test('browser-only Remote Ops cockpit can play, compare, rewind, restart and finish', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const document = {
    getElementById: get,
    createElement: () => new FakeElement(),
    body: new FakeElement('body')
  };
  globalThis.document = document;
  try {
    await import('../public/remote-ops/app.mjs');
    assert.equal(get('business-detail').textContent.includes('Opening cash'), true);

    get('start').fire();
    assert.equal(get('setup').hidden, true);
    assert.equal(get('cockpit').hidden, false);
    assert.equal(get('choices').children.length, 6);
    assert.equal(get('day-title').textContent, 'Day 1 of 30');
    const initialCash = get('cash').textContent;

    get('choices').children[2].fire();
    assert.match(get('compare-note').textContent, /Compared with holding course today/);
    get('advance').fire();
    assert.equal(get('day-title').textContent, 'Day 2 of 30');
    assert.equal(get('rewind').disabled, false);
    assert.notEqual(get('cash').textContent, initialCash);

    get('rewind').fire();
    assert.equal(get('day-title').textContent, 'Day 1 of 30');
    assert.equal(get('cash').textContent, initialCash);
    assert.equal(get('rewind').disabled, true);

    get('restart').fire();
    assert.equal(get('setup').hidden, false);
    assert.equal(get('cockpit').hidden, true);

    get('business').value = 'service';
    get('business').fire('change');
    get('start').fire();
    for (let day = 0; day < 30; day += 1) {
      assert.equal(get('advance').disabled, false);
      get('advance').fire();
    }
    assert.equal(get('finish').hidden, false);
    assert.match(get('finish-title').textContent, /completed the 30-day flight/i);
    assert.equal(get('advance').disabled, true);

    get('rewind').fire();
    assert.equal(get('finish').hidden, true);
    assert.equal(get('day-title').textContent, 'Day 30 of 30');
    assert.equal(get('advance').disabled, false);
  } finally {
    delete globalThis.document;
  }
});

test('cockpit DOM references match actual static markup', async () => {
  const app = await readFile(new URL('../public/remote-ops/app.mjs', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/remote-ops/index.html', import.meta.url), 'utf8');
  const ids = [...new Set([...app.matchAll(/id\('([^']+)'\)/g)].map(match => match[1]))];
  assert.ok(ids.length > 30);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), 'Missing HTML id: ' + id);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|stripe\.com|base44\.app/i);
});
