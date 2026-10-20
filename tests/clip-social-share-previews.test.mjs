import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const slugs=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes'];
const src=new URL('../public/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,src),'utf8');

test('all seven websites contain shareable, canonical, original PNG Open Graph metadata',()=>{
 for(const slug of slugs){
  const page=read('audience-sites/'+slug+'/index.html');
  const canonical='https://jgaethle10.github.io/forge-operator/audience-sites/'+slug+'/';
  const image='https://jgaethle10.github.io/forge-operator/clip/audience-sites/'+slug+'/feed.png';
  assert.ok(page.includes('<link rel="canonical" href="'+canonical+'">'),slug);
  assert.ok(page.includes('property="og:url" content="'+canonical+'"'),slug);
  assert.ok(page.includes('property="og:image" content="'+image+'"'),slug);
  assert.ok(page.includes('name="twitter:image" content="'+image+'"'),slug);
  assert.ok(page.includes('property="og:image:type" content="image/png"'),slug);
  assert.ok(page.includes('name="twitter:card" content="summary_large_image"'),slug);
  assert.equal((page.match(/property="og:image"/g)||[]).length,1,slug);
  assert.doesNotMatch(page,/(?:onlyfans|fansly|pornhub|nsfw|\brivet\b|aliev)/i);
 }
});
test('GitHub Pages deploy rasterizes, verifies and uploads each preview',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/evercraft-journal-pages.yml',import.meta.url),'utf8');
 const script=fs.readFileSync(new URL('../systemia/clip/build-audience-social-previews.py',import.meta.url),'utf8');
 assert.match(workflow,/cairosvg==2\.8\.2/);
 assert.match(workflow,/build-audience-social-previews\.py/);
 assert.match(workflow,/CLIP_SOCIAL_PREVIEW_HTTP_VERIFIED/);
 assert.match(script,/CLIP_PNG_BUILD_SUCCESS count=14/);
 for(const slug of slugs)assert.ok(script.includes('"'+slug+'"'));
});
test('real editorial opportunities are not mistaken for confirmed contracts',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../systemia/clip/earned-audience-opportunities-20261020.json',import.meta.url),'utf8'));
 assert.ok(p.channels.some(x=>x.status==='gmail_draft_created_not_sent'));
 assert.ok(p.channels.every(x=>x.proven_payment===false));
 assert.ok(p.exclude_for_commercial_promotion.some(x=>x.brand==='iFixit community'));
 assert.equal(p.rules.no_spam,true);
 assert.equal(p.rules.no_sexual_or_suggestive_material_on_evercraft_social,true);
});
