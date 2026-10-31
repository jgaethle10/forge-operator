/**
 * Own-stack Work Saban browser visual acceptance. Uses Chrome DevTools,
 * loopback preview, and Node built-ins only. No customer data or model calls.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {startWorkSabanPreview} from './server.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function chromePath(){
  for(const name of [process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium']){
    if(!name)continue;
    const found=spawnSync('which',[name],{encoding:'utf8'});
    if(found.status===0)return found.stdout.trim();
  }
  throw Error('CHROME_UNAVAILABLE: real browser QA not verified');
}
async function debuggerPort(dir,child){
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)throw Error('Chrome exited before DevTools opened');
    try{
      const raw=await fs.readFile(path.join(dir,'DevToolsActivePort'),'utf8');
      const port=Number(raw.split('\n')[0]);
      if(port>0)return port;
    }catch{}
    await sleep(100);
  }
  throw Error('Chrome local DevTools connection unavailable');
}
async function devtools(url){
  const ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('WebSocket timeout')),9000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket failed'));},{once:true});
  });
  let serial=0;
  const awaiting=new Map();
  ws.addEventListener('message',event=>{
    const x=JSON.parse(String(event.data));
    const task=awaiting.get(x.id);
    if(!task)return;
    clearTimeout(task.timer);awaiting.delete(x.id);
    if(x.error)task.reject(Error(x.error.message||'Chrome command failed'));
    else task.resolve(x.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{awaiting.delete(id);reject(Error('DevTools timeout: '+method));},12000);
    awaiting.set(id,{timer,resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
  return {send,close:()=>ws.close()};
}
async function js(send,expression){
  const answer=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(answer.exceptionDetails)throw Error(answer.exceptionDetails.text||'JavaScript exception in browser');
  return answer.result?.value;
}
async function viewport(send,{width,height,mobile,label,out}){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:mobile?2:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:2});
  await send('Page.reload',{ignoreCache:true});
  let ready=false;
  for(let i=0;i<60;i++){
    await sleep(100);
    ready=await js(send,"Boolean(document.readyState==='complete'&&window.WorkSaban3D&&document.getElementById('office-3d-toggle'))");
    if(ready)break;
  }
  assert(ready,'Office scripts did not load');
  const loaded=await js(send,"(()=>{document.getElementById('office-details').open=true;if(document.getElementById('spatial-viewport')?.hidden===true)document.getElementById('office-3d-toggle').click();return {rig:!!window.EvercraftObserverCamera,desks:document.querySelectorAll('.spatial-agent').length,shown:document.getElementById('spatial-viewport').hidden===false};})()");
  assert(loaded.rig,'Owned camera did not load');
  assert.equal(loaded.desks,6);
  assert(loaded.shown,'CSS3D office remained hidden');
  await js(send,"document.getElementById('office-scene').scrollIntoView({block:'center'});true");
  const motion=await js(send,"(async()=>{const ui=window.WorkSaban3D;const initial=ui.getRenderedCamera().panX;ui.focusAgent('writer');const target=ui.getCamera().panX;const before=ui.getRenderedCamera().panX;await new Promise(r=>setTimeout(r,100));const midway=ui.getRenderedCamera().panX;await new Promise(r=>setTimeout(r,1100));return {initial,target,before,midway,after:ui.getRenderedCamera().panX,follow:typeof ui.toggleFollow==='function'};})()");
  assert(motion.follow,'Follow mode missing');
  assert(Math.abs(motion.target-motion.initial)>5,'Focus has no travel');
  assert(Math.abs(motion.midway-motion.target)<Math.abs(motion.before-motion.target),'Camera did not ease');
  assert(Math.abs(motion.after-motion.target)<1,'Camera did not converge');
  if(mobile){
    const touch=await js(send,"(()=>{const v=document.getElementById('spatial-viewport'),u=window.WorkSaban3D,before=u.getCamera().yaw;const send=(t,id,x,y)=>v.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0}));send('pointerdown',41,70,180);send('pointermove',41,130,195);send('pointerup',41,130,195);return {before,after:u.getCamera().yaw};})()");
    assert.notEqual(touch.before,touch.after,'Mobile orbit touch did not work');
  }
  await sleep(550);
  const pixels=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const screenshot=path.join(out,'work-saban-'+label+'.png');
  await fs.writeFile(screenshot,Buffer.from(pixels.data,'base64'));
  assert((await fs.stat(screenshot)).size>8000,'Screenshot is unexpectedly empty');
  return {label,width,height,mobile,desks:loaded.desks,follow_control:true,camera_easing:true,
    touch_orbit:mobile?'passed':'not_applicable',screenshot};
}
const out=process.env.WORK_SABAN_BROWSER_PROOF_DIR||path.join(os.tmpdir(),'work-saban-browser-qa');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saban-chrome-'));
await fs.mkdir(out,{recursive:true});
const server=await startWorkSabanPreview({host:'127.0.0.1',port:0});
let chrome,client;
try{
  chrome=spawn(chromePath(),[
    '--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  const port=await debuggerPort(profile,chrome);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(t=>t.type==='page');
  assert(page?.webSocketDebuggerUrl,'Chrome page target not found');
  client=await devtools(page.webSocketDebuggerUrl);
  const send=client.send;
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  const results=[];
  results.push(await viewport(send,{width:1280,height:900,mobile:false,label:'desktop',out}));
  results.push(await viewport(send,{width:390,height:844,mobile:true,label:'iphone',out}));
  await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify({
    schema:'evercraft.work-saban.browser-camera-acceptance.v1',
    source:'real_headless_chrome_loopback_preview',
    agent_execution:'no model inference, synthetic local fixture',
    production_released:false,results
  },null,2)+'\n');
  console.log('WORK SABAN CHROME VISUAL QA PASS',JSON.stringify(results));
}finally{
  try{client?.close();}catch{}
  if(chrome){chrome.kill('SIGTERM');await sleep(150);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await new Promise(resolve=>server.close(resolve));
  await fs.rm(profile,{recursive:true,force:true});
}
