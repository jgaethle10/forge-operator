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
async function debuggerPort(dir,child,getDiagnostics=()=>'',timeoutSteps=180){
  for(let n=0;n<timeoutSteps;n++){
    if(child.exitCode!==null||child.signalCode!==null){
      throw Error('Chrome exited before DevTools opened: '+getDiagnostics().slice(-1400));
    }
    try{
      const raw=await fs.readFile(path.join(dir,'DevToolsActivePort'),'utf8');
      const port=Number(raw.split('\n')[0]);
      if(port>0)return port;
    }catch{}
    await sleep(100);
  }
  throw Error('Chrome local DevTools unavailable after '+timeoutSteps/10+
    ' seconds: '+getDiagnostics().slice(-1400));
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
  if(answer.exceptionDetails)throw Error('Browser expression failed: '+expression.slice(0,180)+' :: '+(answer.exceptionDetails.exception?.description||answer.exceptionDetails.text||'JavaScript exception in browser'));
  return answer.result?.value;
}
async function viewport(send,{width,height,mobile,label,out}){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:mobile?2:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:2});
  await send('Page.reload',{ignoreCache:true});
  let ready=false;
  for(let i=0;i<60;i++){
    await sleep(100);
    ready=await js(send,"Boolean(document.readyState==='complete'&&window.WorkSaban3D&&window.WorkSabanObserver&&document.getElementById('office-3d-toggle'))");
    if(ready)break;
  }
  assert(ready,'Office scripts did not load');
  const loaded=await js(send,"(()=>{document.getElementById('office-details').open=true;if(document.getElementById('spatial-viewport')?.hidden===true)document.getElementById('office-3d-toggle').click();return {rig:!!window.EvercraftObserverCamera,desks:document.querySelectorAll('.spatial-agent').length,shown:document.getElementById('spatial-viewport').hidden===false};})()");
  assert(loaded.rig,'Owned camera did not load');
  assert.equal(loaded.desks,6);
  assert(loaded.shown,'CSS3D office remained hidden');
  const environment=await js(send,"(()=>{const shell=document.querySelector('.spatial-studio-shell'),meeting=document.querySelector('.spatial-meeting-hub'),people=[...document.querySelectorAll('.spatial-agent')];return {shared:!!shell,meeting:!!meeting,windows:document.querySelectorAll('.spatial-window').length,arms:document.querySelectorAll('.spatial-person-arm').length,legs:document.querySelectorAll('.spatial-person-leg').length,oneRoom:getComputedStyle(document.querySelector('.spatial-room-wall')).display==='none',disclosure:document.querySelector('.spatial-motion-disclosure')?.textContent||'',idle:people.every(x=>x.dataset.activity==='waiting')};})()");
  assert(environment.shared,'Shared studio shell did not render');
  assert(environment.meeting,'Central meeting table missing');
  assert.equal(environment.windows,2,'Studio must have actual window props');
  assert.equal(environment.arms,12,'All six characters have arms');
  assert.equal(environment.legs,12,'All six characters have legs');
  assert(environment.oneRoom,'Former six wall partitions should not enclose the studio');
  assert(environment.disclosure.includes('RECORDED EVENTS'),'Motion disclosure must stay visible and truthful');
  assert(environment.idle,'Unassigned characters must not simulate work');
  await js(send,"document.getElementById('office-scene').scrollIntoView({block:'center'});true");
  await sleep(350);
  const overview=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const overviewFile=path.join(out,'work-saban-'+label+'-overview.png');
  await fs.writeFile(overviewFile,Buffer.from(overview.data,'base64'));
  assert((await fs.stat(overviewFile)).size>8000,'Overview screenshot unexpectedly empty');
  const roomLevel=await js(send,"(()=>{const u=window.WorkSaban3D;u.toggleRoomLevel();return {selected:u.isRoomLevel(),pitch:u.getCamera().pitch,activity:u.getState()};})()");
  assert(roomLevel.selected,'Optional room-level viewpoint must toggle');
  assert.equal(roomLevel.pitch,34);
  await sleep(750);
  const groundImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const groundFile=path.join(out,'work-saban-'+label+'-shared-studio.png');
  await fs.writeFile(groundFile,Buffer.from(groundImage.data,'base64'));
  assert((await fs.stat(groundFile)).size>8000,'Studio screenshot unexpectedly empty');
  await js(send,"window.WorkSaban3D.toggleRoomLevel();true");
  const motion=await js(send,"(async()=>{const ui=window.WorkSaban3D;const initial=ui.getRenderedCamera().panX;document.querySelector('.spatial-agent[data-agent=writer]').click();const target=ui.getCamera().panX;const before=ui.getRenderedCamera().panX;await new Promise(r=>setTimeout(r,100));const midway=ui.getRenderedCamera().panX;await new Promise(r=>setTimeout(r,1100));return {initial,target,before,midway,after:ui.getRenderedCamera().panX,follow:typeof ui.toggleFollow==='function'};})()");
  assert(motion.follow,'Follow mode missing');
  assert.equal(await js(send,"document.getElementById('office-agent-name').textContent"),'Communications Specialist','visual focus and inspector selection must agree');
  assert(Math.abs(motion.target-motion.initial)>5,'Focus has no travel');
  assert(Math.abs(motion.midway-motion.target)<Math.abs(motion.before-motion.target),'Camera did not ease');
  assert(Math.abs(motion.after-motion.target)<1,'Camera did not converge');
  if(mobile){
    const framing=await js(send,'window.WorkSaban3D.getCamera().zoom');
    assert(framing<=.69,'Phone follow view is excessively zoomed/cropped');
  }
  if(mobile){
    const touch=await js(send,"(()=>{const v=document.getElementById('spatial-viewport'),u=window.WorkSaban3D,before=u.getCamera().yaw;const send=(t,id,x,y)=>v.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0}));send('pointerdown',41,70,180);send('pointermove',41,130,195);send('pointerup',41,130,195);return {before,after:u.getCamera().yaw};})()");
    assert.notEqual(touch.before,touch.after,'Mobile orbit touch did not work');
  }
  await sleep(550);
  const pixels=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const screenshot=path.join(out,'work-saban-'+label+'-focus.png');
  await fs.writeFile(screenshot,Buffer.from(pixels.data,'base64'));
  assert((await fs.stat(screenshot)).size>8000,'Focus screenshot is unexpectedly empty');
  const beforeState=await js(send,"JSON.stringify(window.WorkSaban3D.getState())");
  const entered=await js(send,"(()=>{document.getElementById('office-visit-open').click();const x=document.getElementById('office');return {active:window.WorkSabanObserver.isOpen(),modal:x.getAttribute('aria-modal'),role:x.getAttribute('role'),position:getComputedStyle(x).position,wide:x.getBoundingClientRect().width,closeHidden:document.getElementById('office-visit-close').hidden,entryExpanded:document.getElementById('office-visit-open').getAttribute('aria-expanded'),scrollLocked:document.documentElement.classList.contains('office-observe-open')};})()");
  assert.equal(entered.active,true,'One-tap observer mode did not open');
  assert.equal(entered.role,'dialog');
  assert.equal(entered.modal,'true');
  assert.equal(entered.position,'fixed');
  assert.equal(entered.entryExpanded,'true');
  assert.equal(entered.closeHidden,false);
  assert.equal(entered.scrollLocked,true);
  assert(entered.wide>=width-2,'Immersive office must fill viewing width');
  await sleep(350);
  const immersiveImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const immersiveFile=path.join(out,'work-saban-'+label+'-immersive.png');
  await fs.writeFile(immersiveFile,Buffer.from(immersiveImage.data,'base64'));
  assert((await fs.stat(immersiveFile)).size>8000,'Immersive office screenshot is unexpectedly empty');
  const inspectorState=await js(send,"(()=>{document.getElementById('office-inspector-jump').click();return {active:window.WorkSabanObserver.isOpen(),focused:document.activeElement.id,selected:document.getElementById('office-agent-name').textContent};})()");
  assert.equal(inspectorState.focused,'office-agent-name','Inspector jump must focus selected worker evidence');
  assert.equal(inspectorState.selected,'Communications Specialist');
  const backToCamera=await js(send,"(()=>{document.getElementById('office-camera-return').click();return document.activeElement.id;})()");
  assert.equal(backToCamera,'spatial-viewport','Back to camera must restore keyboard navigation');
  const exitState=await js(send,"(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape'}));return {active:window.WorkSabanObserver.isOpen(),expanded:document.getElementById('office-visit-open').getAttribute('aria-expanded'),modal:document.getElementById('office').getAttribute('aria-modal'),scrollLocked:document.documentElement.classList.contains('office-observe-open')};})()");
  assert.equal(exitState.active,false,'Escape must close immersive view');
  assert.equal(exitState.expanded,'false');
  assert.equal(exitState.modal,null);
  assert.equal(exitState.scrollLocked,false);
  assert.equal(await js(send,"JSON.stringify(window.WorkSaban3D.getState())"),beforeState,'Camera presentation must not fake worker execution events');
  const tourStart=await js(send,"(()=>{const ui=window.WorkSaban3D;const before=JSON.stringify(ui.getState());ui.toggleStudioTour();return {active:ui.getStudioTour().active,index:ui.getStudioTour().index,label:ui.getStudioTour().label,panX:ui.getCamera().panX,workerState:JSON.stringify(ui.getState()),before};})()");
  assert.equal(tourStart.active,true,'Tour button failed to open');
  assert.equal(tourStart.index,0);
  assert(tourStart.label.includes('CAMERA ONLY'),'Tour must reveal that it is a visitor camera');
  assert.equal(tourStart.workerState,tourStart.before,'Opening tour must not advance any work');
  const tourStep=await js(send,"(()=>{const ui=window.WorkSaban3D;ui.tourNext();return {index:ui.getStudioTour().index,label:ui.getStudioTour().label,panX:ui.getCamera().panX,inspector:document.getElementById('office-agent-name').textContent,workerState:JSON.stringify(ui.getState())};})()");
  assert.equal(tourStep.index,1,'Next button must visit the next waypoint');
  assert.notEqual(tourStep.panX,tourStart.panX,'Tour camera must travel');
  assert.equal(tourStep.inspector,'Mission Director','Visitor guide and agent inspector must agree');
  assert.equal(tourStep.workerState,tourStart.before,'Tour cannot manufacture activity');
  await sleep(650);
  const tourPixels=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const tourScreenshot=path.join(out,'work-saban-'+label+'-visitor-tour.png');
  await fs.writeFile(tourScreenshot,Buffer.from(tourPixels.data,'base64'));
  assert((await fs.stat(tourScreenshot)).size>8000,'Guided tour screenshot unexpectedly empty');
  const tourStop=await js(send,"(()=>{const ui=window.WorkSaban3D;ui.tourPrevious();const prev=ui.getStudioTour().index;ui.toggleStudioTour();return {prev,active:ui.getStudioTour().active,workerState:JSON.stringify(ui.getState())};})()");
  assert.equal(tourStop.prev,0,'Visitor must be able to return to the entrance');
  assert.equal(tourStop.active,false,'Visitor may leave the tour');
  assert.equal(tourStop.workerState,tourStart.before);
  return {label,width,height,mobile,desks:loaded.desks,follow_control:true,camera_easing:true,
    immersive_observe:'passed',inspection_navigation:'passed',keyboard_exit:'passed',
    guided_visitor_waypoints:'passed',tour_cannot_trigger_worker_activity:true,
    touch_orbit:mobile?'passed':'not_applicable',screenshots:{overview:overviewFile,sharedStudio:groundFile,focus:screenshot,immersive:immersiveFile,visitorTour:tourScreenshot}};
}
const out=process.env.WORK_SABAN_BROWSER_PROOF_DIR||path.join(os.tmpdir(),'work-saban-browser-qa');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saban-chrome-'));
await fs.mkdir(out,{recursive:true});
const server=await startWorkSabanPreview({host:'127.0.0.1',port:0});
let chrome,client;
let chromeDiagnostics='';
try{
  chrome=spawn(chromePath(),[
    '--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
    '--disable-extensions','--no-first-run','--no-default-browser-check',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  chrome.on('error',e=>{chromeDiagnostics='Chrome launch error: '+e.message;});
  chrome.stderr.on('data',chunk=>{
    chromeDiagnostics=(chromeDiagnostics+String(chunk)).slice(-2800);
  });
  const port=await debuggerPort(profile,chrome,()=>chromeDiagnostics);
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
