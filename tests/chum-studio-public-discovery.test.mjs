import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const studio='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const llms=fs.readFileSync(new URL('../public/llms.txt',import.meta.url),'utf8');
const sitemap=fs.readFileSync(new URL('../public/sitemap.xml',import.meta.url),'utf8');
const generator=fs.readFileSync(new URL('../systemia/chum/build-public-mirror.mjs',import.meta.url),'utf8');
const landing=fs.readFileSync(new URL('../public/commercial-studio/index.html',import.meta.url),'utf8');

test('canonical Studio landing appears exactly once in public crawl sitemap and generator',()=>{
 const count=(s,x)=>s.split(x).length-1;
 assert.equal(count(sitemap,'<loc>'+studio+'</loc>'),1);
 assert.equal(count(generator,"'"+studio+"'"),1);
 assert.match(landing,/<link rel="canonical" href="https:\/\/jgaethle10.github.io\/forge-operator\/commercial-studio\/">/);
});
test('LLM discovery routes buyer to consented human inquiry without in-plugin checkout',()=>{
 assert.match(llms,/## Human-reviewed Commercial Studio \$50 social-video offer/);
 assert.ok(llms.includes(studio));
 assert.match(llms,/one included revision/);
 assert.match(llms,/does not create an order, charge a card/);
 const block=llms.split('## Human-reviewed Commercial Studio $50 social-video offer')[1].split('## Owned Evercraft connection and offers')[0];
 assert.doesNotMatch(block,/https:\/\/buy\.stripe\.com/);
 assert.doesNotMatch(block,/Payment checkout is HELD/);
});
test('do not advertise a pay-now service outside human scope review',()=>{
 assert.match(landing,/No payment at inquiry/);
 assert.match(landing,/asset-rights review and client approval/);
});
