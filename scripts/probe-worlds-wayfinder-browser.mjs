// Source-only, read-only browser QA for Evercraft Worlds Wayfinder.
// It does not prove a live host, physical iPhone, seamless flight, or player-state transfer.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const origin='http://127.0.0.1:8779';
const out=resolve('artifacts/worlds-wayfinder-browser');
const receipt={schema:'evercraft.worlds.wayfinder.browser.v1',source:'local_checkout',production_deployed:false,physical_phone_tested:false,shared_player_state:false,scenarios:[]};
await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8779','--bind','127.0.0.1','-d','public'],{stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<40;i++){
  if(server.exitCode!==null)throw Error('wayfinder_server_exited');
  try{const r=await fetch(origin+'/worlds/destinations.v1.json');if(r.ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 assert.ok(ready,'Worlds registry not served by local QA server');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 for(const profile of [{name:'desktop',width:1280,height:800,mobile:false},{name:'phone',width:390,height:844,mobile:true}]){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile});
  const page=await context.newPage();
  try{
   const route=origin+'/worlds/flight/#seattle';
   const first=await page.goto(route,{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(first?.status(),200,'Flightworks route unavailable');
   let toggle=page.locator('[data-evercraft-wayfinder] button.toggle');
   await toggle.waitFor({state:'visible',timeout:20000});
   await toggle.click({timeout:15000});
   const next=page.locator('[data-evercraft-wayfinder] a.next');
   await next.waitFor({state:'visible',timeout:15000});
   assert.equal(await next.getAttribute('href'),'/worlds/hidden-world/yakima-walk/','Seattle next stop');
   assert.equal(await page.locator('[data-evercraft-wayfinder] a[href="/worlds/gateway/"]').count(),1);
   assert.ok(await page.locator('[data-evercraft-wayfinder] .entries a').count()>=6);
   await page.screenshot({path:out+'/'+profile.name+'-seattle.png',timeout:15000});
   await page.locator('[data-evercraft-wayfinder] button.close').click();
   assert.equal(await page.locator('[data-evercraft-wayfinder] nav.panel').isVisible(),false,'Wayfinder does not close');
   await page.goto(origin+'/worlds/hidden-world/yakima-walk/',{waitUntil:'domcontentloaded',timeout:30000});
   toggle=page.locator('[data-evercraft-wayfinder] button.toggle');
   await toggle.waitFor({state:'visible',timeout:20000});
   await toggle.click({timeout:15000});
   const reverse=page.locator('[data-evercraft-wayfinder] a.next');
   await reverse.waitFor({state:'visible',timeout:15000});
   assert.equal(await reverse.getAttribute('href'),'/worlds/flight/#seattle','Yakima next stop');
   await page.screenshot({path:out+'/'+profile.name+'-yakima.png',timeout:15000});
   receipt.scenarios.push({profile:profile.name,flights_to_yakima:true,yakima_to_flights:true,menu_close:true});
  }finally{await context.close()}
 }
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{const page=await ctx.newPage();const r=await page.goto(origin+'/worlds/',{waitUntil:'domcontentloaded',timeout:30000});assert.equal(r?.status(),200);const toggle=page.locator('[data-evercraft-wayfinder] button.toggle');await toggle.waitFor({state:'visible',timeout:20000});await toggle.click();assert.equal(await page.locator('[data-evercraft-wayfinder] a.next').getAttribute('href'),'/worlds/flight/#seattle');receipt.scenarios.push({profile:'mossmere-phone',wayfinder:true})}finally{await ctx.close()}
 receipt.status='PASS';
}finally{
 await browser?.close();
 server.kill('SIGTERM');
 await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');
}
console.log(JSON.stringify(receipt));
