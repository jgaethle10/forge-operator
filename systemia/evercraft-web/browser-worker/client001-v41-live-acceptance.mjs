import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const URL='https://jgaethle10.github.io/forge-operator/clients/on-the-go/review/';
const OUT=process.env.CLIENT001_EVIDENCE_DIR||'artifacts/client001-v41-browser';
const BREAKPOINTS=[375,390,768,1024,1280,1440];
const EMAIL='onthegomobileoilchange@outlook.com';
fs.mkdirSync(OUT,{recursive:true});
const receipt={
 schema:'evercraft.client001.v41.live-browser-acceptance.v1',
 site:URL,scope:'exact deployed HTTPS preview',
 client_approval:'unverified',promotion_authorized:false,
 booking_proven:false,email_sent:false,tests:[],failures:[],screenshots:[]
};
const systemChrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/opt/google/chrome/chrome'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(systemChrome?{executablePath:systemChrome}:{})});
async function journey(width,language){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},isMobile:width<500,reducedMotion:'reduce'});
 const page=await ctx.newPage(), jsErrors=[], writes=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method());});
 try{
  const res=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(res?.status(),200);
  assert.match(await page.title(),/Client Preview V4\.1/);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow,noarchive');
  assert.equal(await page.locator('.nav-phone').getAttribute('href'),'#contact');
  await page.locator('#'+language).click();
  assert.equal(await page.locator('html').getAttribute('lang'),language);
  await page.locator('input[name=oil][value=full]').check();
  await page.locator('#matchTires').check();
  assert.equal((await page.locator('#matchResultPrice').textContent()).trim(),'$120.99');
  await page.locator('#matchAsk').click();
  const chosen=(await page.locator('#selection').textContent()).trim();
  assert.match(chosen,language==='es'?/Aceite sintético.*rotación/i:/Full synthetic.*tire rotation/i);
  const mailto=await page.locator('#emailCta').getAttribute('href');
  assert.ok(mailto?.startsWith('mailto:'+EMAIL+'?'));
  const decoded=decodeURIComponent(mailto);
  assert.match(decoded,language==='es'?/Consulta de servicio On The Go/:/On The Go service inquiry/);
  assert.match(decoded,language==='es'?/Aceite sintético.*rotación/i:/Full synthetic.*tire rotation/i);
  assert.equal(await page.locator('#callCta').getAttribute('href'),'tel:+15098335025');
  assert.ok((await page.locator('.contact-email').textContent()).includes(EMAIL));
  await page.locator('#copyEmail').click();
  await page.waitForFunction(() => document.querySelector('#copyFeedback')?.textContent?.trim().length > 0, null, {timeout:5000});
  const copy=(await page.locator('#copyFeedback').textContent()).trim();
  assert.ok(/copied|copy|copiado|copia/i.test(copy));
  const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
  assert.ok(size.content<=size.viewport+2,'horizontal overflow: '+JSON.stringify(size));
  assert.equal(jsErrors.length,0,jsErrors.join('; '));
  assert.equal(writes.length,0,'unexpected outbound writing request');
  if(width<500) assert.equal(await page.locator('.mobile-bar a[href^="tel:"]').count(),1);
  // Visit the whole page as a real scroller would, so lazy-loaded client images appear.
  await page.evaluate(async()=>{
   const step=Math.max(250,Math.floor(window.innerHeight*0.75));
   for(let y=0;y<document.documentElement.scrollHeight;y+=step){
    window.scrollTo(0,y);
    await new Promise(resolve=>setTimeout(resolve,65));
   }
   window.scrollTo(0,0);
  });
  await page.waitForFunction(
   ()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0),
   null,{timeout:10000}
  );
  const file=path.join(OUT,'onthego-v41-'+width+'-'+language+'.png');
  await page.screenshot({path:file,fullPage:true,animations:'disabled'});
  receipt.screenshots.push(file);
  receipt.tests.push({width,language,http:res.status(),price:'$120.99',contact:'mailto draft + readable email + tel option',copy,overflow_px:Math.max(0,size.content-size.viewport),screenshot:file});
  console.log('PASS',width,language);
 } finally{await ctx.close();}
}
async function denial(){
 const ctx=await browser.newContext({viewport:{width:1280,height:900}});
 await ctx.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));
 const page=await ctx.newPage();
 try{
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.locator('#copyEmail').click();
  assert.match(await page.locator('#copyFeedback').textContent(),/Select and copy/i);
  await page.locator('#es').click();
  await page.locator('#copyEmail').click();
  assert.match(await page.locator('#copyFeedback').textContent(),/Selecciona y copia/i);
  receipt.denied_clipboard='PASS';
 } finally{await ctx.close();}
}
async function keyboard(){
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await ctx.newPage();
 try{
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  const focus=[];
  for(let i=0;i<16;i++){
   await page.keyboard.press('Tab');
   focus.push(await page.evaluate(()=>{const e=document.activeElement;return(e?.tagName||'')+':'+(e?.id||e?.getAttribute('href')||'');}));
  }
  assert.ok(focus.some(x=>x.includes('#contact')),'desktop contact CTA keyboard access');
  assert.ok(focus.some(x=>x.includes(':en')||x.includes(':es')),'language controls keyboard access');
  receipt.keyboard='PASS initial navigation path';
 } finally{await ctx.close();}
}
try{
 for(const width of BREAKPOINTS)for(const language of ['en','es']){
  try{await journey(width,language);}
  catch(e){receipt.failures.push({test:width+'-'+language,error:String(e.message||e)});console.error('FAIL',width,language,String(e.message||e));}
 }
 for(const [label,fn] of [['clipboard-denied',denial],['keyboard',keyboard]]){
  try{await fn();console.log('PASS',label);}
  catch(e){receipt.failures.push({test:label,error:String(e.message||e)});}
 }
}finally{
 await browser.close();
 receipt.browser_state=receipt.failures.length===0&&receipt.tests.length===12?'browser_pass':'browser_fail';
 fs.writeFileSync(path.join(OUT,'acceptance.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log('browser_state',receipt.browser_state,'failures',receipt.failures.length);
 if(receipt.browser_state!=='browser_pass')process.exitCode=1;
}
