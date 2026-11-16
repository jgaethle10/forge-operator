import test from 'node:test';
import assert from 'node:assert/strict';
import {
  metaContent,inspectPng,inspectPublishedPreview,OFFER_URL,EXPECTED_IMAGE_URL,
} from '../scripts/website-audit-public-preview-canary.mjs';

const html=[
  '<!doctype html><html><head>',
  '<meta content="'+EXPECTED_IMAGE_URL+'" property="og:image">',
  '<meta property="og:image:type" content="image/png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta property="og:image:alt" content="Evercraft audit">',
  '</head><body>Quick Win Audit $49</body></html>',
].join('');

function png(width=1200,height=630) {
  const b=Buffer.alloc(32);
  Buffer.from('89504e470d0a1a0a','hex').copy(b);
  b.writeUInt32BE(width,16);
  b.writeUInt32BE(height,20);
  return b;
}

test('read source-backed Open Graph values regardless of attribute order',()=>{
  assert.equal(metaContent(html,'og:image'),EXPECTED_IMAGE_URL);
  assert.equal(metaContent(html,'twitter:card'),'summary_large_image');
  assert.equal(metaContent('<meta name="og:image" content="bad">','og:image'),'bad');
});

test('PNG validation checks signature and dimensions, not filename',()=>{
  assert.deepEqual(inspectPng(png()),{valid:true,bytes:32,width:1200,height:630});
  assert.equal(inspectPng(Buffer.from('NOT PNG')).valid,false);
});

test('public canary verifies only when live page, crawler and real PNG all agree',async()=>{
  const seen=[];
  const fetcher=async (url,options)=>{
    seen.push({url,agent:options.headers['user-agent']});
    return url===OFFER_URL
      ?new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8'}})
      :new Response(png(),{status:200,headers:{'content-type':'image/png'}});
  };
  const proof=await inspectPublishedPreview({fetcher});
  assert.equal(proof.verdict,'verified_live');
  assert.deepEqual(proof.issues,[]);
  assert.equal(proof.image.width,1200);
  assert.equal(seen.length,3);
  assert.ok(seen.some(x=>x.agent==='facebookexternalhit/1.1'));
});

test('a missing image is not mistaken for a publication success',async()=>{
  const fetcher=async (url)=>url===OFFER_URL
    ?new Response(html,{status:200,headers:{'content-type':'text/html'}})
    :new Response('not found',{status:404,headers:{'content-type':'text/plain'}});
  const proof=await inspectPublishedPreview({fetcher});
  assert.equal(proof.verdict,'not_verified');
  assert.ok(proof.issues.includes('image_http_404'));
});

test('stale Facebook metadata blocks live acceptance',async()=>{
  let hits=0;
  const fetcher=async (url)=>{
    if(url!==OFFER_URL)return new Response(png(),{status:200,headers:{'content-type':'image/png'}});
    hits++;
    const body=hits===2?html.replace(EXPECTED_IMAGE_URL,'https://example.org/old.svg'):html;
    return new Response(body,{status:200,headers:{'content-type':'text/html'}});
  };
  const proof=await inspectPublishedPreview({fetcher});
  assert.equal(proof.verdict,'not_verified');
  assert.ok(proof.issues.includes('facebook_image_metadata_mismatch'));
});
