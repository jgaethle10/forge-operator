#!/usr/bin/env node
// Evercraft Research responsive customer canary. Local-only synthetic question.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import fs from "node:fs";
import path from "node:path";
const url="http://127.0.0.1:8765/research/";
const shotDir=process.env.EVERCRAFT_RESEARCH_MOBILE_SHOTS||"/tmp/evercraft-research-mobile";
const widths=[320,375,390,430,620,768,1024,1440];
const receipt={schema:"evercraft.research.mobile-customer-v1",checked_at:new Date().toISOString(),
 simulated_browser:"Playwright Chromium with mobile touch emulation below 621px",
 synthetic_question_only:true,real_customer_data:false,checkout_tested:false,
 widths,results:[],status:"UNVERIFIED"};
fs.mkdirSync(shotDir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<=620?2:1,isMobile:width<=620,hasTouch:width<=620});
  const page=await context.newPage();
  const pageErrors=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  const response=await page.goto(url,{waitUntil:"networkidle",timeout:30000});
  assert.equal(response?.status(),200,"Research page HTTP");
  await page.locator(".evidence .line").first().waitFor();
  const layout=await page.evaluate(()=>{
   const rows=[...document.querySelectorAll(".evidence .line")].map(el=>{
    const label=el.querySelector("b")?.getBoundingClientRect();
    const body=el.querySelector("span")?.getBoundingClientRect();
    if(!label||!body)return {valid:false};
    const disjoint=label.bottom<=body.top+0.5||label.right<=body.left+0.5;
    return {valid:disjoint,label:el.querySelector("b").textContent};
   });
   return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
    rows,primaryCTA:!!document.querySelector('a[href="#start"]')};
  });
  assert.ok(layout.documentWidth<=layout.viewport+1,"horizontal document overflow at "+width+": "+JSON.stringify(layout));
  assert.ok(layout.rows.length===3&&layout.rows.every(r=>r.valid),"label overlaps evidence body at "+width+": "+JSON.stringify(layout.rows));
  assert.ok(layout.primaryCTA,"customer CTA missing");
  await page.locator("#question").fill("Which documented competitors might serve independently owned repair shops, and what evidence would be needed to compare them?");
  await page.locator("#format").selectOption("market-review");
  await page.getByRole("button",{name:"Prepare my research brief"}).click();
  await page.locator("#report-outline li").first().waitFor();
  const sections=await page.locator("#report-outline li").allTextContents();
  assert.equal(sections.length,5);
  assert.ok(sections.some(x=>/Competitor and substitute landscape/.test(x)),"research outline not specialized");
  assert.equal(await page.locator("#result").isVisible(),true);
  assert.ok((await page.locator("#request").getAttribute("href")).startsWith("mailto:"));
  assert.equal(pageErrors.length,0,"Browser errors: "+JSON.stringify(pageErrors));
  if([320,390,1440].includes(width))await page.screenshot({path:path.join(shotDir,"research-"+width+".png"),fullPage:true});
  receipt.results.push({width,status:"PASS",horizontal_overflow:false,label_overlap:false,report_outline_sections:sections.length});
  await context.close();
 }
 receipt.status="PASS";
}catch(e){receipt.status="FAIL";receipt.error=String(e?.message||e);process.exitCode=1}
finally{await browser.close();fs.writeFileSync(path.join(shotDir,"mobile-canary.json"),JSON.stringify(receipt,null,2)+"\n");console.log(JSON.stringify(receipt,null,2))}
