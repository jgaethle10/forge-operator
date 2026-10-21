import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/partnerships/index.html', import.meta.url), 'utf8');

test('operator partner front door has accessible sections and a safe route to owned Forge', () => {
  for (const name of ['hero-title', 'problems-title', 'calc-title', 'process-title']) {
    assert.match(html, new RegExp('id="' + name + '"'));
  }
  assert.match(html, /href="\/"/);
  assert.match(html, /No customer information collected on this page/);
  assert.doesNotMatch(html, /<form\b|<input[^>]+type="email"/i);
  assert.doesNotMatch(html, /https?:\/\/[^"'\s]+\/api\/checkout/i);
  assert.doesNotMatch(html, /Stone Insurance|Jason Stone|Carolyn Illman/i);
  assert.match(html, /Regulated industries require an independent legal and privacy review/);
});

test('offline calculator calculates time freed and illustrative capacity, without network access', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script && script[1], 'calculator script exists');
  const handlers = new Map();
  const nodes = Object.fromEntries(
    ['tasks','minutes','rate','tasksOut','minutesOut','rateOut','hours','value']
      .map((id) => [id, {
        value: id === 'tasks' ? '120' : id === 'minutes' ? '6' : id === 'rate' ? '28' : '',
        textContent: '',
        addEventListener(event, callback) { handlers.set(id + ':' + event, callback); },
      }])
  );
  const document = { getElementById(id) { assert.ok(nodes[id], 'known field ' + id); return nodes[id]; } };
  vm.runInNewContext(script[1], { document, Number, String }, { timeout: 1000 });
  assert.equal(nodes.hours.textContent, '12');
  assert.equal(nodes.value.textContent, '$336 / month');
  assert.equal(nodes.tasksOut.textContent, '120');

  nodes.tasks.value = '200';
  nodes.minutes.value = '9';
  nodes.rate.value = '40';
  handlers.get('rate:input')();
  assert.equal(nodes.hours.textContent, '30');
  assert.equal(nodes.value.textContent, '$1,200 / month');

  nodes.tasks.value = '0';
  handlers.get('tasks:input')();
  assert.equal(nodes.hours.textContent, '0');
  assert.equal(nodes.value.textContent, '$0 / month');
});
