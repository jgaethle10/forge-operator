import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../public/forensiscope/',import.meta.url);
const html=fs.readFileSync(new URL('distribution/index.html',root),'utf8');
const llms=fs.readFileSync(new URL('distribution/llms.txt',root),'utf8');
const reddit=JSON.parse(fs.readFileSync(new URL('distribution/reddit-pack.json',root),'utf8'));
const social=JSON.parse(fs.readFileSync(new URL('editorial/social-pack.json',root),'utf8'));
const buyer='https://jgaethle10.github.io/forge-operator/forensiscope/';

test('ForensiScope distribution kit leads directly to verified customer entrance',()=>{
 assert.equal(reddit.product_url,buyer);
 assert.equal(social.buyer_url,buyer);
 assert.equal(reddit.purchase_state,'human_confirmed_email_inquiry_only');
 assert.equal(social.buyer_state,'human_confirmed_email_inquiry_no_checkout');
 assert.ok(llms.includes(buyer));
 assert.ok(html.includes(buyer));
 assert.ok(!html.includes('https://jgaethle10.github.io/forge-operator/chum/'));
 assert.ok(!llms.includes('https://jgaethle10.github.io/forge-operator/chum/'));
 for(const v of reddit.variants||[])assert.ok(!String(v.body||'').includes('https://jgaethle10.github.io/forge-operator/chum/'));
});

test('Distribution keeps affiliation disclosure, no spam and no paid claim',()=>{
 assert.equal(reddit.rules.disclose_affiliation,true);
 assert.equal(reddit.rules.no_astroturfing,true);
 assert.equal(reddit.rules.no_dm_outreach,true);
 assert.equal(reddit.no_checkout_or_paid_claim,true);
 assert.ok(llms.includes('does not charge, upload files'));
 const candidate=social.posts.find(x=>x.topic==='request-long-video-review');
 assert.ok(candidate);
 assert.equal(candidate.url,buyer);
 assert.equal(candidate.state,'approved_copy_candidate_not_published');
 assert.ok(candidate.copy.includes('ForensiScope'));
 assert.ok(candidate.copy.includes('Evercraft Payments'));
 assert.ok(candidate.copy.includes(buyer));
});
