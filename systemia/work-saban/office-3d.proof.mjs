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
const doc={
  createElement:tag=>new Element(tag),
  getElementById:(id)=>id==='office-scene'?scene:id==='office-3d-toggle'?toggle:scene.querySelector('#'+id)
};
const context={document:doc,window:{innerWidth:1110},requestAnimationFrame:fn=>fn()};
const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'office-3d.js'),'utf8');
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
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-plant').length,6,'six decorative plants');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-fishtank').length,1,'aquarium rendered');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-coffee-corner').length,1,'coffee corner rendered');
assert.equal(documentWalk(scene).filter(x=>x.className==='spatial-lounge').length,1,'lounge rendered');
assert.equal(documentWalk(scene).filter(x=>x.className.includes('spatial-fish ')).length,2,'two aquarium fish');
for(const agent of all){
  const parts=documentWalk(agent);
  for(const cls of ['spatial-person-head','spatial-person-hair','spatial-person-face','spatial-eye-left','spatial-eye-right','spatial-smile']){
    assert(parts.some(node=>node.className.split(' ').includes(cls)),
      agent.dataset.agent+' missing visible character feature '+cls);
  }
}
const style=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'style.css'),'utf8');
for(const cls of ['spatial-person-hair','spatial-person-face','spatial-eye-left','spatial-eye-right','spatial-smile']){
  assert(style.includes('.'+cls+'{'), 'missing rendered CSS for '+cls);
}
assert.equal(all.find(x=>x.dataset.agent==='analyst').dataset.state,'verified');
const originalZoom=ui.getCamera().zoom;
ui.focusAgent('writer');
assert(ui.getCamera().zoom>=0.98);
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
ui.setEnabled(false);
assert.equal(viewport.hidden,true);
ui.consume({type:'stage_started',role:'writer'});
ui.consume({type:'stage_verified',role:'writer',receipt:{quality_status:'pass',result_sha256:'sha256:other'}});
ui.setEnabled(true);
assert.equal(all.find(x=>x.dataset.agent==='writer').dataset.state,'verified','2D and 3D retain state consistency');
ui.reset();
assert.equal(ui.getState().writer,'idle');
ui.consumeExecutorEvent({id:'synthetic-2',state:'running'});
assert.equal(ui.getState().writer,'running');
ui.consumeExecutorEvent({id:'synthetic-2',state:'verified'});
assert.equal(ui.getState().writer,'verified');
ui.consumeExecutorEvent({id:'synthetic-4',state:'failed'});
assert.equal(ui.getState().auditor,'failed');
ui.consumeExecutorEvent({id:'synthetic-999',state:'running'});
assert.equal(Object.keys(ui.getState()).length,6);
ui.reset();
assert.equal(originalZoom,0.72);
console.log('Work Saban CSS3D spatial office: PASS (six character faces, rooms, observer states, mode persistence and camera constraints).');

function documentWalk(node){
  return [node,...node.children.flatMap(documentWalk)];
}
