import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {screenUpstreamCatalog} from './upstream-research-screen.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(fs.readFileSync(path.join(here,'../../research/open-source/karpathy-candidate-screen-20261116.json'),'utf8'));
const copy=()=>structuredClone(data);
test('six video references have no install, revenue or execution authority',()=>{
 const r=screenUpstreamCatalog(data);assert.equal(r.total,6);
 assert.deepEqual(r.candidates.map(x=>x.id),['autoresearch','nanoGPT','nanochat','llm-wiki','llm.c','micrograd']);
 assert.ok(r.candidates.every(x=>!x.admitted&&!x.customer_ready&&!x.revenue_verified&&!x.runtime_verified));
 assert.equal(r.allowed_to_install,0);assert.equal(r.allowed_to_run_on_owned_nodes,0);
});
test('autoresearch license requires separate review',()=>{
 const x=screenUpstreamCatalog(data).candidates.find(x=>x.id==='autoresearch');
 assert.equal(x.decision,'pattern_only');assert.equal(x.licensing_review_required,true);
});
test('LLM Wiki is an idea file, never executable authority',()=>{
 const x=screenUpstreamCatalog(data).candidates.find(x=>x.id==='llm-wiki');
 assert.equal(x.kind,'idea_file');assert.equal(x.execution_authority,'none');
});
test('duplicate identities rejected',()=>{
 const x=copy();x.candidates.push({...x.candidates[0]});
 assert.throws(()=>screenUpstreamCatalog(x),/invalid_candidate_contract/);
});
test('fake real-run or revenue evidence rejected',()=>{
 const x=copy();x.candidates[0].real_runtime_test=true;
 assert.throws(()=>screenUpstreamCatalog(x),/research_catalog_must_not_claim_unverified_results/);
 const y=copy();y.candidates[0].paid_customer_effect_verified=true;
 assert.throws(()=>screenUpstreamCatalog(y),/research_catalog_must_not_claim_unverified_results/);
});
test('unsafe source URL rejected',()=>{
 const x=copy();x.candidates[0].source_url='http://localhost:8787/private';
 assert.throws(()=>screenUpstreamCatalog(x),/candidate_source_invalid/);
});
