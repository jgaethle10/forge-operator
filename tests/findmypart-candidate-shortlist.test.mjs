import test from 'node:test';import assert from 'node:assert/strict';
import {candidateFromInput,addCandidate,removeCandidate} from '../public/findmypart/search/candidates.mjs';
import {analyzePartQuery,buildSourceSearches,createSavedSearch} from '../public/findmypart/search/engine.mjs';
const brief=()=>{const a=analyzePartQuery('Ford tractor hydraulic pump');return createSavedSearch(a,buildSourceSearches(a))};
test('shortlist retains uncertainty and buyer provenance',()=>{
 const next=addCandidate(brief(),{url:'https://example.com/parts/123',partNumber:'D8NN-600-AA',priceText:'$50',notes:'Check mounting bolts'});
 assert.equal(next.source_evidence.length,1);
 assert.equal(next.source_evidence[0].fitment,'unverified');
 assert.equal(next.source_evidence[0].inventory_verified,false);
 assert.equal(next.source_evidence[0].source,'buyer_entered');
 assert.equal(removeCandidate(next,0).source_evidence.length,0);
 assert.equal(brief().source_evidence.length,0);
 assert.throws(()=>addCandidate(next,{url:'https://example.com/parts/123'}),/already saved/);
});
test('blocks malicious or local-only links without inventing availability',()=>{
 for(const url of ['javascript:alert(1)','file:///etc/passwd','http://localhost/a','http://127.0.0.1/','https://user:pass@example.com/'])
  assert.throws(()=>candidateFromInput({url}));
 assert.equal(candidateFromInput({url:'https://example.com/a'}).price_verified,false);
});
