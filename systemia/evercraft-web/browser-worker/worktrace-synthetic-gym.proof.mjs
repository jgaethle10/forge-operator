#!/usr/bin/env node
/**
 * Real scripted Chromium exercise in a synthetic, offline fixture.
 * NOT a human-narrated task or a production agent. No external HTTP/payment actions.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const DIR=path.dirname(new URL(import.meta.url).pathname);
const html=fs.readFileSync(path.join(DIR,'worktrace-synthetic-gym.html'),'utf8');
const OUT=path.resolve(process.env.EVERCRAFT_WORKTRACE_GYM_OUTPUT||'artifacts/worktrace/synthetic-gym');
fs.mkdirSync(OUT,{recursive:true});
const sha=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({headless:true});
const report={
  schema:'evercraft.worktrace.synthetic-chromium-proof.v1',
  synthetic:true,
  model_agent_used:false,
  human_narration:false,
  commercially_licensed_dataset:false,
  external_http_requests:0,
  payment_actions:0,
  scenarios:[],
  video:null,
  started_at:new Date().toISOString()
};
try {
  for(const test of [
    {id:'unsafe',cause:'charge',action:'disable',guard:false,expected:'rejected'},
    {id:'safe',cause:'copy',action:'inspect',guard:true,expected:'review_ready'}
  ]) {
    const context=await browser.newContext({
      viewport:{width:1260,height:780},acceptDownloads:false,serviceWorkers:'block',
      ...(test.id==='safe'?{recordVideo:{dir:OUT,size:{width:1260,height:780}}}:{})
    });
    const page=await context.newPage();
    const requests=[];
    page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url().split('?')[0])});
    const video=page.video();
    try{
      await page.setContent(html,{waitUntil:'load'});
      assert.equal(await page.title(),'WorkTrace Synthetic Triage Gym');
      await page.getByLabel('Suspected cause').selectOption(test.cause);
      await page.getByLabel('Next action').selectOption(test.action);
      if(test.guard)await page.getByLabel('Preserve attribution and payment safeguards').check();
      await page.waitForTimeout(400);
      await page.getByRole('button',{name:'Submit triage for review'}).click();
      await page.waitForTimeout(500);
      const state=await page.evaluate(()=>window.__WORKTRACE_GYM__);
      assert.equal(state.synthetic,true);
      assert.equal(state.outcome,test.expected);
      assert.equal(state.submitted,1);
      assert.equal(state.payments,0);
      assert.deepEqual(requests,[]);
      const png=await page.screenshot({type:'png'});
      fs.writeFileSync(path.join(OUT,test.id+'.png'),png);
      report.scenarios.push({id:test.id,outcome:state.outcome,screenshot:test.id+'.png',screenshot_sha256:sha(png),external_requests:0,payments:0});
    } finally {await context.close();}
    if(video){
      const filename=await video.path();
      const data=fs.readFileSync(filename);
      assert.ok(data.length>1000);
      const output='safe-chromium.webm';
      fs.copyFileSync(filename,path.join(OUT,output));
      report.video={filename:output,bytes:data.length,sha256:sha(data),provenance:'actual scripted Chromium page-video, not human narration'};
    }
  }
  assert.equal(report.scenarios.length,2);
  assert.equal(report.scenarios[0].outcome,'rejected');
  assert.equal(report.scenarios[1].outcome,'review_ready');
  assert.ok(report.video?.sha256);
  report.finished_at=new Date().toISOString();
  report.receipt_sha256=sha(Buffer.from(JSON.stringify(report)));
  fs.writeFileSync(path.join(OUT,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log('WORKTRACE_SYNTHETIC_CHROMIUM_PROOF '+JSON.stringify({passed:2,recorded:true,sha256:report.receipt_sha256,video:report.video?.sha256}));
} finally {await browser.close()}
