import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryResearchLinks} from '../public/findmypart/search/recovery-links.mjs';
test('all six research routes are accessible without pretending to verify parts',()=>{
 const links=recoveryResearchLinks('1994 washer drive gear');
 assert.equal(links.length,6);
 assert.equal(new Set(links.map(x=>x.type)).size,6);
 for(const link of links){
  const url=new URL(link.url);
  assert.equal(url.protocol,'https:');
  assert.equal(url.hostname,'www.google.com');
  assert.equal(link.verified,false);
  assert.equal(link.state,'research_link_only');
 }
});
test('invalid search does not generate research links',()=>{
 assert.deepEqual(recoveryResearchLinks(''),[]);
 assert.deepEqual(recoveryResearchLinks('a'),[]);
});
