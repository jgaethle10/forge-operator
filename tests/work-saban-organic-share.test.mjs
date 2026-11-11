import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const page=read('public/work-saban/report/index.html');
const script=read('public/work-saban/report/report.js');
const landing=read('public/work-saban/index.html');
const svg=read('public/work-saban/brand/work-saban-social.svg');
const pages=read('.github/workflows/evercraft-journal-pages.yml');
const probe=read('scripts/probe-work-saban-share-public.mjs');

test('customer can share a free public tool from the real CSV reporter',()=>{
 assert.match(page,/id="share-tool"/);
 assert.match(page,/id="share-feedback" role="status" aria-live="polite"/);
 assert.match(page,/Your CSV and report stay on your device/);
 assert.match(script,/\$\('share-tool'\)\.addEventListener\('click',async/);
 assert.match(script,/typeof navigator\.share==='function'/);
 assert.match(script,/await navigator\.clipboard\.writeText\(toolShareUrl\)/);
 assert.match(script,/feedback\.replaceChildren/);
 assert.match(script,/error\?\.name==='AbortError'/);
});

test('share link includes only fixed generic campaign attribution, no sensitive CSV/report bytes',()=>{
 const found=script.match(/const toolShareUrl='([^']+)'/);
 assert.ok(found,'fixed public share URL required');
 const shareUrl=new URL(found[1]);
 assert.equal(shareUrl.origin,'https://jgaethle10.github.io');
 assert.equal(shareUrl.pathname,'/forge-operator/work-saban/report/');
 assert.equal(shareUrl.searchParams.get('utm_source'),'work_saban_tool');
 assert.equal(shareUrl.searchParams.get('utm_medium'),'organic_share');
 assert.equal(shareUrl.searchParams.get('utm_campaign'),'work_saban');
 assert.equal(shareUrl.searchParams.size,3);
 const shareBlock=script.slice(script.indexOf('const toolShareUrl='));
 assert.doesNotMatch(shareBlock,/reportText|fileField|file\.text\(|csv-file|sourceDigest|reportDigest|localStorage|fetch\(|XMLHttpRequest|FormData/);
 assert.match(page,/connect-src 'none'/);
 assert.match(page,/Nothing will be uploaded to Evercraft/);
});

test('official first-party image is declared on the landing and reporter, with actual raster release',()=>{
 for(const doc of [page,landing]){
  assert.match(doc,/property="og:image" content="https:\/\/jgaethle10\.github\.io\/forge-operator\/work-saban\/brand\/work-saban-social\.png"/);
  assert.match(doc,/property="og:image:width" content="1200"/);
  assert.match(doc,/property="og:image:height" content="630"/);
  assert.match(doc,/name="twitter:card" content="summary_large_image"/);
 }
 assert.match(svg,/viewBox="0 0 1200 630"/);
 assert.match(svg,/#A4142F/);
 assert.match(svg,/>Give your work<\/text>/i);
 assert.match(svg,/>a team\.<\/text>/i);
 assert.match(pages,/cairosvg\.svg2png\(url="_public_pages\/work-saban\/brand\/work-saban-social\.svg"/);
 assert.match(pages,/test -s _public_pages\/work-saban\/brand\/work-saban-social\.png/);
 assert.match(pages,/name: Verify Work Saban free CSV reporter, owned sharing and preview over public HTTPS/);
 assert.match(pages,/node scripts\/probe-work-saban-share-public\.mjs/);
 assert.match(probe,/image_dimensions/);
 assert.match(probe,/customer_csv_uploaded:false/);
 assert.match(probe,/paid_sale_observed:false/);
});
