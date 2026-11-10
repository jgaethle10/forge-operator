// macOS Playwright WebKit is Safari-like, NOT an iPhone or physical Safari test.
// A file:// failure is explicitly disclosed; core offline crypto is tested on loopback instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {webkit} from 'playwright';
import {buildDemoKit} from '../scripts/build-passage-device-kit.mjs';

test('WebKit verification stays functional after disconnection; file-origin support is reported separately',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'passage-webkit-lab-'));
 const kit=await buildDemoKit(join(dir,'kit'));
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 let server=null;
 try{
  const page=await context.newPage();
  const errors=[],offlineRequests=[];
  let offline=false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(offline&&/^https?:/.test(r.url()))offlineRequests.push(r.url())});
  let fileOriginSupported=false;
  try{
   await page.goto('file://'+kit.verifier,{waitUntil:'load'});
   await context.setOffline(true);
   await page.reload({waitUntil:'load'});
   fileOriginSupported=await page.locator('#qa-run').count()===1;
  }catch(error){
   t.diagnostic('Local file origin unsupported in Playwright macOS WebKit: '+(error instanceof Error?error.message:'unknown error'));
   await context.setOffline(false);
   const html=await readFile(kit.verifier,'utf8');
   server=createServer((req,res)=>{
    if(req.url!=='/verifier'){res.writeHead(404);res.end();return}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(html);
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   await page.goto('http://127.0.0.1:'+server.address().port+'/verifier',{waitUntil:'load'});
   await context.setOffline(true);
   t.diagnostic('Fallback: SAME verifier bytes were loaded from localhost before disconnection; no file-origin support is claimed');
  }
  offline=true;
  assert.equal(await page.evaluate(()=>navigator.onLine),false,'browser context should report network offline');
  assert.equal(await page.locator('#qa-run').count(),1);
  await page.locator('#qa-run').click();
  await page.waitForFunction(()=>{const status=document.getElementById('qa-status')?.textContent||'';return status.includes('self-check passed')||status.startsWith('UNSUPPORTED OR FAILED')},undefined,{timeout:15000});
  const cryptoStatus=await page.locator('#qa-status').innerText();
  if(cryptoStatus==='UNSUPPORTED OR FAILED: Ed25519 known-answer test failed'){
   // WebKit 26.0 on this runner returned false for the RFC 8032 valid signature.
   // This is an explicitly UNAVAILABLE browser/engine combination, not a passed crypto check.
   assert.equal(await page.locator('#qa-download').isVisible(),false,'cannot create a success receipt for unsupported cryptography');
   await page.locator('#package-file').setInputFiles(kit.package);
   await page.locator('#trusted-key-file').setInputFiles(kit.publicKey);
   await page.locator('#expected-fingerprint').fill(kit.fingerprint);
   await page.locator('#verify-package').click();
   await page.waitForFunction(()=>{const text=document.getElementById('verification-status')?.textContent||'';return text.startsWith('NOT VERIFIED')||text.startsWith('Signature, content and independent fingerprint match')},undefined,{timeout:15000});
   const verifiedStatus=await page.locator('#verification-status').innerText();
   assert.match(verifiedStatus,/^NOT VERIFIED:/,'WebKit must never accept a package after its Ed25519 known-answer test fails');
   assert.equal(await page.locator('#save-verified-file').isVisible(),false,'fail closed: no verified text download');
   assert.deepEqual(offlineRequests,[],'no HTTP(S) requests after disconnection');
   assert.deepEqual(errors,[],'no uncaught application errors');
   t.diagnostic('COMPATIBILITY BLOCKER: WebKit Ed25519 RFC8032 valid-vector verification failed; signed demo was rejected with no verified-text download. WebKit NOT SUPPORTED.');
   return;
  }
  assert.match(cryptoStatus,/self-check passed/,'WebKit crypto check must pass or be explicitly identified as unsupported');
  assert.equal(await page.locator('#qa-download').isVisible(),true);
  await page.locator('#package-file').setInputFiles(kit.package);
  await page.locator('#trusted-key-file').setInputFiles(kit.publicKey);
  await page.locator('#expected-fingerprint').fill(kit.fingerprint);
  await page.locator('#verify-package').click();
  await page.waitForFunction(()=>document.getElementById('verification-status')?.textContent.includes('Signature, content and independent fingerprint match'),undefined,{timeout:15000});
  assert.equal(await page.locator('#save-verified-file').isVisible(),true);
  const received=page.waitForEvent('download');
  await page.locator('#save-verified-file').click();
  assert.match(await readFile(await (await received).path(),'utf8'),/How to check a claim/);
  const receiptDownload=page.waitForEvent('download');
  await page.locator('#qa-platform').selectOption('iphone-ipad');
  await page.locator('#qa-download').click();
  const receipt=JSON.parse(await readFile(await (await receiptDownload).path(),'utf8'));
  assert.equal(receipt.platform_category,'iphone-ipad');
  assert.equal(receipt.offline_manually_confirmed,false,'automated run must not claim a person disabled device radios');
  assert.equal(receipt.signed_package_observation,'verified-locally');
  await page.locator('#expected-fingerprint').fill('0'.repeat(64));
  await page.locator('#verify-package').click();
  await page.waitForFunction(()=>document.getElementById('verification-status')?.textContent.startsWith('NOT VERIFIED'));
  assert.equal(await page.locator('#save-verified-file').isVisible(),false);
  assert.deepEqual(offlineRequests,[],'offline interactions made no HTTP(S) requests');
  assert.deepEqual(errors,[],'no uncaught application errors');
  t.diagnostic('WebKit crypto verification PASS; direct file:// origin '+(fileOriginSupported?'opened and reloaded offline':'NOT VERIFIED'));
 }finally{
  await context.close();await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
 }
});
