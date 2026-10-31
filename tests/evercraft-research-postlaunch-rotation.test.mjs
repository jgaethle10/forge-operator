import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const pack=JSON.parse(fs.readFileSync("distribution/marketing/evercraft-research-postlaunch-rotation-20261030.json","utf8"));
test("Research follow-up pack covers eight distinct company channels without replaying founder posts",()=>{
 assert.equal(pack.schema,"evercraft.clip.research-postlaunch-rotation.v1");
 assert.equal(pack.publisher,"systemia->evercraft_clip");
 assert.equal(pack.entries.length,8);
 assert.deepEqual(pack.entries.map(e=>e.channel).sort(),["bluesky","facebook","instagram","linkedin","threads","tiktok","x","youtube_shorts"]);
 assert.equal(new Set(pack.entries.map(e=>e.id)).size,8);
 assert.equal(new Set(pack.entries.map(e=>e.angle)).size,8);
 assert.equal(new Set(pack.entries.map(e=>e.caption)).size,8);
 assert.equal(pack.preflight.no_personal_account_reposts,true);
 assert.equal(pack.preflight.no_automatic_paid_spend,true);
});
test("every follow-up remains on a real public Research offer and is NOT presented as posted",()=>{
 for(const e of pack.entries){
  assert.ok(e.target.startsWith("evercraft_company_"),e.id);
  assert.ok(e.caption.length>80&&e.caption.length<1800,e.id);
  assert.equal(e.verified_publication,false,e.id);
  assert.equal(e.provider_post_url,null,e.id);
  assert.equal(e.provider_post_id,null,e.id);
  assert.equal(e.provider_published_at,null,e.id);
  assert.equal(e.publication_authorized,false,e.id);
  assert.equal(e.request_status,"prepared_awaiting_authenticated_clip_publish");
  assert.equal(new URL(e.tracked_url).pathname,"/forge-operator/research/");
  assert.doesNotMatch(e.caption,/guaranteed results|verified customer purchases|fully automated paid research/i);
  if(e.channel==="facebook"){assert.ok(!e.caption.includes("https://"));assert.equal(e.link_mode,"first_comment")}
  if(["tiktok","youtube_shorts"].includes(e.channel))assert.equal(e.media_required,"verified_playable_original_vertical_product_walkthrough");
 }
});
