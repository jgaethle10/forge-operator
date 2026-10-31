import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {dirname,join,resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium,devices} from "playwright";
import {generateKeyPairSync} from "node:crypto";
import {issuePackage} from "../scripts/passage-signed-package.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../public");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
async function serve(){
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,"http://localhost");
   const path=url.pathname==="/passage/"?"/passage/index.html":url.pathname;
   if(!path.startsWith("/passage/")||path.includes("..")){res.writeHead(404);res.end();return;}
   const full=resolve(root,"."+path);
   if(!full.startsWith(join(root,"passage")+"/")){res.writeHead(403);res.end();return;}
   const data=await readFile(full);
   res.writeHead(200,{"Content-Type":mime[extname(full)]||"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
   res.end(data);
  }catch{res.writeHead(404);res.end("Not Found");}
 });
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 return {server,base:"http://127.0.0.1:"+server.address().port+"/passage/"};
}
async function waitForLibrary(page){await page.waitForFunction(()=>document.querySelector("#library-count")?.textContent.includes("guides"));}
test("Passage Chrome browser acceptance: online, offline and mobile",async t=>{
 const {server,base}=await serve();
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
 t.after(async()=>{await browser.close();await new Promise(done=>server.close(done))});
 await t.test("desktop reader, search, saved shelf, downloads and offline reload",async()=>{
  const context=await browser.newContext({acceptDownloads:true});
  try{
   const page=await context.newPage();
   const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
   await page.goto(base);await waitForLibrary(page);
   assert.equal(await page.locator(".article-card").count(),5,"five guides are visible");
   await page.locator("#search").fill("scarce");
   assert.equal(await page.locator(".article-card").count(),1,"search narrows results");
   await page.locator("#search").fill("");
   await page.locator(".read-link").first().click();
   assert.match(await page.locator("#reader-title").innerText(),/check a claim/i);
   await page.locator("#bookmark-article").click();
   assert.equal(await page.locator("#bookmark-article").innerText(),"Remove bookmark");
   const oneDownload=page.waitForEvent("download");
   await page.locator("#download-article").click();
   const articleDownload=await oneDownload;
   assert.match(articleDownload.suggestedFilename(),/passage-check-a-claim/);
   assert.match(await readFile(await articleDownload.path(),"utf8"),/References for independent reading/);
   await page.locator("#back").click();
   await page.locator("#filters").getByRole("button",{name:"Saved"}).click();
   assert.equal(await page.locator(".article-card").count(),1,"saved shelf finds bookmarked guide");
   const allDownload=page.waitForEvent("download");
   await page.locator("#download-library").click();
   const offlineFile=await allDownload,offlinePath=await offlineFile.path();
   const exported=await readFile(offlinePath,"utf8");
   assert.match(exported,/Passage offline library/);
   assert.match(exported,/How to check a claim/);
   assert.doesNotMatch(exported,/<script/i);
   await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
     await new Promise((done,reject)=>{
      const timeout=setTimeout(()=>reject(Error("Service worker did not take control")),10000);
      navigator.serviceWorker.addEventListener("controllerchange",()=>{clearTimeout(timeout);done()},{once:true});
     });
    }
   });
   await context.setOffline(true);
   await page.reload({waitUntil:"domcontentloaded"});
   await waitForLibrary(page);
   assert.equal(await page.locator(".article-card").count(),5,"offline reload retains library");
   await page.locator("#filters").getByRole("button",{name:"Saved"}).click();
   assert.equal(await page.locator(".article-card").count(),1,"offline reload retains bookmark");
   assert.match(await page.locator("#connection-status").innerText(),/outdated/i);
   const fileContext=await browser.newContext(),filePage=await fileContext.newPage();
   try{let networkRequests=0;filePage.on("request",()=>networkRequests++);await filePage.setContent(exported,{waitUntil:"load"});assert.match(await filePage.locator("h1").innerText(),/passage/i);assert.equal(await filePage.locator("article").count(),5);assert.equal(networkRequests,0,"offline HTML has no external resource requests")}
   finally{await fileContext.close()}
   assert.deepEqual(pageErrors,[],"no application JavaScript errors");
  }finally{await context.close()}
 });
 await t.test("trusted local signature check accepts matching key and rejects tampering",async()=>{
  const context=await browser.newContext({acceptDownloads:true});
  try{
   const page=await context.newPage();await page.goto(base);await waitForLibrary(page);
   const catalog=JSON.parse(await readFile(join(root,"passage/catalog.json"),"utf8"));
   const {privateKey,publicKey}=generateKeyPairSync("ed25519");
   const privatePem=privateKey.export({type:"pkcs8",format:"pem"}).toString();
   const trustedPem=publicKey.export({type:"spki",format:"pem"}).toString();
   const signed=issuePackage({article:catalog.articles[0],privateKeyPem:privatePem,issuedAt:new Date(),ttlDays:2});
   await page.locator("#package-file").setInputFiles({name:"demo.json",mimeType:"application/json",buffer:Buffer.from(signed)});
   await page.locator("#trusted-key-file").setInputFiles({name:"trusted.pem",mimeType:"text/plain",buffer:Buffer.from(trustedPem)});
   await page.locator("#verify-package").click();
   await page.waitForFunction(()=>document.querySelector("#verification-status")?.textContent.includes("Signature and content match"));
   assert.equal(await page.locator("#save-verified-file").isVisible(),true);
   const received=page.waitForEvent("download");await page.locator("#save-verified-file").click();
   assert.match((await received).suggestedFilename(),/passage-check-a-claim/);
   const fake=JSON.parse(signed);fake.content_base64=Buffer.from("tampered").toString("base64");
   await page.locator("#package-file").setInputFiles({name:"altered.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fake))});
   await page.locator("#verify-package").click();
   await page.waitForFunction(()=>document.querySelector("#verification-status")?.textContent.includes("NOT VERIFIED"));
   assert.equal(await page.locator("#save-verified-file").isVisible(),false);
  }finally{await context.close()}
 });
 await t.test("two isolated device profiles: recipient verifies carried bytes with no network",async()=>{
  // Browser contexts share no cookies, storage or service workers. The file carriage is simulated.
  const publisherDevice=await browser.newContext();
  const readerDevice=await browser.newContext({acceptDownloads:true});
  try{
   const publisherPage=await publisherDevice.newPage();
   const readerPage=await readerDevice.newPage();
   await publisherPage.goto(base);await readerPage.goto(base);
   await waitForLibrary(publisherPage);await waitForLibrary(readerPage);
   await readerPage.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
     await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error("Offline recipient service worker did not control page")),10000);
      navigator.serviceWorker.addEventListener("controllerchange",()=>{clearTimeout(timeout);resolve()},{once:true});
     });
    }
   });
   const {privateKey,publicKey}=generateKeyPairSync("ed25519");
   const catalog=JSON.parse(await readFile(join(root,"passage/catalog.json"),"utf8"));
   const privatePem=privateKey.export({format:"pem",type:"pkcs8"}).toString();
   const publicPem=publicKey.export({format:"pem",type:"spki"}).toString();
   const independentFingerprint=createHash("sha256").update(publicKey.export({format:"der",type:"spki"})).digest("hex");
   const carriedPackage=issuePackage({article:catalog.articles[1],privateKeyPem:privatePem,issuedAt:new Date(),ttlDays:2});
   await readerDevice.setOffline(true);
   await readerPage.reload({waitUntil:"domcontentloaded"});await waitForLibrary(readerPage);
   assert.equal(await readerPage.evaluate(()=>navigator.onLine),false,"reader browser is disconnected");
   await readerPage.locator("#package-file").setInputFiles({name:"carried-package.json",mimeType:"application/json",buffer:Buffer.from(carriedPackage)});
   await readerPage.locator("#trusted-key-file").setInputFiles({name:"publisher-key.pem",mimeType:"text/plain",buffer:Buffer.from(publicPem)});
   await readerPage.locator("#expected-fingerprint").fill(independentFingerprint);
   await readerPage.locator("#verify-package").click();
   await readerPage.waitForFunction(()=>document.querySelector("#verification-status")?.textContent.includes("Signature, content and independent fingerprint match"));
   assert.equal(await readerPage.locator("#save-verified-file").isVisible(),true,"verified text available while disconnected");
   const download=readerPage.waitForEvent("download");
   await readerPage.locator("#save-verified-file").click();
   const item=await download;
   assert.match(await readFile(await item.path(),"utf8"),/Build a small offline reading shelf/);
   await readerPage.locator("#expected-fingerprint").fill("a".repeat(64));
   await readerPage.locator("#verify-package").click();
   await readerPage.waitForFunction(()=>document.querySelector("#verification-status")?.textContent.includes("NOT VERIFIED"));
   assert.equal(await readerPage.locator("#save-verified-file").isVisible(),false,"wrong fingerprint disables export");
  }finally{await readerDevice.close();await publisherDevice.close()}
 });
 await t.test("mobile-sized screen and accessible article focus",async()=>{
  const context=await browser.newContext({...devices["iPhone 13"],acceptDownloads:true});
  try{
   const page=await context.newPage();
   await page.goto(base);await waitForLibrary(page);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"no horizontal mobile overflow");
   await page.locator(".read-link").first().click();
   assert.equal(await page.evaluate(()=>document.activeElement?.id),"reader-title","reader title receives focus");
   const dir=process.env.PASSAGE_ARTIFACT_DIR;
   if(dir){
    await mkdir(dir,{recursive:true});
    await page.screenshot({path:join(dir,"passage-mobile-reader.png"),fullPage:true});
    await page.locator("#back").click();
    await page.screenshot({path:join(dir,"passage-mobile-library.png"),fullPage:true});
   }
  }finally{await context.close()}
 });
});
