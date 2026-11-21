import test from 'node:test';
import assert from 'node:assert/strict';
import {collectLeads,safeUrl,scanSource} from './merchant-public-media-scout.mjs';
test('extracts media candidates with unverified rights',()=>{
 const html='<meta property="og:image" content="https://cdn.example.com/pizza.jpg">'+
 '<meta property="og:video" content="https://cdn.example.com/pizza.mp4">'+
 '<img src="/images/hero.jpg" srcset="/images/small.jpg 300w, /images/large.jpg 1200w">'+
 '<img src="http://127.0.0.1/private.jpg"><img src="data:image/png;base64,aaa">';
 const leads=collectLeads(html,'https://restaurant.example.com/menu',{brand:'Flame & Brew',channel:'website'});
 assert.equal(leads.length,4);
 assert.ok(leads.some(x=>x.media_url==='https://restaurant.example.com/images/large.jpg'));
 assert.ok(leads.every(x=>x.rights==='unverified'&&!x.downloaded&&!x.verified_subject));
});
test('rejects local addresses and non-HTTPS',()=>{
 for(const url of ['http://example.com/a','https://localhost/x','https://127.0.0.1/x',
    'file:///etc/passwd','https://user:pw@example.com/x'])assert.equal(safeUrl(url),null);
});
test('rejects unsafe redirects',async()=>{
 const bad={ok:true,url:'http://127.0.0.1/secret',headers:new Map([['content-type','text/html']]),text:async()=>'<img src="/hi">'};
 await assert.rejects(scanSource({url:'https://merchant.example.com/'},{fetcher:async()=>bad}),/Unsafe redirect/);
});
test('handles valid public HTML response',async()=>{
 const good={ok:true,url:'https://merchant.example.com/menu',headers:new Map([['content-type','text/html']]),
   text:async()=>'<meta property="og:image" content="https://cdn.example.net/menu.jpeg">'};
 const r=await scanSource({brand:'Icy Tai',url:'https://merchant.example.com/menu'},{fetcher:async()=>good});
 assert.equal(r.length,1);assert.equal(r[0].brand,'Icy Tai');assert.equal(r[0].status,'candidate_only');
});