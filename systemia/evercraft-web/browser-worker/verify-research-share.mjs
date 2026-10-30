#!/usr/bin/env node
// Source-first launch pack QA; only synthetic clicks and locally rendered PNGs.
import {chromium} from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root="http://127.0.0.1:8765/research/share/";
const output=process.env.EVERCRAFT_RESEARCH_MOBILE_SHOTS||"/tmp/evercraft-research-mobile";
fs.mkdirSync(output,{recursive:true});
const receipt={schema:"evercraft.research.share-kit-browser.v1",state:"UNVERIFIED",checked_at:new Date().toISOString(),synthetic_only:true,provider_published:false,rows:[]};
const browser=await chromium.launch({headless:true});
try{
 for(const w of [320,390,820,1200]){
  const context=await browser.newContext({viewport:{width:w,height:850},isMobile:w<500,hasTouch:w<500,acceptDownloads:true});
  const page=await context.newPage();const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const res=await page.goto(root,{waitUntil:"networkidle",timeout:30000});
  assert.equal(res?.status(),200);
  await page.locator("#caption").waitFor();
  await page.locator('.brand-lockup').waitFor();
  assert.equal(await page.locator('.brand-bars i').count(),3);
  await page.waitForFunction(()=>document.querySelector("#poster")?.width>0);
  await page.waitForFunction(()=>document.querySelector("#caption").textContent.trim().length>100);
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.viewport+1,"horizontal overflow at "+w);
  const copy=await page.locator("#caption").textContent();
  assert.ok(copy.includes("Evercraft Research"));
  assert.ok(!copy.includes("https://"),"Facebook feed post must not contain URL");
  assert.equal(await page.locator("#copy-comment").isVisible(),true);
  await page.locator("#channel").selectOption("tiktok");
  assert.equal(await page.locator("#copy-comment").isVisible(),false);
  await page.locator("#channel").selectOption("linkedin");
  assert.ok((await page.locator("#caption").textContent()).length>200);
  await page.locator("#account").selectOption("company");
  assert.ok((await page.locator("#caption").textContent()).length>200);
  const canvas=await page.locator("#poster").evaluate(e=>({width:e.width,height:e.height}));
  assert.deepEqual(canvas,{width:1080,height:1350});
  for(const [name,expected] of Object.entries({story:[1080,1920],square:[1080,1080],wide:[1200,630]})){
   await page.locator("#format").selectOption(name);
   const got=await page.locator("#poster").evaluate(e=>({width:e.width,height:e.height}));
   assert.deepEqual([got.width,got.height],expected,name);
  }
  await page.locator("#format").selectOption("portrait");
  const download=page.waitForEvent("download");
  await page.locator("#download").click();
  const file=await download;
  assert.match(file.suggestedFilename(),/^evercraft-research-portrait\.png$/);
  await page.locator("#poster").evaluate(e=>{
   const bytes=atob(e.toDataURL("image/png").split(",")[1]);
   if(bytes.length<20000)throw Error("Poster export suspiciously empty");
  });
  if(w===390||w===1200)await page.screenshot({path:path.join(output,"share-kit-"+w+".png"),fullPage:true});
  assert.deepEqual(errors,[],"console errors at "+w);
  receipt.rows.push({width:w,render:"PASS",responsive:"PASS",caption_selection:"PASS",png_download:"PASS",posted:false});
  await context.close();
 }
 receipt.state="PASS";
}catch(e){receipt.state="FAIL";receipt.error=String(e?.stack||e);process.exitCode=1}
finally{await browser.close();fs.writeFileSync(path.join(output,"share-kit-qa.json"),JSON.stringify(receipt,null,2)+"\n");console.log(JSON.stringify(receipt,null,2))}
