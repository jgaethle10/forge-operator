import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../public/worlds/earthworks/index.html',import.meta.url),'utf8');
function harness(width=375,height=430){
 const js=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js,'inline gameplay script exists');
 const nodes=new Map(),listeners={};
 const ctx={createLinearGradient:()=>({addColorStop(){}})};
 for(const name of ['setTransform','clearRect','save','restore','scale','translate','fillRect','beginPath','arc','fill','moveTo','lineTo','closePath','stroke','fillText','roundRect','rotate','ellipse'])ctx[name]=()=>{};
 const canvas={clientWidth:width,clientHeight:height,getContext:()=>ctx};
 const makeButton=(dataset)=>({dataset,handlers:{},classList:{add(){},remove(){}},addEventListener(name,fn){this.handlers[name]=fn},setPointerCapture(){}});
 const hold=['left','right','up','down','reach','retract','curl','uncurl','swingLeft','swingRight'].map(k=>makeButton({hold:k}));
 const actions=['dig','dump'].map(k=>makeButton({action:k}));
 const document={
  getElementById(id){if(id==='scene')return canvas;if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},setAttribute(k,v){this[k]=v},addEventListener(){}});return nodes.get(id)},
  querySelectorAll(selector){return selector==='[data-hold]'?hold:selector==='[data-action]'?actions:[]}
 };
 const window={addEventListener(name,fn){listeners[name]=fn}};
 const game=runInNewContext(js+';\n({S,reset,paint,frame,dig,dump,setMachine})',
  {document,window,performance:{now:()=>0},requestAnimationFrame(){}},{timeout:2000});
 return{game,nodes,hold,actions,listeners,canvas};
}

test('Big Dig has owned-only standalone entry and no remote dependencies',()=>{
 assert.match(source,/THE <span>BIG DIG/);
 assert.match(source,/PLAYABLE SIMULATION/);
 assert.match(source,/href="\.\.\/"/);
 assert.match(source,/apps\/earthworks-autonomy/);
 assert.doesNotMatch(source,/<script[^>]*src=/);
 assert.doesNotMatch(source,/<iframe/);
});
test('mobile and desktop canvas render in either machine mode',()=>{
 for(const [w,h] of [[375,430],[1440,600]]){
  const {game}=harness(w,h);
  assert.doesNotThrow(()=>game.paint());
  game.setMachine('backhoe');
  assert.doesNotThrow(()=>game.paint());
 }
});
test('digging, bucket capacity, dumping, mission, and reset',()=>{
 const {game,actions,nodes}=harness();
 const dig=actions[0].handlers.click,dump=actions[1].handlers.click;
 assert.equal(typeof dig,'function');
 assert.equal(typeof dump,'function');
 dig();dig();dig();dig();
 assert.equal(game.S.load,3,'bucket capacity is three');
 dump();
 assert.equal(game.S.dumped,3);
 for(let n=0;n<6;n++)dig();
 dump();
 for(let n=0;n<3;n++)dig();
 dump();
 assert.equal(game.S.done,true);
 assert.equal(game.S.dumped,9);
 assert.equal(nodes.get('progressFill').style.width,'100%');
 game.reset();
 assert.equal(game.S.dumped,0);
 assert.equal(game.S.load,0);
 assert.equal(game.S.holes.length,0);
});
test('hold-to-drive advances machine and releases safely',()=>{
 const {game,hold}=harness();
 const b=hold[1];
 b.handlers.pointerdown({preventDefault(){},pointerId:1});
 const x=game.S.x;
 game.frame(50);
 assert.ok(game.S.x>x);
 b.handlers.pointerup();
 const stopped=game.S.x;
 game.frame(100);
 assert.equal(game.S.x,stopped);
});
