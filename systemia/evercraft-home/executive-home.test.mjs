import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,"public","index.html"),"utf8");

test("Executive Home exposes the evidence-driven operating brief",()=>{
  for(const required of [
    'Executive brief',
    'What needs attention now.',
    'brief-systemia',
    'brief-yard',
    'brief-network',
    'brief-services',
    'attention-list',
    'Evidence discipline',
    'Provider boundary',
  ]){
    assert.ok(html.includes(required),"missing executive brief contract: "+required);
  }
});

test("Executive Home preserves evidence boundaries",()=>{
  for(const required of [
    'Source inventory is not a live-deployment claim.',
    'Canonical Yard runtime state is not attached to this Home instance.',
    'Private node telemetry is not inferred.',
    'Missing evidence is never promoted to healthy.',
    'No evidence-backed operating exceptions are visible from this Home instance.',
  ]){
    assert.ok(html.includes(required),"missing evidence boundary: "+required);
  }
});

test("Executive Home still uses owned Direct Mode and optional providers",()=>{
  assert.ok(html.includes('Direct Mode'));
  assert.ok(html.includes('Systemia remains mission authority.'));
  assert.ok(html.includes('Outside AI and legacy builders remain optional.'));
  assert.equal(/neon|cyberpunk|hacker dashboard/i.test(html),false);
});

test("Executive Home remains mobile usable",()=>{
  assert.ok(html.includes('@media(max-width:600px)'));
  assert.ok(html.includes('.brief-grid,.strip{grid-template-columns:1fr}'));
});
