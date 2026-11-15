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
 assert.match(html, /<picture><source media="\(max-width:700px\)" srcset="data:image\/svg\+xml;base64,/);
 assert.match(html, /<img src="data:image\/svg\+xml;base64,/);
 assert.doesNotMatch(html, /<img src="https?:/);
 assert.doesNotMatch(html,/Follow-up source check/);
 assert.match(html,/Original Evercraft editorial illustration/);
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

test('mobile and desktop heroes are self-contained even with network unavailable',()=>{
 const html=renderEditorialPreview({markdown,manifest});
 const mobile=html.match(/<source media="\(max-width:700px\)" srcset="data:image\/svg\+xml;base64,([^"]+)"/);
 const desktop=html.match(/<img src="data:image\/svg\+xml;base64,([^"]+)"/);
 assert.ok(mobile&&desktop);
 const m=Buffer.from(mobile[1],'base64').toString('utf8');
 const d=Buffer.from(desktop[1],'base64').toString('utf8');
 assert.match(m,/viewBox="0 0 720 900"/);
 assert.match(d,/viewBox="0 0 1280 720"/);
 assert.match(m,/not a scale-accurate artifact drawing/);
 assert.doesNotMatch(html,/src="https:\/\/upload.wikimedia.org/);
});
test('embedded editorial visuals reject active or external SVG content',()=>{
 const img='<svg xmlns="http://www.w3.org/2000/svg"><script>alert("x")</script></svg>';
 assert.throws(()=>renderEditorialPreview({markdown,manifest,mobileSvg:img}),/unsupported active/);
 assert.throws(()=>renderEditorialPreview({markdown,manifest,desktopSvg:'bad'}),/missing or malformed/);
});
