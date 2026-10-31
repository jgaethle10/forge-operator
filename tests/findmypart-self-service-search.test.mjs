import test from 'node:test';import assert from 'node:assert/strict';
import {analyzePartQuery,buildSourceSearches,createSavedSearch} from '../public/findmypart/search/engine.mjs';
test('normalization does not assert match or stock',()=>{
 const a=analyzePartQuery('  Ford 3600  hydraulic  pump  D8NN-600-AA ');
 assert.equal(a.valid,true);assert.deepEqual(a.candidateNumbers,['3600','D8NN-600-AA'].filter(x=>x!=='3600'?true:true));
 assert.ok(a.normalizedNumbers.includes('D8NN600AA'));
 const links=buildSourceSearches(a);assert.equal(links.length,4);
 for(const link of links){assert.equal(new URL(link.url).protocol,'https:');assert.ok(link.url.includes('Ford'))}
 const brief=createSavedSearch(a,links);assert.equal(brief.fitment,'unverified');assert.equal(brief.inventory,'unverified');assert.equal(brief.source_evidence.length,0);
});
test('rejects empty input and prevents arbitrary URL construction',()=>{
 assert.equal(analyzePartQuery('  ').valid,false);
 const a=analyzePartQuery('<script>alert(1)</script>');
 for(const item of buildSourceSearches(a))assert.ok(['www.google.com','www.ebay.com','www.bing.com'].includes(new URL(item.url).hostname));
});
