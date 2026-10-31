import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifySurface,inspectSurface,SURFACES,freeHubBrandContract} from './probe-free-first-public.mjs';
const [hub,boardroom,research,work]=SURFACES;
const html='<title>Try Evercraft for free</title><meta name="theme-color" content="#050b12"><style>:root{color-scheme:dark;--bg:#050b12;--ice:#8adfff}</style><a href="../mesh/ai-boardroom/compare/?utm_source=a">One</a><a href="../research/?utm_source=b">Two</a><a href="../work-saban/demo/?utm_source=c">Three</a>';
const observed=(spec,body=html,extras={})=>({observed:true,status:200,
 final_url:'https://jgaethle10.github.io/forge-operator'+spec.path,
 content_type:'text/html',body,...extras});
test('missing new hub source is never advertised as published even if a page answers',()=>{
 const result=classifySurface(hub,observed(hub),null);
 assert.equal(result.state,'SOURCE_NOT_IN_MAIN');
 assert.equal(result.safe_for_public_promotion,false);
});
test('verifies correct hub static HTML and exact three destination links without claiming interaction',()=>{
 const result=classifySurface(hub,observed(hub),html);
 assert.equal(result.state,'PUBLIC_HTML_GET_VERIFIED');
 assert.equal(result.source_links_verified,true);
 assert.equal(result.browser_interaction_verified,false);
 assert.equal(result.human_visitor_verified,false);
 assert.equal(result.revenue_verified,false);
});
test('generic HTTP 200 shell, wrong origin redirects and noindex all hold',()=>{
 assert.equal(classifySurface(boardroom,observed(boardroom,'Generic shell'),'Compare AI Answers').state,'PUBLIC_IDENTITY_MISMATCH');
 assert.equal(classifySurface(research,observed(research,'Evercraft Research',{final_url:'https://evil.example/research/'}),'Evercraft Research').state,'PUBLIC_RESPONSE_NOT_VERIFIED');
 assert.equal(classifySurface(work,observed(work,'<meta name="robots" content="noindex">Try an example'),'<meta name="robots" content="noindex">Try an example').state,'PUBLIC_INDEX_HOLD');
});
test('live source drift is held even when title remains the same',()=>{
 const result=classifySurface(research,observed(research,'Evercraft Research new build'),'Evercraft Research prior build');
 assert.equal(result.state,'PUBLIC_SOURCE_DRIFT');
});
test('missing link and observed network failure cannot become green',()=>{
 const missing=classifySurface(hub,observed(hub,html.replace('../research/','../wrong/')),html);
 assert.equal(missing.state,'PUBLIC_FREE_LINKS_MISSING');
 const fail=classifySurface(hub,{observed:false,error:'TimeoutError'},html);
 assert.equal(fail.state,'PUBLIC_UNOBSERVED');
});
test('probes use GET-only no redirect and no identity or checkout effects',async()=>{
 let opts;
 const result=await inspectSurface(hub,{
   load:()=>html,
   fetchFn:async(url,options)=>{opts=options;return {status:200,url,
      headers:{get:k=>k==='content-type'?'text/html':null},text:async()=>html};}
 });
 assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
 assert.equal(opts.credentials,'omit');assert.equal(result.state,'PUBLIC_HTML_GET_VERIFIED');
});

test('main free-hub source honors founder black and ice-blue design lock',()=>{
 const source=readFileSync('public/try/index.html','utf8');
 assert.equal(freeHubBrandContract(source),true);
});
test('source drift fails closed rather than creating another design iteration',()=>{
 const reverted=html.replace('--ice:#8adfff','--ice:#a91638');
 const result=classifySurface(hub,observed(hub,html),reverted);
 assert.equal(result.state,'BRAND_SOURCE_DRIFT');
 assert.equal(result.safe_for_public_promotion,false);
});
test('deployed white/red palette cannot pass with approved black/ice source',()=>{
 const old=html.replace('--bg:#050b12;--ice:#8adfff','--bg:#fff;--red:#a91638');
 const result=classifySurface(hub,observed(hub,old),html);
 assert.equal(result.state,'PUBLIC_BRAND_DRIFT');
 assert.equal(result.brand_source_verified,true);
 assert.equal(result.brand_public_verified,false);
 assert.equal(result.safe_for_public_promotion,false);
});
