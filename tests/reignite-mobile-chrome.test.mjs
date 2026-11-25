/**
 * Real Chrome/Chromium mobile viewport smoke test for REIGNITE.
 * Core Node + existing browser on GitHub runner; localhost and synthetic data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const serverScript=fileURLToPath(new URL('../systemia/events/reignite-layout-server.mjs',import.meta.url));
const chromeBin=()=>{
 for(const bin of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  const found=spawnSync('which',[bin],{encoding:'utf8'});
  if(found.status===0)return found.stdout.trim();
 }
 throw Error('Chrome/Chromium required for mobile browser proof; do not silently skip');
};
const eventually=async(fn,name,{tries=120,delay=90}={})=>{
 let last;
 for(let n=0;n<tries;n++){
  try{const value=await fn();if(value)return value}catch(e){last=e}
  await sleep(delay);
 }
 throw Error('Timeout '+name+(last?' ('+last.message+')':''));
};
const availablePort=()=>new Promise((resolve,reject)=>{
 const srv=createServer();srv.once('error',reject);
 srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;srv.close(()=>resolve(port))});
});
function connectDevtools(wsUrl){
 const socket=new WebSocket(wsUrl),pending=new Map();
 let counter=0;
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  const record=pending.get(msg.id);
  if(!record)return;
  pending.delete(msg.id);
  if(msg.error)record.reject(Error(msg.error.message));
  else record.resolve(msg.result);
 });
 const ready=new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 return {
  ready,
  async send(method,params={}){
   await ready;
   return new Promise((resolve,reject)=>{
    const id=++counter;pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
   });
  },
  async evaluate(expression){
   const value=await this.send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true
   });
   if(value.exceptionDetails)throw Error('Browser execution: '+value.exceptionDetails.text);
   return value.result?.value;
  },
  close(){socket.close()}
 };
}
async function ownerRequest(origin,owner,path,method='GET',payload){
 const res=await fetch(origin+path,{
  method,
  headers:{
   'x-reignite-key':owner,
   ...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{})
  },
  ...(method==='POST'?{body:JSON.stringify(payload)}:{})
 });
 return {status:res.status,data:await res.json()};
}
test('Chrome 390px viewport: one-use invite -> submission -> owner review -> refresh',async t=>{
 const chromeBinary=chromeBin();
 assert.equal(typeof WebSocket,'function','native Node 22 WebSocket must be present');
 const work=mkdtempSync(join(tmpdir(),'reignite-mobile-proof-'));
 const stateDir=join(work,'private-state'),profile=join(work,'chrome');
 const port=await availablePort();
 const env={...process.env,REIGNITE_LAYOUT_STATE:stateDir,
   REIGNITE_LAYOUT_PORT:String(port)};
 const origin='http://127.0.0.1:'+port;
 let service,chrome,tab;
 t.after(async()=>{
  try{tab?.close()}catch{}
  for(const p of [chrome,service])try{p?.kill('SIGTERM')}catch{}
  await sleep(170);
  for(const p of [chrome,service])try{if(p?.exitCode===null)p.kill('SIGKILL')}catch{}
  rmSync(work,{recursive:true,force:true});
 });
 const initial=execFileSync(process.execPath,[serverScript,'init'],{env,encoding:'utf8'});
 const owner=initial.match(/Owner key \(store privately; shown once\): (\S+)/)?.[1];
 assert(owner,'private owner credential must exist');
 const message=execFileSync(process.execPath,[serverScript,'invite-link','Coast photographer','2'],{env,encoding:'utf8'});
 const invite=message.match(/One-time link[^:]*: (\S+)/)?.[1];
 assert(invite?.startsWith(origin+'/'),'invitation must be local only');
 service=spawn(process.execPath,[serverScript,'serve'],{env,stdio:'ignore'});
 await eventually(async()=>{
  if(service.exitCode!==null)throw Error('private server stopped');
  return (await fetch(origin+'/health')).ok;
 },'private localhost service');
 let chromeErrors='';
 chrome=spawn(chromeBinary,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'
 ],{stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',chunk=>{
  chromeErrors=(chromeErrors+String(chunk)).slice(-3000);
 });
 const chromePort=await eventually(()=>{
  if(chrome.exitCode!==null)throw Error('Chrome exited: '+chromeErrors.slice(-600));
  const portText=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  return Number(portText)>0?Number(portText):null;
 },'Chrome debugging port',{tries:350,delay:100}).catch(err=>{
  throw Error(err.message+'; browser diagnostics: '+chromeErrors.slice(-700));
 });
 const target=await eventually(async()=>{
  const res=await fetch('http://127.0.0.1:'+chromePort+'/json/list');
  const targets=await res.json();
  return targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
 },'Chrome page target');
 tab=connectDevtools(target.webSocketDebuggerUrl);await tab.ready;
 await tab.send('Page.enable');
 await tab.send('Runtime.enable');
 await tab.send('Emulation.setDeviceMetricsOverride',{
  width:390,height:844,deviceScaleFactor:3,mobile:true,
  screenWidth:390,screenHeight:844
 });
 await tab.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await tab.send('Page.navigate',{url:invite});
 const joined=await eventually(async()=>{
  const x=await tab.evaluate('document.getElementById("quickFeedback")?.textContent||""');
  return x.includes('You are connected')?x:null;
 },'one-tap Chrome invitation',{tries:150,delay:100});
 assert.match(joined,/Coast photographer/);
 const mobile=await tab.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,editorVisible:!document.getElementById("myIdeasPanel").hidden,ownerHidden:document.getElementById("ownerPanel").hidden,ownerEvidenceHidden:document.getElementById("ownerReadinessPanel").hidden,submitHeight:document.getElementById("quickSend").getBoundingClientRect().height,advancedHidden:!document.body.classList.contains("advanced-open"),inviteInUrl:location.hash.length>0,cookieExposed:document.cookie.includes("reignite_editor")})');
 assert.equal(mobile.width,390);
 assert(mobile.scroll<=mobile.width+2,'mobile horizontal overflow: '+JSON.stringify(mobile));
 assert(mobile.editorVisible&&mobile.ownerHidden&&mobile.ownerEvidenceHidden);
 assert(mobile.advancedHidden);
 assert(mobile.submitHeight>=44,'mobile quick-submit target below 44px');
 assert.equal(mobile.inviteInUrl,false);
 assert.equal(mobile.cookieExposed,false,'HttpOnly cookie hidden from script');
 const tap=await tab.evaluate('(()=>{const form=document.getElementById("quickIdeaForm");form.elements.kind.value="art";form.elements.name.value="Coastal community photo exhibit";form.elements.place.value="unsure";form.elements.description.value="An accessible coastal photography exhibit with local artist contributions.";const button=document.getElementById("quickSend");button.scrollIntoView({block:"center",behavior:"instant"});const rect=button.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,visible:rect.top>=0&&rect.bottom<=innerHeight&&rect.width>=44&&rect.height>=44}})()');
 assert(tap.visible,'submit target not visible and touch-sized at 390px');
 await tab.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tap.x,y:tap.y}]});
 await tab.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await eventually(async()=>{
  const x=await tab.evaluate('document.getElementById("quickFeedback")?.textContent||""');
  return x.includes('received for owner review')?x:null;
 },'contributor idea submitted',{tries:120,delay:80});
 const authorView=await tab.evaluate('document.getElementById("myIdeasList").textContent');
 assert.match(authorView,/Coastal community photo exhibit/);
 assert.match(authorView,/waiting for owner review/i);
 const queue=await ownerRequest(origin,owner,'/api/reviews');
 assert.equal(queue.status,200);
 assert.equal(queue.data.proposals.length,1);
 const selected=queue.data.proposals[0];
 const reviewed=await ownerRequest(origin,owner,
  '/api/review/'+encodeURIComponent(selected.id),'POST',
  {decision:'approve_for_planning',
    review_note:'Provisional idea only. No confirmed event location or venue permission.'});
 assert.equal(reviewed.status,200);
 assert.equal(reviewed.data.receipt.venue_authorized,false);
 await tab.evaluate('document.getElementById("refreshMyIdeas").click()');
 await eventually(async()=>{
  const text=await tab.evaluate('document.getElementById("myIdeasList").textContent');
  return text.includes('Added to planning draft')?text:null;
 },'contributor sees owner decision');
 await tab.send('Page.reload',{ignoreCache:true});
 await eventually(async()=>{
  const text=await tab.evaluate('document.getElementById("quickFeedback")?.textContent||""');
  return text.includes('Welcome back')?text:null;
 },'reopened cookie session',{tries:150,delay:100});
 const returned=await tab.evaluate('({status:document.getElementById("myIdeasList").textContent,ownerHidden:document.getElementById("ownerPanel").hidden,evidenceHidden:document.getElementById("ownerReadinessPanel").hidden,width:innerWidth,scroll:document.documentElement.scrollWidth})');
 assert.match(returned.status,/Added to planning draft/);
 assert(returned.ownerHidden&&returned.evidenceHidden);
 assert(returned.scroll<=returned.width+2);
 assert.equal((await ownerRequest(origin,owner,'/api/owner/readiness')).data.event_approved,false);
 // Browser viewport smoke only: no physical iPhone, mobile Safari or real user study.
});
