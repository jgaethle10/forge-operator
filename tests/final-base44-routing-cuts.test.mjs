import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const runtimeFiles=[
  'systemia/chum/direct-door-readiness.mjs',
  'systemia/chum/router-recall.mjs',
  'systemia/yard/public-edge-activator.mjs',
  '.github/workflows/ci.yml',
];

test('final routing surfaces contain no hard-coded Base44 public URL',()=>{
  const offenders=[];
  for(const file of runtimeFiles){
    for(const line of read(file).split('\n')){
      if(line.includes('://')&&line.includes('base44.app')) offenders.push({file,line:line.trim()});
    }
  }
  assert.deepEqual(offenders,[]);
});

test('direct-door fallback is held until an owned route is verified',()=>{
  const source=read('systemia/chum/direct-door-readiness.mjs');
  assert.match(source,/state: 'held_owned_public_route_pending'/);
  assert.match(source,/remote_mcp: null/);
  assert.match(source,/mode: 'held_until_owned_route_verified'/);
  assert.match(source,/use_universal_router_first: false/);
  assert.match(source,/host !== 'base44\.app'/);
});

test('router recall holds unverified gateway cases instead of measuring them as misses',()=>{
  const source=read('systemia/chum/router-recall.mjs');
  assert.match(source,/held_no_owned_gateway/);
  assert.match(source,/owned_gateway_rank_recall/);
  assert.match(source,/held_gateway_cases/);
  assert.match(source,/base44_used:false/);
});

test('public edge activator has no legacy specialist gateway default',()=>{
  const source=read('systemia/yard/public-edge-activator.mjs');
  assert.match(source,/specialistGatewayUrl=''/);
  assert.match(source,/specialist_gateway_must_not_be_base44/);
  assert.match(source,/held_owned_specialist_gateway_unconfigured/);
});

test('Forge smoke test expects unconfigured buyer frontage to fail closed',()=>{
  const source=read('.github/workflows/ci.yml');
  assert.match(source,/buyerFrontage !== null/);
  assert.doesNotMatch(source,/base44\.app\/buy\/\{publicId\}/);
});

test('inventory preserves provenance and compatibility references without calling them runtime',()=>{
  const source=read('scripts/inventory-base44-runtime-debt.mjs');
  assert.match(source,/systemia\/saban\/capability-promotion-links\.json/);
  assert.match(source,/scripts\/promote-openai-owned-fabric\.mjs/);
  assert.match(source,/systemia\/sentinel\/architectural-invariants\.json/);
  assert.match(source,/provenance_evidence/);
  assert.match(source,/compatibility_or_guard/);

  // These references intentionally remain in source history/guardrails.
  assert.match(read('systemia/saban/capability-promotion-links.json'),/base44\.app/);
  assert.match(read('scripts/promote-openai-owned-fabric.mjs'),/base44\.app/);
  assert.match(read('systemia/sentinel/architectural-invariants.json'),/base44\.app/);
});
