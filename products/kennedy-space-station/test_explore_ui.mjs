// The Discovery World is self-contained. Exercise its real inline controller
// against a deterministic local canvas/DOM shim without network or packages.
// This checks interactions and runtime exceptions, not visual artistry.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./public/explore.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.equal(scripts.length,1);
new vm.Script(scripts[0]);
const ev=new Map();
const classList=()=>({add(){},remove(){},toggle(){},contains(){return false}});
const elements=new Map();
function element(id){
 if(elements.has(id))return elements.get(id);
 const obj={id,attributes:{},classList:classList(),textContent:'',value:'',dataset:{},
   setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},
   addEventListener(name,fn){ev.set(id+':'+name,fn)},
   getBoundingClientRect(){return {width:390,height:520}},
   append(){},remove(){},click(){},setPointerCapture(){},
   getContext(){return canvasCtx},toDataURL(){return 'data:image/png;base64,AA=='},
 };
 elements.set(id,obj);return obj;
}
const grad={addColorStop(){}};
const canvasCtx=new Proxy({},{
  get(target,key){if(key in target)return target[key];
    if(key==='createRadialGradient'||key==='createLinearGradient')return ()=>grad;
    return ()=>{}},
  set(target,key,value){target[key]=value;return true}
});
const document={
 getElementById:element,
 addEventListener(name,cb){ev.set('document:'+name,cb)},
 createElement(name){return {name,href:'',download:'',click(){},remove(){}}},
 body:{append(){}}
};
const window={
 matchMedia(){return {matches:true}},
 addEventListener(name,cb){ev.set('window:'+name,cb)}
};
const context={window,document,devicePixelRatio:2,matchMedia:window.matchMedia,
 requestAnimationFrame:()=>{},console,Math,Image:function(){},
};
vm.runInNewContext(scripts[0],context,{timeout:7000});
function click(id){const cb=ev.get(id+':click');assert(cb,'missing action '+id);cb()}
function get(id){return element(id).textContent}
assert.equal(get('chargers'),'4');assert.equal(get('trees'),'17');assert.equal(get('solar'),'12');
assert.match(get('scene-mode'),/DAYLIGHT/);
click('add-charger');assert.equal(get('chargers'),'5');
click('add-tree');assert.equal(get('trees'),'18');
click('add-solar');assert.equal(get('solar'),'13');
assert.match(get('story'),/Solar panel/);
click('night');assert.match(get('scene-mode'),/NIGHT LIGHTS/);
click('plans');assert.match(get('scene-mode'),/BLUEPRINT/);
click('day');assert.match(get('scene-mode'),/DAYLIGHT/);
click('zoom-in');assert.equal(get('zoom-value'),'112%');
click('zoom-out');assert.equal(get('zoom-value'),'100%');
click('orbit');assert.match(get('story'),/camera|Orbit/i);
click('tour');assert.match(get('story'),/Kennedy|fresh angle/i);
click('snapshot');
assert.match(get('status'),/Snapshot generated/);
click('reset');
assert.equal(get('chargers'),'4');assert.equal(get('trees'),'17');assert.equal(get('solar'),'12');
assert.match(get('scene-mode'),/DAYLIGHT/);
const down=ev.get('world:pointerdown'),move=ev.get('world:pointermove'),up=ev.get('world:pointerup');
assert(down&&move&&up);
down({pointerId:1,clientX:100,clientY:170});
move({pointerId:1,clientX:140,clientY:178});
up({pointerId:1});
const key=ev.get('world:keydown');assert(key);key({key:'ArrowLeft',preventDefault(){}});
const wheel=ev.get('world:wheel');assert(wheel);wheel({deltaY:-90,preventDefault(){}});
assert.match(get('zoom-value'),/%$/);
assert(!/(?:fetch\(|XMLHttpRequest|WebSocket|\/api\/|https?:\/\/|localStorage|sessionStorage|document\.cookie)/.test(scripts[0]));
console.log('PASS: standalone Explorer parses, boots, renders, handles touch/camera, day/night, blueprint, build actions, reset and snapshot');
