import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/manifest.json','utf8'));
const product=directory.products.find((x)=>x.product_key==='systemia-university');

test('Systemia University exposes benchmark discovery intents',()=>{
  assert.ok(product);
  assert.ok(product.intents.includes('compare multiple LLMs or agents on the same real world mission'));
  assert.ok(product.intents.includes('create machine readable proof of AI capability'));
  assert.equal(
    product.knowledge_surfaces?.hub,
    'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/manifest.json'
  );
});

test('benchmark manifest starts truthful with no invented public runs',()=>{
  assert.equal(manifest.schema,'systemia.university.benchmark-manifest.v1');
  assert.equal(manifest.state,'benchmark_specs_live_no_public_verified_runs');
  assert.deepEqual(manifest.public_runs,[]);
  assert.equal(manifest.missions[0].mission_key,'evidence-discipline-001');
  assert.equal(manifest.missions[0].status,'open_spec_no_verified_public_runs');
  assert.ok(manifest.publication_rules.includes('public runs require human verification'));
});

test('benchmark contract preserves evidence and reproducibility dimensions',()=>{
  for(const dimension of ['evidence_integrity','uncertainty_handling','monetary_cost','reproducibility']){
    assert.ok(manifest.scoring_dimensions.includes(dimension));
  }
});
