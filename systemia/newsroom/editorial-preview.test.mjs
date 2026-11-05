import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertSafeEditorialPreviewPath,extractArticle,renderEditorialPreview} from './editorial-preview.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const markdown=fs.readFileSync(path.join(dir,'editorial-queue/2026-11-02-chainsaw-surgical-origins.md'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'editorial-assets/chainsaw-surgical-origins-media.json'),'utf8'));
test('real chainsaw article stages as sourced preview, never publication',()=>{
 const article=extractArticle(markdown);
 assert.ok(article.length>4500);
 const html=renderEditorialPreview({markdown,manifest});
 for(const token of ['noindex,nofollow,noarchive','Editorial preview · Not published','Source and rights statement','Aitken','Jeffray','Heine','Sabine Salfer','Scottish Invention']){
   assert.ok(html.includes(token),'missing '+token);
 }
 assert.doesNotMatch(html,/rel="canonical"|property="og:url"|publication_state="published"/);
});
test('unverified visual rights or missing provenance fail closed',()=>{
 const change=structuredClone(manifest);
 change.hero.rights_state='unknown';
 assert.throws(()=>renderEditorialPreview({markdown,manifest:change}),/verified public-domain/);
 change.hero.rights_state='verified_public_domain';
 change.hero.source_url='';
 assert.throws(()=>renderEditorialPreview({markdown,manifest:change}),/provenance incomplete/);
});
test('preview output paths cannot land in publication or release tree',()=>{
 const repo=path.resolve(dir,'../..');
 for(const sub of ['public/journal/a.html','dist/a.html','build/a.html','systemia/newsroom/stories/a.html','.github/a.html']){
   assert.throws(()=>assertSafeEditorialPreviewPath(path.join(repo,sub),repo),/cannot be written/);
 }
 assert.equal(assertSafeEditorialPreviewPath(path.join(os.tmpdir(),'chainsaw-review-preview.html'),repo),path.join(os.tmpdir(),'chainsaw-review-preview.html'));
});
test('incomplete article cannot be previewed as finished editorial',()=>{
 assert.throws(()=>extractArticle('## Article\n# Short'),/three substantive article sections/);
 assert.throws(()=>extractArticle('No article here'),/distinct ## Article section/);
});
