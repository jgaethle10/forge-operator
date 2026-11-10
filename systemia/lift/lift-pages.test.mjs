import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=(name)=>fs.readFileSync(new URL('../../public/lift/'+name,import.meta.url),'utf8');
for(const name of ['index.html','review-demo.html']){
 test(name+' is syntactically valid and blocked from search indexing',()=>{
   const html=read(name);
   assert.match(html,/<meta\s+name="robots"\s+content="noindex,nofollow">/i);
   const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
   assert.ok(scripts.length>0,'embedded script expected');
   for(const source of scripts)assert.doesNotThrow(()=>new vm.Script(source,{filename:name}));
   assert.doesNotMatch(html,/<form\b/i,'no real intake forms may be exposed');
   assert.doesNotMatch(html,/https?:\/\/[^\s"'<>]+(?:stripe|paypal)/i,'payment checkout must stay disabled');
 });
}
test('community demo links its fictional reviewer walkthrough',()=>{
 assert.match(read('index.html'),/href="\.\/review-demo\.html"/);
});
test('review walkthrough discloses lack of authentication and real case processing',()=>{
 const html=read('review-demo.html');
 assert.match(html,/No accounts, actual cases, documents, donations/i);
 assert.match(html,/no server connection|no server/);
});
