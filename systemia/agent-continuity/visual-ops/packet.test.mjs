import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildVisualOpsPacket } from './packet.mjs';
import { buildHTML, renderVisualOpsHTML } from './build.mjs';

const dir=dirname(fileURLToPath(import.meta.url));
const original=JSON.parse(readFileSync(resolve(dir,'../scenario.synthetic.json'),'utf8'));
const assessment=JSON.parse(readFileSync(resolve(dir,'assessment.synthetic.json'),'utf8'));
const fixture=()=>structuredClone(original);
test('builds a source-labeled graph, scrub sequence and immutable provenance',()=>{
  const packet=buildVisualOpsPacket(fixture(),assessment);
  assert.equal(packet.mode,'SYNTHETIC_REPLAY');
  assert.equal(packet.live,false);
  assert.equal(packet.read_only,true);
  assert.equal(packet.assessment,'UNKNOWN');
  assert.equal(packet.external_side_effect_verified,false);
  assert.equal(packet.verified_collateral,0);
  assert.equal(packet.possible_impacts,3);
  assert.equal(packet.timeline_kind,'ORDERED_ANALYSIS_NOT_OBSERVED_TIMESTAMPS');
  assert.ok(packet.nodes.some(n=>n.id==='spider'));
  assert.ok(packet.edges.some(e=>e.relation==='possible downstream'));
  assert.ok(packet.steps.every(s=>!Object.hasOwn(s,'occurred_at')));
  assert.match(packet.projection_sha256,/^[a-f0-9]{64}$/);
  assert.equal(packet.projection_sha256,buildVisualOpsPacket(fixture(),assessment).projection_sha256);
});
test('fail closed on claimed provider authentication or identity mismatch',()=>{
  assert.throws(()=>buildVisualOpsPacket(fixture(),{...assessment,externally_verified:true}),/Provider verification/);
  assert.throws(()=>buildVisualOpsPacket(fixture(),{...assessment,operation_id:'different'}),/identity mismatch/);
});
test('reject fabricated containment or alleged real-source flags',()=>{
  const bad=fixture(); bad.spider_society.action_taken=true;
  assert.throws(()=>buildVisualOpsPacket(bad,assessment),/must not claim/);
  const bad2=fixture(); bad2.spider_society.evidence_state='observed';
  assert.throws(()=>buildVisualOpsPacket(bad2,assessment),/not labeled synthetic/);
});
test('reject oversized scene and control characters',()=>{
  const tooMany=fixture();tooMany.possible_downstream=Array.from({length:31},(_,i)=>'possible-'+i);
  assert.throws(()=>buildVisualOpsPacket(tooMany,assessment),/oversized/);
  const poisoned=fixture();poisoned.possible_downstream=['item\nspoof'];
  assert.throws(()=>buildVisualOpsPacket(poisoned,assessment),/Unsafe display/);
});
test('escape packet at HTML boundary and never turn JSON into executable markup',()=>{
  const packet=buildVisualOpsPacket(fixture(),assessment);
  packet.synopsis='</script><script>alert(1)</script>';
  const html=renderVisualOpsHTML('<script id="ops-data" type="application/json">__OPS_PACKET_JSON__</script>',packet);
  assert.ok(!html.includes('</script><script>alert(1)</script>'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.ok(!html.includes('__OPS_PACKET_JSON__'));
  assert.throws(()=>renderVisualOpsHTML('no slot',packet),/insertion point/);
  const full=buildHTML(fixture(),assessment);
  assert.ok(full.includes('SYNTHETIC REPLAY'));
  assert.ok(full.includes('evercraft.agent-continuity.visual-ops.v1'));
});
