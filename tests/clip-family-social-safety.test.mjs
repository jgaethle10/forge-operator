import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertEvercraftFamilySocialSafe} from '../systemia/clip/family-social-safety.mjs';
import {publishClipSocialPost} from '../systemia/clip/social-publisher-runtime.mjs';

const queue=JSON.parse(readFileSync(new URL('../public/clip/audience-sites/queue.json',import.meta.url),'utf8'));
const blockedCases=[
 {message:'Check our porn entertainment brand'},
 {title:'NSFW teaser'},
 {message:'Sexual-themed new campaign'},
 {message:'Join our OnlyFans'},
 {message:'Try nude photography'},
 {message:'Visit our erotic channel'},
 {message:'Follow adult entertainment content'},
 {link:'https://example.com/onlyfans/promo'},
 {link:'https://porn.example/videos'},
 {link:'https://example.com/path/sex-content'},
 {link:'https://example.com/%6e%73%66%77'}
];
test('Clip corporate family-safe guard blocks sexual copy, teasers and redirects',()=>{
 for(const blocked of blockedCases){
  assert.throws(()=>assertEvercraftFamilySocialSafe(blocked),
   /evercraft_social_(?:zero_sexual_content_hold|adult_link_blocked)/,JSON.stringify(blocked));
 }
});
test('Every current corporate campaign caption, CTA, title and link is family safe',()=>{
 assert.equal(queue.sites.length,7);
 for(const site of queue.sites){
  assert.doesNotThrow(()=>assertEvercraftFamilySocialSafe({
   title:site.clip_draft.metadata.title,
   message:site.caption,
   link:site.link,
   campaign:site.clip_draft.metadata.campaign
  }),site.id);
 }
});
test('Unreviewed or rejected media cannot be treated as approved',()=>{
 assert.throws(()=>assertEvercraftFamilySocialSafe({mediaSafetyReview:{decision:'unreviewed'}}),
  /evercraft_social_media_review_missing_or_unapproved/);
 assert.throws(()=>assertEvercraftFamilySocialSafe({mediaSafetyReview:{decision:'approved_nonsexual'}}),
  /evercraft_social_media_review_missing_or_unapproved/);
 assert.equal(assertEvercraftFamilySocialSafe({
  mediaSafetyReview:{decision:'approved_nonsexual',reviewerRef:'operator:visual-review-20261020'}
 }).mediaReviewed,true);
});
const goodRequest=(metadata)=>({
 schema:'evercraft.clip.social-publish-request.v1',
 id:'test-no-sexual-post',destination:'facebook-page',brandKey:'evercraft-audience-sites',
 authorization:{approved:true,authorizationRef:'test:manual-authority'},metadata
});
test('Social runtime rejects adult content BEFORE any provider or remote page request',async()=>{
 let fetchCount=0,providerCount=0;
 await assert.rejects(()=>publishClipSocialPost({
  request:goodRequest({title:'Visit our website',message:'New NSFW content',link:'https://example.com/clean'}),
  adapters:[{destination:'facebook-page',verified:true,async publish(){providerCount++;}}],
  policy:{allowPublishing:true,allowedDestinations:['facebook-page'],publicLinkPreflight:{fetchImpl:async()=>{fetchCount++;return {status:200};}}}
 }),/evercraft_social_zero_sexual_content_hold/);
 assert.equal(fetchCount,0);
 assert.equal(providerCount,0);
});
test('Social runtime rejects an adult final destination after safe-looking redirect',async()=>{
 let published=false;
 const receipt=await publishClipSocialPost({
  request:goodRequest({title:'Helpful utility',message:'Free useful tool',link:'https://example.com/clean'}),
  adapters:[{destination:'facebook-page',verified:true,async publish(){published=true;}}],
  policy:{allowPublishing:true,allowedDestinations:['facebook-page'],publicLinkPreflight:{
   fetchImpl:async url=>url.endsWith('/clean')
    ? {status:302,headers:new Headers({location:'https://example.com/onlyfans/'})}
    : {status:200,headers:new Headers({'content-type':'text/html'}),async text(){return '<title>Safe name</title>';}}
  }}
 });
 assert.equal(receipt.status,'failed');
 assert.match(receipt.error,/evercraft_social_adult_link_blocked/);
 assert.equal(published,false);
});
