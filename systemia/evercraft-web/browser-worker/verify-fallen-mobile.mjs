#!/usr/bin/env node
// Fallen Studios mobile width QA. Detects real page overflow, not clipped via overflow-x:hidden.
// Uses synthetic browser navigation only: no customer inquiries, payment, downloads or social posts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {chromium,webkit} from "playwright";

const PUBLIC_LOCAL="http://127.0.0.1:8765/fallen-studios/";
const out=process.env.FALLEN_MOBILE_QA_OUTPUT||"/tmp/fallen-mobile-qa";
const cases=[
 {browser:"chromium",width:320},{browser:"chromium",width:360},{browser:"chromium",width:375},
 {browser:"chromium",width:390},{browser:"chromium",width:430},{browser:"chromium",width:768},
 {browser:"chromium",width:1024},{browser:"chromium",width:1440},
 {browser:"webkit",width:320},{browser:"webkit",width:375},{browser:"webkit",width:390},{browser:"webkit",width:430}
];
const receipt={schema:"evercraft.fallen.mobile-overflow-qa.v1",generated_at:new Date().toISOString(),
  local_server_only:true,posted:false,media_uploaded:false,customer_submitted:false,
  state:"UNVERIFIED",cases:[],failures:[]};
fs.mkdirSync(out,{recursive:true});
let chromiumInstance=null,webkitInstance=null;
try{
 chromiumInstance=await chromium.launch({headless:true});
 webkitInstance=await webkit.launch({headless:true});
 for(const item of cases){
  const engine=item.browser==="webkit"?webkitInstance:chromiumInstance;
  const context=await engine.newContext({viewport:{width:item.width,height:850},deviceScaleFactor:2,isMobile:item.width<800,hasTouch:item.width<800});
  const page=await context.newPage();
  const errs=[];
  page.on("pageerror",e=>errs.push(e.message));
  try{
   const response=await page.goto(PUBLIC_LOCAL,{waitUntil:"load",timeout:25000});
   assert.equal(response?.status(),200,"local Fallen front door HTTP 200");
   const result=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const poster=document.querySelector(".poster");
    const two=document.querySelector(".showcase .two");
    const sections=[".poster",".showcase .two",".showcase .two > div:last-child",".poster strong",".poster span",".poster small",".price .offer",".hero h1"];
    const placements=sections.map(s=>{
     const el=document.querySelector(s);
     if(!el)return {selector:s,missing:true};
     const r=el.getBoundingClientRect();
     return {selector:s,left:r.left,right:r.right,width:r.width,
       withinViewport:r.left>=-1&&r.right<=vw+1};
    });
    const posterBounds=poster.getBoundingClientRect(),gridBounds=two.getBoundingClientRect();
    const navBrand=document.querySelector(".nav .brand").getBoundingClientRect();
    const navCTA=document.querySelector(".nav .action").getBoundingClientRect();
    return {innerWidth:window.innerWidth,clientWidth:vw,
      docScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,
      overscroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-vw,
      posterFits:posterBounds.left>=-1&&posterBounds.right<=vw+1,
      posterInGrid:posterBounds.left>=gridBounds.left-1&&posterBounds.right<=gridBounds.right+1,
      navNoOverlap:navBrand.right<=navCTA.left+1,
      overflowMask:[getComputedStyle(document.documentElement).overflowX,getComputedStyle(document.body).overflowX],
      placements};
   });
   assert.ok(result.overscroll<=1,"horizontal page overflow at "+item.browser+" "+item.width+": "+JSON.stringify(result));
   assert.ok(result.posterFits&&result.posterInGrid,"film card protrudes beyond viewport/grid at "+item.browser+" "+item.width);
   assert.ok(result.navNoOverlap,"brand overlaps CTA at "+item.browser+" "+item.width);
   assert.ok(result.placements.every(p=>p.withinViewport&&!p.missing),"clipped element at "+item.browser+" "+item.width+": "+JSON.stringify(result.placements));
   assert.ok(result.overflowMask.every(v=>!["hidden","clip"].includes(v)),"horizontal scroll masked instead of fixed");
   assert.deepEqual(errs,[],"browser JavaScript errors");
   if([320,390,430].includes(item.width))await page.screenshot({path:path.join(out,"fallen-"+item.browser+"-"+item.width+".png"),fullPage:true});
   receipt.cases.push({browser:item.browser,width:item.width,state:"PASS",overscroll:result.overscroll});
  }catch(e){
   const error=String(e?.message||e);
   receipt.failures.push({browser:item.browser,width:item.width,error});
   receipt.cases.push({browser:item.browser,width:item.width,state:"FAIL"});
   try{await page.screenshot({path:path.join(out,"failed-"+item.browser+"-"+item.width+".png"),fullPage:true})}catch{}
  }finally{await context.close()}
 }
 receipt.state=receipt.failures.length?"FAIL":"PASS";
 if(receipt.failures.length)process.exitCode=1;
}catch(e){receipt.state="FAIL";receipt.failures.push({setup_error:String(e?.stack||e)});process.exitCode=1}
finally{
 await chromiumInstance?.close();
 await webkitInstance?.close();
 fs.writeFileSync(path.join(out,"mobile-overflow-receipt.json"),JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt,null,2));
}
