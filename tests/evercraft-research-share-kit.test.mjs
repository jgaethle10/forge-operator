import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("public/research/share/index.html","utf8");
const kit=JSON.parse(fs.readFileSync("public/research/share/captions.json","utf8"));
test("all five founder and company channel copy packages are ready and truthful",()=>{
 assert.equal(kit.schema,"evercraft.research.share-kit.v1");
 assert.equal(kit.live_social_posts_verified,0);
 assert.equal(kit.export_mode,"manual_user_action_only");
 assert.equal(kit.captions.length,10);
 for(const account of ["personal","company"]){
  assert.deepEqual(kit.captions.filter(x=>x.account===account).map(x=>x.channel).sort(),["facebook","instagram","linkedin","tiktok","x"]);
 }
 for(const item of kit.captions){
  assert.equal(item.post_status,"prepared_not_published");
  assert.ok(item.copy.length>100&&item.copy.length<1600);
  assert.ok(!/instant research results|fully automated reports|paid order already complete/i.test(item.copy));
  assert.equal(new URL(item.tracked_url).pathname,"/forge-operator/research/");
  if(item.channel==="facebook"){assert.equal(item.cta_mode,"first_comment");assert.ok(!item.copy.includes("http"))}
  if(["instagram","tiktok"].includes(item.channel))assert.equal(item.cta_mode,"profile_link");
 }
 assert.match(kit.offer,/Free local scope builder/);
});
test("image export has user interactions and no synthetic publication claims",()=>{
 for(const id of ["poster","format","download","native-share","copy-caption","copy-link","copy-comment","account","channel","caption"])assert.ok(source.includes('id="'+id+'"'),id);
 for(const size of ["1080,1350","1080,1920","1080,1080","1200,630"])assert.ok(source.includes(size),size);
 assert.match(source,/canv\.toBlob/);
 assert.match(source,/navigator\.share/);
 assert.match(source,/Share sheet closed\. Publication must be confirmed inside the destination app/);
 assert.match(source,/No logins, uploads, server tracking/);
 assert.doesNotMatch(source,/<script[^>]+src=|base44|metricool/i);
 assert.match(source,/Nothing here publishes/);
 assert.match(source,/noindex,nofollow/);
});

test("share kit uses the same actual vector brand asset in navigation and generated media",()=>{
 const logo=fs.readFileSync("public/research/assets/research-mark.svg","utf8");
 assert.ok(logo.includes('viewBox="0 0 72 72"'));
 assert.match(source,/src="\.\.\/assets\/research-mark\.svg"/);
 assert.match(source,/href="\.\.\/assets\/research-mark\.svg"/);
 assert.match(source,/productMark\.src="\.\.\/assets\/research-mark\.svg"/);
 assert.match(source,/ctx\.drawImage\(productMark/);
});
