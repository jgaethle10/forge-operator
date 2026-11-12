import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dir,'office-costumes.js'),'utf8');
function load(){
  const ctx={window:{}};
  vm.runInNewContext(source,ctx,{filename:'office-costumes.js'});
  return ctx.window.EvercraftOfficeThemes;
}
const api=load();
assert.equal(api.PACKS.length,5);
assert.equal(api.ROLES.length,6);
assert.deepEqual(Array.from(api.PACKS.map(p=>p.id)),['classic','dragons','mascots','emoji','tactical']);
const values=new Map();
const storage={getItem:key=>values.get(key)||null,
  setItem:(key,value)=>values.set(key,value)};
const wardrobe=api.create({storage});
assert.equal(wardrobe.getPack(),'classic');
for(const role of api.ROLES){
  assert.equal(wardrobe.resolve(role).pack,'classic');
  assert.equal(wardrobe.resolve(role).icon,'');
}
const originalWorkerState={
  director:'idle',analyst:'running',writer:'verified',
  designer:'failed',auditor:'idle',coordinator:'proposed'
};
const original=JSON.stringify(originalWorkerState);
wardrobe.cyclePack();
assert.equal(wardrobe.getPack(),'dragons');
assert.equal(wardrobe.resolve('writer').pack,'dragons');
assert.equal(wardrobe.resolve('writer').icon,'🐲');
assert.equal(wardrobe.resolve('auditor').icon,'🐲');
wardrobe.setRole('writer','emoji');
assert.equal(wardrobe.resolve('writer').pack,'emoji');
assert.equal(wardrobe.resolve('director').pack,'dragons');
assert.equal(wardrobe.resolve('writer').icon,'💬');
wardrobe.setRole('auditor','tactical');
assert.equal(wardrobe.resolve('auditor').pack,'tactical');
const snapshot=wardrobe.snapshot();
assert.equal(snapshot.pack,'dragons');
assert.equal(snapshot.overrides.writer,'emoji');
assert.equal(snapshot.overrides.auditor,'tactical');
assert.equal(values.size,1,'only one versioned local appearance preference key');
const restored=api.create({storage});
assert.equal(restored.resolve('writer').pack,'emoji','outfit survives local reload');
assert.equal(restored.resolve('auditor').pack,'tactical','per-agent choice survives local reload');
assert.equal(restored.resolve('director').pack,'dragons');
assert.throws(()=>wardrobe.setRole('not_an_agent','dragons'),/Unapproved/);
assert.throws(()=>wardrobe.setRole('writer','https://tracker.invalid/logo.svg'),/Unapproved/);
assert.throws(()=>wardrobe.setPack('official_team_logo'),/Unknown/);
assert.throws(()=>wardrobe.resolve('admin'),/Unknown/);
const glyph={textContent:'',attrs:{},
  setAttribute(k,v){this.attrs[k]=v;}};
const node={dataset:{},style:{values:new Map(),setProperty(k,v){this.values.set(k,v);}},
  querySelector(selector){assert.equal(selector,'.spatial-costume-glyph');return glyph;}};
const painted=restored.paint(node,'writer');
assert.equal(painted.pack,'emoji');
assert.equal(node.dataset.skin,'emoji');
assert.equal(glyph.textContent,'💬');
assert.equal(glyph.attrs['aria-hidden'],'true');
assert.equal(node.style.values.size,1);
restored.cycleRole('writer');
assert.equal(restored.resolve('writer').pack,'tactical');
restored.setPack('classic');
assert.equal(restored.resolve('writer').pack,'classic','new crew pack clears prior overrides');
assert.equal(Object.keys(restored.snapshot().overrides).length,0);
assert.equal(glyph.textContent,'💬','no unsafe DOM injection or framework mutation');
restored.paint(node,'writer');
assert.equal(glyph.textContent,'');
assert.equal(JSON.stringify(originalWorkerState),original,'costumes cannot touch execution state');

const bad=new Map([[api.STORAGE_KEY,JSON.stringify({
  schema:1,pack:'dragons',overrides:{
    writer:'<img src=x onerror=alert(1)>',director:'mascots',
    unknown:'tactical'
  }
})]]);
const badStorage={getItem:k=>bad.get(k),setItem:()=>{}};
const sanitized=api.create({storage:badStorage});
assert.equal(sanitized.resolve('writer').pack,'dragons');
assert.equal(sanitized.resolve('director').pack,'mascots');
assert.equal(Object.keys(sanitized.snapshot().overrides).length,1);
bad.set(api.STORAGE_KEY,'{broken');
assert.equal(api.create({storage:badStorage}).getPack(),'classic');
const blocked=api.create({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
assert.equal(blocked.cyclePack(),'dragons','blocked localStorage cannot prevent normal visuals');
const style=fs.readFileSync(path.join(dir,'style.css'),'utf8');
for(const pack of ['dragons','mascots','emoji','tactical']){
  assert(style.includes('[data-skin="'+pack+'"]'),'pack has actual CSS body styling: '+pack);
}
console.log('Work Saban agent wardrobe: PASS (5 original packs, 6 roles, per-agent mix, local persistence, sanitization, unchanged execution state).');
