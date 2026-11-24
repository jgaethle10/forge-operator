import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/fallen-studios/motion-study/index.html');
const landing=read('public/fallen-studios/index.html');

test('only original silent concept is shown, never as client or commercial release proof',()=>{
 assert.match(html,/Original 30-Second Motion Study/);
 assert.match(html,/not a finished video commercial/i);
 assert.match(html,/not a completed commercial/i);
 assert.match(html,/no real client work/i);
 assert.match(html,/No audio/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/Request my \$50 commercial/);
 assert.match(html,/href="\.\.\/\.\.\/commercial-studio\/#inquire"/);
 assert.doesNotMatch(html,/<video|<audio|fetch\(|buy\.stripe\.com|localStorage|sessionStorage|<form\b/i);
 assert.match(landing,/href="\.\/motion-study\//);
 assert.match(landing,/silent browser prototype/);
 assert.match(landing,/A playable public video will appear only after the master and distribution rights pass review/);
});

test('a buyer can start, pause, resume and replay the 30-second visual study, locally',()=>{
 const source=html.match(/<script>\s*([\s\S]+?)\s*<\/script>/)?.[1];
 assert.ok(source,'browser renderer exists');
 let tick=null,ms=0,requestCount=0;
 const els=new Map();
 function element(id){
   if(!els.has(id)){
     const e={style:{},dataset:{},textContent:'',handlers:{},
       addEventListener(name,fn){this.handlers[name]=fn;},
       get offsetWidth(){return 100;}};
     els.set(id,e);
   }
   return els.get(id);
 }
 vm.runInNewContext(source,{
   document:{getElementById:element},
   performance:{now:()=>ms},
   requestAnimationFrame:fn=>{tick=fn;return ++requestCount;},
   cancelAnimationFrame:()=>{tick=null;}
 },{timeout:2000});
 const button=element('play');
 assert.equal(button.textContent,'');
 assert.equal(element('stage').dataset.beat,'0');
 button.handlers.click();
 assert.match(button.textContent,/Pause/);
 assert.match(element('status').textContent,/No audio/);
 ms=13000;const nowTick=tick;nowTick(ms);
 assert.equal(element('stage').dataset.beat,'2');
 assert.match(element('big').textContent,/EVERY FRAME/);
 assert.match(element('clock').textContent,/13 \/ 00:30/);
 button.handlers.click();
 assert.match(button.textContent,/Resume/);
 ms=16000;button.handlers.click();
 assert.match(button.textContent,/Pause/);
 ms=34000;tick(ms);
 assert.match(button.textContent,/Replay/);
 assert.match(element('status').textContent,/not a completed commercial/);
 button.handlers.click();
 assert.equal(element('stage').dataset.beat,'0');
 assert.match(button.textContent,/Pause/);
});
