import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../public/',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const publics=[...['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes'].map(x=>'audience-sites/'+x+'/index.html'),...['pet-play','tool-rent-or-buy','auto-fitment'].map(x=>'affiliate-labs/'+x+'/index.html')];
const gate=JSON.parse(fs.readFileSync(new URL('../systemia/affiliate-commerce/brand-isolation-policy.json',import.meta.url),'utf8'));
test('ten publisher properties are explicitly not corporate-marketed or search-indexable before independent hosting',()=>{
 assert.equal(publics.length,10);
 assert.equal(gate.properties.length,10);
 assert.equal(gate.states.isolated_domains,'NOT_PROVISIONED');
 assert.equal(gate.states.corporate_social_promotion,'PROHIBITED');
 for(const path of publics){
  const html=read(path);
  assert.doesNotMatch(html,/evercraft|jessegaethle10@gmail\.com|mailto:|fabric\.systemiacommandcenters|findmypart|\/mesh\/|\/live\/|\/network\//i,path);
  assert.match(html,/<meta name="robots" content="noindex,follow">/,path);
  assert.match(html,/<h1>/,path);
  assert.match(html,/<script>/,path);
  assert.doesNotMatch(html,/href="https:\/\/jgaethle10.github.io\/forge-operator\/(?:audience-sites|affiliate-labs)\/"/,path);
 }
});
test('publisher directories are noindex and contain no Evercraft corporate links',()=>{
 for(const name of ['audience-sites','affiliate-labs']){
  const html=read(name+'/index.html');
  assert.match(html,/noindex,nofollow/);
  assert.doesNotMatch(html,/Evercraft|mailto:|fabric\.systemiacommandcenters|\/mesh\/|\/live\//i,name);
 }
});
test('neutral share artwork and on-property PNG preview paths',()=>{
 for(const slug of ['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes']){
  const html=read('audience-sites/'+slug+'/index.html');
  const image='https://jgaethle10.github.io/forge-operator/audience-sites/'+slug+'/share.png';
  assert.ok(html.includes('property="og:image" content="'+image+'"'));
  for(const ext of ['feed','story']){
   const svg=read('clip/audience-sites/'+slug+'/'+ext+'.svg');
   assert.doesNotMatch(svg,/evercraft/i);
   assert.match(svg,/INDEPENDENT RESOURCE/);
  }
 }
});
test('corporate Clip handoffs are revoked for these properties',()=>{
 const queue=JSON.parse(read('clip/audience-sites/queue.json'));
 assert.equal(queue.state,'retired_brand_isolation');
 assert.equal(queue.publicationAuthority,false);
 assert.equal(queue.allowed_corporate_cross_promotion,false);
 for(const site of queue.sites){
  const handoff=JSON.parse(read('clip/audience-sites/'+site.id+'/handoff.json'));
  assert.equal(handoff.status,'cancelled_brand_isolation');
  assert.equal(handoff.authorization.approved,false);
  assert.equal(handoff.distribution.corporate_channels_authorized,false);
 }
});
test('public Pages build removes internal Clip/publisher inventories while preserving actual share previews',()=>{
 const wf=fs.readFileSync(new URL('../.github/workflows/evercraft-journal-pages.yml',import.meta.url),'utf8');
 assert.match(wf,/rm -rf _public_pages\/clip\/audience-sites/);
 assert.match(wf,/cp "_public_pages\/clip\/audience-sites\/\$slug\/feed.png" "_public_pages\/audience-sites\/\$slug\/share.png"/);
 assert.match(wf,/rm -f _public_pages\/audience-sites\/properties.json/);
 assert.match(wf,/CLIP_SOCIAL_PREVIEW_HTTP_VERIFIED/);
});
