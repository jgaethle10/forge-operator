import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const arenaUrl=new URL('../visualization/agent-trials.html',import.meta.url);
const graphUrl=new URL('../visualization/index.html',import.meta.url);

test('Agent Arena page has valid standalone JavaScript and explicit trust boundary',()=>{
  const html=readFileSync(arenaUrl,'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.match(html,/UNVERIFIED IMPORTS/);
  assert.match(html,/No trial evidence loaded/);
  assert.match(html,/No automatic promotion/);
  assert.doesNotMatch(scripts[0][1],/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
test('Living Graph links to Agent Arena',()=>{
  const graph=readFileSync(graphUrl,'utf8');
  assert.match(graph,/href="\.\/agent-trials\.html"/);
});
