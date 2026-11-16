import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('FindMyPart search uses existing brand wordmark and documented palette',()=>{
 const html=readFileSync('public/findmypart/search/index.html','utf8').toLowerCase();
 const homepage=readFileSync('public/findmypart/index.html','utf8').toLowerCase();
 const system=readFileSync('docs/launch/findmypart/BRAND_AND_PRODUCT_SYSTEM.md','utf8').toLowerCase();
 for(const hex of ['#151c25','#f16b27','#2565a3','#ffffff','#f7f8fa']){
   assert.ok(system.includes(hex), 'brand system documents '+hex);
   assert.ok(html.includes(hex), 'search page includes '+hex);
 }
 assert.ok(homepage.includes('#f16b27')&&homepage.includes('#2565a3'));
 assert.match(html,/brand\/wordmark\.svg/);
 assert.doesNotMatch(html,/#c5fc83|#101b20/);
});
