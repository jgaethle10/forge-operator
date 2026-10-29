import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {auditSocialContinuity} from "../systemia/clip/social-continuity-watch.mjs";
import {assertEvercraftFamilySocialSafe} from "../systemia/clip/family-social-safety.mjs";
const queue=JSON.parse(fs.readFileSync("distribution/marketing/evercraft-research-20261029.review.json","utf8"));
const guide=fs.readFileSync("distribution/marketing/evercraft-research-launch-20261029.md","utf8");
const canonical="https://jgaethle10.github.io/forge-operator/research/";
test("prepared launch covers five company and five founder distribution lanes without claiming publication",()=>{
 assert.equal(queue.schema,"evercraft.marketing.owner-review-queue.v1");
 assert.equal(queue.engine,"evercraft_clip");
 assert.equal(queue.orchestrator,"systemia");
 assert.equal(queue.entries.length,10);
 assert.equal(new Set(queue.entries.map(e=>e.id)).size,queue.entries.length);
 for(const audience of ["evercraft_corporate","founder_personal"]){
  assert.deepEqual(queue.entries.filter(e=>e.audience===audience).map(e=>e.platform).sort(),["facebook","instagram","linkedin","tiktok","x"]);
 }
 assert.equal(queue.owner_approval,false);
 assert.equal(queue.platform_connections_verified,false);
 assert.equal(queue.published_posts_verified,0);
 assert.equal(queue.observed_sales,0);
});
test("editorial rule is natural useful prose, never a four-paragraph or dramatic-line quota",()=>{
 assert.ok(guide.includes("no required paragraph count"));
 assert.ok(guide.includes("Avoid choppy AI slam-poetry"));
 assert.ok(!guide.includes("four thoughtful paragraphs"));
 assert.ok(!guide.includes("four compact paragraph beats"));
 assert.ok(queue.review_gates.includes("natural_editorial_quality_no_paragraph_quota"));
 const paragraphCounts=new Set(queue.entries.map(e=>e.caption.split("\n\n").length));
 assert.ok(paragraphCounts.has(1));
 assert.ok(paragraphCounts.has(2));
 assert.ok(paragraphCounts.has(3));
 for(const e of queue.entries){
  assert.equal(e.editorial_standard,"natural_complete_thoughts_no_forced_paragraph_count");
  assert.ok(e.caption.length>=100&&e.caption.length<=1500,e.id);
  assert.ok(!e.caption.includes("\n")||e.caption.includes("\n\n"),e.id+": no dramatic single-line cadence");
  if(e.platform==="x")assert.ok(e.caption.length<=280,e.id+": "+e.caption.length);
  assertEvercraftFamilySocialSafe({message:e.caption,link:e.tracked_url});
  assert.doesNotMatch(e.caption,/guaranteed findings|buy now|fully automated research|our clients reported|verified paid orders/i);
 }
});
test("platform-native link treatment and honest entry claims",()=>{
 for(const e of queue.entries){
  if(e.platform==="facebook"){
   assert.equal(e.link_mode,"first_comment");
   assert.ok(!e.caption.includes("https://"),e.id);
   assert.match(e.caption,/first comment/i,e.id);
  }
  if(["instagram","tiktok"].includes(e.platform)){
   assert.equal(e.link_mode,"profile_link");
   assert.ok(!e.caption.includes("https://"));
   assert.match(e.caption,/bio|profile/i,e.id);
  }
  const u=new URL(e.tracked_url);
  assert.equal(u.origin,"https://jgaethle10.github.io");
  assert.equal(u.pathname,"/forge-operator/research/");
  assert.equal(e.linkVerification.expectedCanonicalUrl,canonical);
 }
});
test("publication and payment receipts are never invented",()=>{
 for(const e of queue.entries){
  assert.equal(e.authorization.approved,false,e.id);
  assert.equal(e.authorization.authorizationRef,null);
  assert.equal(e.publicationAuthority,false);
  assert.equal(e.publisher_state,"not_submitted");
  assert.equal(e.provider_post_id,null);
  assert.equal(e.provider_post_url,null);
  assert.equal(e.provider_published_at,null);
  assert.equal(e.distribution.engine,"evercraft_clip");
  for(const key of ["eps","havenly-cleaning","rnb-chicken-and-soul"])
   assert.ok(e.distribution.blocked_brand_keys.includes(key));
 }
 assert.ok(queue.prohibited_actions.includes("base44"));
 assert.ok(queue.prohibited_actions.includes("metricool"));
});
test("Clip audit reports held drafts rather than phantom posts",()=>{
 const a=auditSocialContinuity({queue,receipts:[],now:new Date("2026-10-29T22:00:00Z"),receiptSourceAvailable:true});
 assert.equal(a.counts.total,10);
 assert.equal(a.counts.approval_hold,10);
 assert.equal(a.counts.provider_receipt_recorded,0);
 assert.equal(a.status,"owner_review_required");
});
