import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMergeAdmission, domainsFor, isVolatileGenerated } from '../systemia/coordination/merge-admission.mjs';

test('clean nearby branch is admitted',()=>{
  const r=analyzeMergeAdmission({behindCount:2,aheadCount:3,changedFiles:['docs/guide.md'],baseChangedFiles:['systemia/chum/a.mjs']});
  assert.equal(r.admitted,true);
});

test('large drift is held even without overlap',()=>{
  const r=analyzeMergeAdmission({behindCount:21,changedFiles:['docs/guide.md'],baseChangedFiles:['README.md']});
  assert.equal(r.admitted,false);
  assert.ok(r.reasons.some((x)=>x.code==='branch_too_stale'));
});

test('exact overlap is held immediately',()=>{
  const r=analyzeMergeAdmission({behindCount:1,changedFiles:['server.ts'],baseChangedFiles:['server.ts']});
  assert.equal(r.admitted,false);
  assert.ok(r.reasons.some((x)=>x.code==='stale_exact_overlap'));
});

test('shared hot domain is held even on different files',()=>{
  const r=analyzeMergeAdmission({behindCount:1,changedFiles:['systemia/rivet/a.mjs'],baseChangedFiles:['public/rivet/llms.txt']});
  assert.equal(r.admitted,false);
  assert.ok(r.reasons.some((x)=>x.code==='stale_hot_domain'));
});

test('volatile generated-only changes are not admitted',()=>{
  const r=analyzeMergeAdmission({changedFiles:['public/chum/freshness.json','public/chum/crawler-radar.json']});
  assert.equal(r.admitted,false);
  assert.ok(r.reasons.some((x)=>x.code==='volatile_generated_only'));
});

test('older overlapping PR gets deterministic right of way',()=>{
  const r=analyzeMergeAdmission({changedFiles:['systemia/chum/new.mjs'],olderOpenPrCollisions:[{number:41,shared_hot_domains:['chum']}]});
  assert.equal(r.admitted,false);
  assert.ok(r.reasons.some((x)=>x.code==='older_pr_collision'));
});

test('domain and volatile classifiers stay bounded',()=>{
  assert.deepEqual(domainsFor(['systemia/chum/a.mjs','public/rivet/index.html']).sort(),['chum','rivet']);
  assert.equal(isVolatileGenerated('public/chum/proof/rivet.json'),true);
  assert.equal(isVolatileGenerated('systemia/chum/router.mjs'),false);
});
