import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Minimal DOM harness deliberately exercises the real office script, not a separate fake implementation.
class Element {
  constructor(tag='div') {
    this.tagName=tag.toLowerCase();
    this.children=[];
    this.parentElement=null;
    this.className='';
    this.classSet=new Set();
    this.classList={
      add:name=>this.classSet.add(name),
      remove:name=>this.classSet.delete(name),
      toggle:(name,condition)=>{
        if(condition === undefined)condition=!this.classSet.has(name);
        if(condition)this.classSet.add(name);
        else this.classSet.delete(name);
        return condition;
      },
      contains:name=>this.classSet.has(name)
    };
    this.textContent='';
    this.style={transform:'',setProperty:()=>{}};
    this.dataset={};
    this.attributes={};
    this.listeners={};
    this.hidden=false;
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]||null;}
  addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  querySelector(selector){
    const predicate=selector.startsWith('#')?e=>e.id===selector.slice(1):
      selector.startsWith('.')?e=>e.className.split(' ').includes(selector.slice(1)):
      e=>e.tagName===selector;
    const stack=[...this.children];
    while(stack.length){const current=stack.shift();if(predicate(current))return current;stack.push(...current.children);}
    return null;
  }
  closest(){return null;}
  setPointerCapture(){}
}
const scene=new Element('div');scene.id='office-scene';
const toggle=new Element('button');toggle.id='office-3d-toggle';
const costumeMount=new Element('div');costumeMount.id='office-costume-toolbar';costumeMount.hidden=true;
const doc={
  createElement:tag=>new Element(tag),
  getElementById:(id)=>id==='office-scene'?scene:id==='office-3d-toggle'?toggle:
      id==='office-costume-toolbar'?costumeMount:scene.querySelector('#'+id)
};
let clock=0,frameId=0;
const frames=new Map();
const raf=fn=>{const id=++frameId;frames.set(id,fn);return id;};
const cancel=id=>frames.delete(id);
function advanceFrames(count=180){
  for(let i=0;i<count&&frames.size;i++){
    clock+=16.6667;
    const ready=[...frames.entries()];
    frames.clear();
    for(const [id,fn] of ready)fn(clock);
  }
}
const context={document:doc,window:{innerWidth:1110,requestAnimationFrame:raf,cancelAnimationFrame:cancel},requestAnimationFrame:raf,cancelAnimationFrame:cancel};
const directory=path.dirname(fileURLToPath(import.meta.url));
const cameraSource=fs.readFileSync(path.join(directory,'office-camera.js'),'utf8');
vm.runInNewContext(cameraSource,context,{filename:'office-camera.js'});
const costumeSource=fs.readFileSync(path.join(directory,'office-costumes.js'),'utf8');
vm.runInNewContext(costumeSource,context,{filename:'office-costumes.js'});
const source=fs.readFileSync(path.join(directory,'office-3d.js'),'utf8');
vm.runInNewContext(source,context,{filename:'office-3d.js'});
const ui=context.window.WorkSaban3D;
assert(ui);
assert.equal(ui.getState().analyst,'idle');
ui.proposed({team:[{id:'director'},{id:'analyst'},{id:'auditor'}]});
assert.equal(ui.getState().analyst,'proposed');
assert.equal(ui.getState().writer,'idle');
ui.consume({type:'accepted'});
assert.equal(ui.getState().director,'admitted');
ui.consume({type:'stage_started',role:'analyst'});
assert.equal(ui.getState().analyst,'running');
ui.consume({type:'stage_verified',role:'analyst',receipt:{quality_status:'pass',result_sha256:'sha256:valid'}});
assert.equal(ui.getState().analyst,'verified');
ui.consume({type:'stage_verified',role:'writer',receipt:{quality_status:'fail'}});
assert.notEqual(ui.getState().writer,'verified');
ui.setEnabled(true);
assert.equal(toggle.getAttribute('aria-pressed'),'true');
assert.equal(scene.querySelectorAll?.('.spatial-agent')?.length||0,0); // harness doesn't implement querySelectorAll
const viewport=scene.querySelector('#spatial-viewport');
assert(viewport);
const role=scene.querySelector('.spatial-agent');
assert(role,'agent desk rendered');
assert.equal(scene.querySelector('.spatial-world')!==null,true,'spatial geometry rendered');
const all=documentWalk(scene).filter(x=>x.className==='spatial-agent');
assert.equal(all.length,6);
assert.equal(ui.getCostumes().pack,'classic','the original coworkers are the default');
const wardrobeButtons=documentWalk(costumeMount).filter(x=>x.className==='spatial-costume-choice');
assert.equal(costumeMount.hidden,false,'costume controls are visible above the 3D scene');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-costume-bar').length,0,
  'wardrobe buttons must never cover the 3D agents');
assert.equal(wardrobeButtons.length,2,'crew and selected-agent wardrobes accessible');
const beforeCostumeWork=JSON.stringify(ui.getState());
wardrobeButtons[0].listeners.click[0]({stopPropagation(){}});
assert.equal(ui.getCostumes().pack,'dragons','crew button changes all six appearances');
assert(all.every(node=>node.dataset.skin==='dragons'));
assert(all.every(node=>node.querySelector('.spatial-costume-glyph').textContent.length>0),'each fantasy character has a visible face');
ui.select('writer');
wardrobeButtons[1].listeners.click[0]({stopPropagation(){}});
assert.equal(ui.getCostume('writer').pack,'mascots','selected agent cycles independently');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.skin,'mascots');
assert.equal(all.find(x=>x.dataset.agent==='director').dataset.skin,'dragons');
assert.equal(JSON.stringify(ui.getState()),beforeCostumeWork,'costume changes cannot fabricate jobs');
assert.equal(all.find(x=>x.dataset.agent==='analyst').dataset.state,'verified','role receipts survive wardrobe changes');
for(let i=0;i<4;i++)wardrobeButtons[0].listeners.click[0]({stopPropagation(){}});
assert.equal(ui.getCostumes().pack,'classic','whole-crew cycling wraps to original');
assert(all.every(node=>node.dataset.skin==='classic'),'whole-crew change clears one-off overrides');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-plant').length,6,'six decorative plants');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-fishtank').length,1,'aquarium rendered');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-studio-shell').length,1,'one shared 3D architectural studio');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-studio-back-wall').length,1,'full shared back wall');
assert.equal(documentWalk(scene).filter(x=>x.className.includes('spatial-window')).length,2,'real studio has two window props');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-meeting-hub').length,1,'central meeting table');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-motion-disclosure').length,1,'public disclosure accompanies decorative motion');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-coffee-corner').length,1,'coffee corner rendered');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-lounge').length,1,'lounge rendered');
assert.equal(documentWalk(scene).filter(x=>x.className.includes('spatial-fish ')).length,2,'two aquarium fish');
for(const agent of all){
  const parts=documentWalk(agent);
  for(const cls of ['spatial-person-head','spatial-person-hair','spatial-person-face','spatial-eye-left','spatial-eye-right','spatial-smile','spatial-person-collar','arm-left','arm-right','leg-left','leg-right','brow-left','brow-right','cheek-left','cheek-right']){
    assert(parts.some(node=>node.className.split(' ').includes(cls)),
      agent.dataset.agent+' missing visible character feature '+cls);
  }
}
const style=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'style.css'),'utf8');
for(const cls of ['spatial-person-hair','spatial-person-face','spatial-eye-left','spatial-eye-right','spatial-smile','spatial-window','spatial-meeting-hub','spatial-person-arm','spatial-person-leg','spatial-brow','spatial-cheek']){
  assert(style.includes('.'+cls+'{'), 'missing rendered CSS for '+cls);
}
assert.equal(all.find(x=>x.dataset.agent==='analyst').dataset.state,'verified');
assert.equal(all.find(x=>x.dataset.agent==='analyst').dataset.emotion,'proud','expression follows observed verified state');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.emotion,'calm','idle character does not pretend to work');
const originalZoom=ui.getCamera().zoom;
ui.toggleRoomLevel();
assert.equal(ui.isRoomLevel(),true,'room-level observer is explicitly selected');
assert.equal(ui.getCamera().pitch,34,'low angle approaches the shared space');
ui.focusAgent('writer');
assert.equal(ui.getCamera().pitch,34,'focusing an agent preserves room-level camera');
ui.toggleRoomLevel();
assert.equal(ui.isRoomLevel(),false);
assert(ui.getCamera().pitch>=52,'exiting room view restores raised camera');
ui.focusAgent('writer');
assert(ui.getCamera().zoom>=0.98);
assert.notEqual(ui.getRenderedCamera().zoom,ui.getCamera().zoom,'focus eases instead of jumping');
advanceFrames();
assert(Math.abs(ui.getRenderedCamera().zoom-ui.getCamera().zoom)<.001,'camera converges after frames');
assert.notEqual(ui.getCamera().panX,0);
ui.tourNext();
assert(ui.getCamera().zoom>=0.98);

const keydown=viewport.listeners.keydown[0];
for(let i=0;i<30;i++)keydown({key:'+',preventDefault(){}});
assert.equal(ui.getCamera().zoom,1.42,'upper zoom bound');
for(let i=0;i<60;i++)keydown({key:'-',preventDefault(){}});
assert.equal(ui.getCamera().zoom,0.35,'lower zoom bound');
keydown({key:'q',preventDefault(){}});
assert(ui.getCamera().yaw<0);
advanceFrames();
ui.toggleFollow();
assert.equal(ui.isFollowing(),true);
ui.select('auditor');
const followFocus=ui.getCamera().panX;
ui.select('director');
assert.notEqual(ui.getCamera().panX,followFocus,'following tracks changed selected coworker');
const pointer=()=>({pointerType:'touch',target:{closest:()=>null},button:0});
const yawBeforeTouch=ui.getCamera().yaw;
viewport.listeners.pointerdown[0]({...pointer(),pointerId:11,clientX:100,clientY:120});
viewport.listeners.pointermove[0]({...pointer(),pointerId:11,clientX:145,clientY:135});
assert.notEqual(ui.getCamera().yaw,yawBeforeTouch,'touch drag rotates');
viewport.listeners.pointerdown[0]({...pointer(),pointerId:12,clientX:225,clientY:120});
viewport.listeners.pointermove[0]({...pointer(),pointerId:12,clientX:280,clientY:120});
viewport.listeners.pointermove[0]({...pointer(),pointerId:12,clientX:310,clientY:120});
assert(ui.getCamera().zoom>=.35,'pinch zoom bounded');
assert.equal(ui.isFollowing(),false,'manual pinch pan disengages follow');
viewport.listeners.pointerup[0]({pointerId:11});
viewport.listeners.pointerup[0]({pointerId:12});
ui.setEnabled(false);
assert.equal(viewport.hidden,true);
assert.equal(costumeMount.hidden,true,'costumes hidden when the scene is in 2D floorplan mode');
ui.consume({type:'stage_started',role:'writer'});
ui.consume({type:'stage_verified',role:'writer',receipt:{quality_status:'pass',result_sha256:'sha256:other'}});
ui.setEnabled(true);
assert.equal(costumeMount.hidden,false,'costumes return alongside the 3D view');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.state,'verified','2D and 3D retain state consistency');
ui.reset();
assert.equal(ui.getState().writer,'idle');
ui.consumeExecutorEvent({id:'synthetic-2',state:'running'});
assert.equal(ui.getState().writer,'running');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.activity,'working','activity is tied to a registered event');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.emotion,'focused','character focuses only on running event');
ui.consumeExecutorEvent({id:'synthetic-2',state:'verified'});
assert.equal(ui.getState().writer,'verified');
ui.consumeExecutorEvent({id:'synthetic-4',state:'failed'});
assert.equal(ui.getState().auditor,'failed');
assert.equal(all.find(x=>x.dataset.agent==='auditor').dataset.emotion,'concerned');
ui.consumeExecutorEvent({id:'synthetic-999',state:'running'});
assert.equal(Object.keys(ui.getState()).length,6);
ui.reset();
assert.equal(originalZoom,0.72);
assert.equal(ui.getState().writer,'idle');
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.activity,'waiting','no synthetic continuing work after reset');
assert.equal(ui.isRoomLevel(),false);
console.log('Work Saban CSS3D spatial office: PASS (six character faces, rooms, observer states, mode persistence and camera constraints).');

function documentWalk(node){
  return [node,...node.children.flatMap(documentWalk)];
}
