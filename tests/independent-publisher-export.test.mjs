import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {exportSite,validOrigin} from '../systemia/affiliate-commerce/export-independent-publisher.mjs';

const slugs=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes','pet-play','tool-rent-or-buy','auto-fitment'];
test('ten independent site bundles are portable and do not reveal the operator brand in HTML/CSS',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'independent-publisher-'));
 try{
  for(const slug of slugs){
   const out=path.join(tmp,slug);
   const info=exportSite({slug,origin:'https://independent-publisher.example',out});
   assert.equal(info.site,slug);
   assert.equal(info.published,false);
   assert.equal(info.indexable,false);
   assert.ok(fs.existsSync(path.join(out,'assets','site.css')));
   assert.match(fs.readFileSync(path.join(out,'robots.txt'),'utf8'),/Disallow: \/$/m);
   const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
   assert.match(html,/<meta name="robots" content="noindex,follow">/);
   assert.match(html,/rel="canonical" href="https:\/\/independent-publisher.example\/"/);
   assert.doesNotMatch(html,/evercraft|jgaethle10|forge-operator|mailto:|fabric\.systemiacommandcenters|\/mesh\//i,slug);
   assert.ok(html.includes('/assets/site.css'),slug);
   assert.ok(!html.includes('rel="sponsored"'),slug);
   assert.doesNotMatch(html,/name="twitter:image"/);
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('corporate and GitHub origins, unsafe protocols, and operator shortcuts are refused',()=>{
 for(const x of ['http://other.example','https://jgaethle10.github.io','https://fabric.systemiacommandcenters.com','https://evercraft.public.example','https://example.org/subfolder','https://example.org:8443']){
  assert.throws(()=>validOrigin(x),/publisher_export/);
 }
 assert.equal(validOrigin('https://independent.example/'),'https://independent.example');
});
test('export fails safely rather than overwriting live site or fabricating share image',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'publisher-holds-'));
 try {
  assert.throws(()=>exportSite({slug:'unknown',origin:'https://hello.example',out:path.join(tmp,'unknown')}),/unknown_niche/);
  assert.throws(()=>exportSite({slug:'partscout',origin:'https://hello.example',out:tmp}),/output_must_be_new_directory/);
  assert.throws(()=>exportSite({slug:'partscout',origin:'https://hello.example',out:path.join(tmp,'site'),sharePng:path.join(tmp,'not-present.png')}),/share_png_missing/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
