import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Synthetic DOM verifies observer interaction logic even when a Chrome CI
// runner is unavailable. It does not substitute for physical-device QA.
const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'office-observe.js'),'utf8');
const listeners=new Map(),nodes=new Map(),actionCounts={model:0,missions:0};
const document={
  activeElement:null,
  getElementById:id=>nodes.get(id)||null,
  documentElement:null,body:null,
  addEventListener(name,fn){const a=listeners.get(name)||[];a.push(fn);listeners.set(name,a);}
};
function element(id){
  const classes=new Set(),attrs=new Map(),handlers=new Map();
  const obj={id,hidden:false,open:false,isConnected:true,textContent:'',
    listeners:handlers,scrollTop:0,
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),
      contains:k=>classes.has(k),toggle:(k,v)=>{
        const enabled=v===undefined?!classes.has(k):Boolean(v);
        if(enabled)classes.add(k);else classes.delete(k);return enabled;
      }},
    setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.has(k)?attrs.get(k):null,
    removeAttribute:k=>attrs.delete(k),
    addEventListener:(k,fn)=>{const a=handlers.get(k)||[];a.push(fn);handlers.set(k,a);},
    focus(){document.activeElement=obj;},scrollIntoView(){obj.scrolled=true;},
    getClientRects(){return [{}];},
    querySelectorAll:()=>[],
    contains:other=>other===obj||other?.parent===obj,
  };
  if(id)nodes.set(id,obj);
  return obj;
}
for(const id of ['office-visit-open','office-visit-close','office-inspector-jump',
  'office-camera-return','office-details','office','office-scene',
  'office-3d-toggle','office-agent-name','spatial-viewport','office-mode'])element(id);
document.documentElement=element('root-html');document.body=element('body');
const panel=element('inspector-panel');
nodes.get('office').querySelector=selector=>selector==='.office-inspector'?panel:null;
nodes.get('office').querySelectorAll=()=>[nodes.get('office-visit-close'),nodes.get('office-inspector-jump'),nodes.get('office-camera-return')];
nodes.get('office').contains=other=>other===nodes.get('office')||other===nodes.get('office-visit-close')||other===nodes.get('office-inspector-jump')||other===nodes.get('office-camera-return')||other===nodes.get('office-agent-name');
nodes.get('office-agent-name').textContent='Communications Specialist';
nodes.get('office-agent-name').setAttribute('tabindex','-1');
nodes.get('office-visit-close').hidden=true;
nodes.get('office-inspector-jump').hidden=true;
nodes.get('office-camera-return').hidden=true;
nodes.get('office-visit-open').setAttribute('aria-expanded','false');
nodes.get('office-3d-toggle').setAttribute('aria-pressed','false');
document.activeElement=nodes.get('office-visit-open');
const cameraCalls=[];
const window={
  WorkSabanOffice:{ready:Promise.resolve()},
  WorkSaban3D:{setEnabled(value){cameraCalls.push(Boolean(value));
    nodes.get('office-3d-toggle').setAttribute('aria-pressed',String(Boolean(value)));}},
};
const context={document,window,getComputedStyle:()=>({display:'block',visibility:'visible'}),Promise};
vm.runInNewContext(source,context,{filename:'office-observe.js'});
const observer=window.WorkSabanObserver;
assert(observer,'Observer API must be available');
const fire=(id,event='click')=>{for(const fn of nodes.get(id).listeners.get(event)||[])fn({});};
const key=(value,shiftKey=false)=>{
  const event={key:value,shiftKey,defaultPrevented:false,
    preventDefault(){this.defaultPrevented=true;}};
  for(const fn of listeners.get('keydown')||[])fn(event);return event;
};
assert.equal(observer.isOpen(),false);
fire('office-visit-open');
await Promise.resolve();
assert.equal(observer.isOpen(),true,'Enter button opens the modal');
assert.equal(nodes.get('office-details').open,true,'Office details must be opened');
assert.equal(nodes.get('office').getAttribute('role'),'dialog');
assert.equal(nodes.get('office').getAttribute('aria-modal'),'true');
assert.equal(nodes.get('office-visit-open').getAttribute('aria-expanded'),'true');
assert.equal(nodes.get('office-visit-close').hidden,false);
assert.equal(document.activeElement.id,'office-visit-close');
assert(document.body.classList.contains('office-observe-open'));
assert(cameraCalls.includes(true),'Entering mode enables existing 3D viewer');
fire('office-inspector-jump');
assert.equal(document.activeElement.id,'office-agent-name');
assert(panel.scrolled,'Inspect agent must navigate to actual evidence panel');
fire('office-camera-return');
assert.equal(document.activeElement.id,'spatial-viewport');
assert(nodes.get('office-scene').scrolled,'Back to camera scrolls the office scene while focusing its viewport');
const escape=key('Escape');
assert(escape.defaultPrevented,'Escape should be consumed inside the modal');
assert.equal(observer.isOpen(),false);
assert.equal(nodes.get('office-details').open,false,'Exit restores previous disclosure');
assert.equal(nodes.get('office').getAttribute('aria-modal'),null);
assert.equal(nodes.get('office-visit-open').getAttribute('aria-expanded'),'false');
assert.equal(nodes.get('office-visit-close').hidden,true);
assert.equal(document.activeElement.id,'office-visit-open','Focus returns to launch button');
assert.equal(cameraCalls.at(-1),false,'Exit restores original 2D mode');
assert(!document.documentElement.classList.contains('office-observe-open'));
assert.equal(actionCounts.model,0,'Observer must not start model work');
assert.equal(actionCounts.missions,0,'Observer must not start missions');
nodes.get('office-details').open=true;
nodes.get('office-3d-toggle').setAttribute('aria-pressed','true');
fire('office-visit-open');await Promise.resolve();
fire('office-visit-close');
assert.equal(nodes.get('office-details').open,true,'Existing open disclosure remains open');
assert.equal(cameraCalls.at(-1),true,'Pre-existing 3D view is preserved on exit');
console.log('Work Saban immersive observer: PASS (entry, inspector, camera return, Escape, focus restoration and zero execution).');
