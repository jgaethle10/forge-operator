import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importPublicProductCapture,preparePublicProductCapture} from './public-product-capture.mjs';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(bytes){let c=0xffffffff;for(const v of bytes)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function chunk(name,content){
  const label=Buffer.from(name),size=Buffer.alloc(4),check=Buffer.alloc(4);
  size.writeUInt32BE(content.length);check.writeUInt32BE(crc32(Buffer.concat([label,content])));
  return Buffer.concat([size,label,content,check]);
}
function fixturePng(){
  const w=390,h=844,ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const row=Buffer.alloc(1+w*3,180);row[0]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(Buffer.concat(Array.from({length:h},()=>row)))),chunk('IEND',Buffer.alloc(0))]);
}
function source(){
  const png=fixturePng(),imageHash=digest(png),
    url='https://fabric.systemiacommandcenters.com/demos/earthworks-autonomy/';
  const boundaries={
    fresh_context_per_job:true,persisted_cookies:false,outbound_cookie_headers_stripped:true,
    outbound_authorization_headers_stripped:true,private_and_reserved_targets_blocked:true,
    form_submit_action_supported:false,arbitrary_click_action_supported:false,downloads_allowed:false
  };
  const evidence={
    engine:'evercraft-owned-browser-worker-v1',mode:'public_read_only',requested_url:url,
    final_url:url,http_status:200,title:'EarthWorks',text_sha256:digest('EarthWorks'),
    screenshot_sha256:imageHash,actions:[],blocked_network_events:[],console_errors:[],
    started_at:'2026-10-19T12:00:00Z',finished_at:'2026-10-19T12:00:01Z',duration_ms:1000,boundaries
  };
  const response={ok:true,...evidence,snapshot:{},
    screenshot:{base64:png.toString('base64'),bytes:png.length,sha256:imageHash},
    evidence_receipt_sha256:digest(JSON.stringify(evidence))
  };
  const approval={
    schema:'evercraft.fallen.public-product-capture-approval.v1',
    id:'earthworks-demo',approvedOrigin:'https://fabric.systemiacommandcenters.com',
    approvedPageUrl:url,reviewedScreenshotSha256:imageHash,
    approvedForInternalCreative:true,personalOrPrivateContentAbsent:true,rights:'owned',
    reviewerId:'evercraft-internal-reviewer',reviewedAt:'2026-10-19T12:02:00Z',
    productName:'EarthWorks Simulation',
    viewerPromise:'Show the real dispatch screen without inventing physical machine operation.'
  };
  return {response,approval};
}
test('digest-bound real browser PNG becomes an internal Fallen asset without publish authority',()=>{
  const {response,approval}=source();
  const p=preparePublicProductCapture(response,approval);
  assert.equal(p.manifest.sourceKind,'real_public_browser_capture');
  assert.equal(p.manifest.boundaries.publicationAuthority,false);
  assert.deepEqual(p.dimensions,{width:390,height:844});
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-product-capture-'));
  try{
    const dir=path.join(root,'private');
    const out=importPublicProductCapture({response,approval,outputDir:dir});
    const project=JSON.parse(fs.readFileSync(out.projectPath,'utf8'));
    assert.equal(project.assets[0].kind,'image');
    assert.equal(project.assets[0].rights,'owned');
    assert.equal(digest(fs.readFileSync(out.imagePath)),p.digest);
    assert.equal(JSON.parse(fs.readFileSync(out.receiptPath,'utf8')).boundaries.publicationAuthority,false);
    assert.throws(()=>importPublicProductCapture({response,approval,outputDir:dir}),/output_directory_exists/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('tampered screenshot/receipt and missing human review fail closed',()=>{
  const {response,approval}=source();
  const invalid=[
    [{...response,screenshot:{...response.screenshot,sha256:'0'.repeat(64)}},approval],
    [{...response,evidence_receipt_sha256:'0'.repeat(64)},approval],
    [response,{...approval,reviewedScreenshotSha256:'f'.repeat(64)}],
    [response,{...approval,personalOrPrivateContentAbsent:false}],
    [response,{...approval,approvedForInternalCreative:false}],
    [response,{...approval,rights:'unknown'}],
    [response,{...approval,id:'../escape'}]
  ];
  for(const [capture,review] of invalid){
    assert.throws(()=>preparePublicProductCapture(capture,review),/fallen_public_capture_/);
  }
});
test('forbids unauthorized domain, authenticated mode, failed page and write-capable action',()=>{
  const {response,approval}=source();
  assert.throws(()=>preparePublicProductCapture({...response,mode:'authenticated_handoff'},approval),/worker_receipt_invalid/);
  assert.throws(()=>preparePublicProductCapture({...response,http_status:401},approval),/worker_receipt_invalid/);
  assert.throws(()=>preparePublicProductCapture({...response,actions:[{type:'click',ok:true}]},approval),/action_invalid/);
  assert.throws(()=>preparePublicProductCapture(response,{...approval,approvedOrigin:'https://example.com'}),/url_outside_approved_public_origin/);
});
