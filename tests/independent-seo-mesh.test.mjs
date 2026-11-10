import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {exportSite} from '../systemia/affiliate-commerce/export-independent-publisher.mjs';

const slugs=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes','pet-play','tool-rent-or-buy','auto-fitment'];
const blocked=/evercraft|jgaethle10|forge-operator|fabric\.systemiacommandcenters|mailto:/i;
test('all ten isolated publishers export original SEO guides and honest LLM manifests without public corporate ties',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'indie-seo-'));
 try{
  for(const slug of slugs){
   const destination=path.join(temp,slug);
   const info=exportSite({slug,origin:'https://quiet-independent.example',out:destination});
   assert.equal(info.indexable,false);
   const home=fs.readFileSync(path.join(destination,'index.html'),'utf8');
   const llms=fs.readFileSync(path.join(destination,'llms.txt'),'utf8');
   const xml=fs.readFileSync(path.join(destination,'sitemap-draft.xml'),'utf8');
   const manifest=JSON.parse(fs.readFileSync(path.join(destination,'discovery.json'),'utf8'));
   const robots=fs.readFileSync(path.join(destination,'robots.txt'),'utf8');
   const folder=path.join(destination,'guides');
   const guideSlug=fs.readdirSync(folder)[0];
   const guide=fs.readFileSync(path.join(folder,guideSlug,'index.html'),'utf8');
   assert.equal(manifest.published,false);
   assert.equal(manifest.indexable,false);
   assert.equal(manifest.affiliate_links_active,false);
   assert.match(home,/Read:/);
   assert.match(home,/application\/ld\+json/);
   assert.match(guide,/<h1>/);
   assert.match(guide,/<meta name="robots" content="noindex,follow">/);
   assert.ok((guide.match(/<h2>/g)||[]).length>=5);
   assert.ok(guide.length>2300);
   assert.match(llms,/Status: independent website export only/);
   assert.ok(xml.includes('https://quiet-independent.example/guides/'));
   assert.match(robots,/Disallow: \//);
   for(const s of [home,guide,llms,xml,JSON.stringify(manifest)]){
    assert.doesNotMatch(s,blocked,slug);
    assert.doesNotMatch(s,/OnlyFans|Fansly|pornhub|adult entertainment/i,slug);
   }
   assert.doesNotMatch(home,/href="https:\/\/jgaethle10/);
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
