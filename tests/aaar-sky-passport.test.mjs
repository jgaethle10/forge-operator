import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page=fs.readFileSync('public/worlds/flight/index.html','utf8');
const match=page.match(/<script id="aaar-sky-passport-model">([\s\S]*?)<\/script>/);
assert.ok(match,'Sky Passport model is embedded in the owned flight page');
const world={
 enabled:true,
 landmarks:[
  {name:'Space Needle',x:100,z:0,h:180},
  {name:'Pike Place Market',x:-200,z:60,h:24},
  {name:'Seattle Great Wheel',x:-400,z:150,h:53}
 ],
 ground:()=>20
};
function harness(utcDay=11,storage) {
 const data=storage||new Map();
 const localStorage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem:(k,v)=>data.set(k,v)
 };
 const window={localStorage};
 vm.runInNewContext(match[1],{window,Date,Math,Set,Array,JSON});
 return {api:window.AAARCreateSkyPassport(world,()=>utcDay*86400000),window,data};
}
test('Passport collects a real proximity and altitude-qualified flyover only once',()=>{
 const {api}=harness(0);
 const original=api.snapshot({x:0,z:0});
 assert.equal(original.total,3);
 assert.equal(original.daily,'Space Needle');
 assert.equal(api.observe({condition:'FLYING',x:100,z:0,y:100}),null,'too low for tall tower');
 assert.equal(api.observe({condition:'GROUND_CONTACT',x:100,z:0,y:300}),null);
 assert.equal(api.observe({condition:'FLYING',paused:true,x:100,z:0,y:300}),null);
 assert.equal(api.observe({condition:'FLYING',x:1000,z:0,y:300}),null);
 assert.equal(api.observe({condition:'FLYING',x:100,z:0,y:300}),'Space Needle');
 assert.equal(api.observe({condition:'FLYING',x:100,z:0,y:300}),null);
 assert.equal(api.snapshot({x:0,z:0}).count,1);
 assert.equal(api.snapshot({x:0,z:0}).dailyComplete,true);
 assert.equal(api.snapshot({x:0,z:0}).target,'Pike Place Market');
});
test('Passport is persisted locally without requiring sign-in and rotates spotlight daily',()=>{
 const data=new Map();
 const first=harness(1,data);
 assert.equal(first.api.snapshot({x:0,z:0}).daily,'Pike Place Market');
 assert.equal(first.api.observe({condition:'FLYING',x:-200,z:60,y:120}),'Pike Place Market');
 const returnDay=harness(2,data);
 assert.equal(returnDay.api.snapshot({x:0,z:0}).count,1);
 assert.equal(returnDay.api.snapshot({x:0,z:0}).daily,'Seattle Great Wheel');
 assert.equal(returnDay.api.snapshot({x:0,z:0}).target,'Seattle Great Wheel');
 assert.equal(returnDay.api.observe({condition:'FLYING',x:-400,z:150,y:120}),'Seattle Great Wheel');
 assert.equal(returnDay.api.observe({condition:'FLYING',x:100,z:0,y:320}),'Space Needle');
 assert.equal(returnDay.api.snapshot({x:0,z:0}).complete,true);
});
test('Passport handles blocked local storage and untrusted saved names',()=>{
 const forged=new Map([['evercraft-aaar-seattle-sky-passport-v1',JSON.stringify({version:1,names:['UNTRUSTED','Space Needle']})]]);
 const {api}=harness(0,forged);
 assert.equal(api.snapshot({x:0,z:0}).count,1);
 assert.equal(api.snapshot({x:0,z:0}).target,'Pike Place Market');
 const window={get localStorage(){throw new Error('Blocked')}};
 vm.runInNewContext(match[1],{window,Date,Math,Set,Array,JSON});
 const privateMode=window.AAARCreateSkyPassport(world,()=>0);
 assert.equal(privateMode.observe({condition:'FLYING',x:100,z:0,y:300}),'Space Needle');
 assert.equal(privateMode.snapshot({x:0,z:0}).count,1);
});
test('Sky Passport uses existing Seattle world and both rendering modes, without external services',()=>{
 assert.match(page,/id="skyQuest"/);
 assert.match(page,/const skyPassport=seattle\?window\.AAARCreateSkyPassport\(seattle\):null/);
 assert.match(page,/skyPassport\.observe\(state\)/);
 assert.match(page,/skyPassport\.snapshot\(state\)/);
 assert.match(page,/Sky Passport floating marker halos/);
 assert.match(page,/for\(const l of seattle\.landmarks\)/);
 assert.match(page,/ctx\.ellipse\(p\.u,p\.v,r,r\*\.65/);
 assert.match(page,/LOCAL_BROWSER_ONLY/);
 assert.doesNotMatch(match[1],/fetch\(|XMLHttpRequest|navigator\.geolocation|WebSocket/);
});
