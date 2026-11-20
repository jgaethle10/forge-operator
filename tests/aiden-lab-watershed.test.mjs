import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const html=fs.readFileSync(path.join(ROOT,'public/aiden-lab/watershed/index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const styles=[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
const js=scripts[0]?.[1]||'';
function getHydrology(){
 const start=js.indexOf('const ELEVATIONS='),end=js.indexOf('let state=makeWatershed()',start);
 assert.ok(start>0&&end>start,'pure model must have reviewable extraction boundaries');
 // Pull only model constants and deterministic water equations, not the DOM or app.
 return vm.runInNewContext(js.slice(start,end)+
  '\n({makeWatershed,stepWatershed,simulateScenario,stores,PRESETS,ELEVATIONS});',{Math});
}
test('owned watershed lab is self-contained, clearly labeled and accessible on phones',()=>{
 assert.equal(scripts.length,1,'one audited inline controller');
 assert.equal(styles.length,1,'one audited inline stylesheet');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'watershed-lab.js'}));
 assert.ok(Buffer.byteLength(html)<300000,'must pass Fabric public asset byte cap');
 for(const id of ['landscape','hydrograph','rain','temp','forest','slope','step','play','reset',
  'zoneList','zoneInfo','balance','captureA','compareB','clearCompare','compareResult']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(html,/Water.*(Cycle|Science)|WATERSHED|Watershed Laboratory/i);
 assert.match(html,/educational simulations, not measurements/i);
 assert.match(html,/not a calibrated watershed|not a calibrated real watershed/i);
 assert.match(html,/mm\/day/);
 assert.match(html,/@media\(max-width:580px\)/);
 assert.match(html,/prefers-reduced-motion/);
 assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/href="\.\.\/world\/"/);
 assert.match(html,/href="\.\.\/physics\/"/);
 assert.match(js,/document\.hidden/);
 assert.match(js,/aria-pressed/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.geolocation|indexedDB|localStorage|sessionStorage|eval\s*\(/);
 assert.doesNotMatch(html,/<script[^>]+src=|<iframe\b|base44|firebase|google-analytics/i);
});
test('water budget conserves mass under extreme, winter, storm and drought settings',()=>{
 const {makeWatershed,stepWatershed,stores}=getHydrology();
 const params=[
  {rain:0,temp:-8,forest:0,slope:10},
  {rain:80,temp:30,forest:100,slope:1},
  {rain:60,temp:-8,forest:55,slope:8},
  {rain:45,temp:13,forest:0,slope:9},
  {rain:45,temp:13,forest:100,slope:9},
  {rain:14,temp:21,forest:65,slope:6},
  {rain:0,temp:29,forest:25,slope:5}
 ];
 for(const initial of ['temperate','winter','drought']){
  for(const p of params){
   const state=makeWatershed(initial),baseline=stores(state);
   let rainSum=0,runoffSum=0,evapSum=0;
   for(let i=0;i<40;i++){
    const day=stepWatershed(state,p);
    rainSum+=p.rain;runoffSum+=day.outflow;evapSum+=day.evaporation;
    assert.ok(Math.abs(day.residual)<1e-8,'daily mass residual '+day.residual);
    for(const cell of state.cells){
     assert.ok(cell.snow>=-1e-10&&cell.soil>=-1e-10&&cell.groundwater>=-1e-10);
     assert.ok(Number.isFinite(cell.soil+cell.snow+cell.groundwater));
    }
   }
   assert.ok(Math.abs(baseline+rainSum-runoffSum-evapSum-stores(state))<1e-7,'whole-run mass conservation');
   assert.equal(state.history.length,24,'bounded on-screen history');
  }
 }
});
test('forest cover changes modeled infiltration while matched seven-day comparison is deterministic',()=>{
 const {simulateScenario}=getHydrology();
 const controls={rain:70,temp:18,slope:8};
 const bare=simulateScenario({...controls,forest:0},'temperate',7);
 const grown=simulateScenario({...controls,forest:100},'temperate',7);
 assert.ok(grown.outflow<bare.outflow,'forest cover must reduce runoff under high precipitation in this model');
 assert.equal(simulateScenario({...controls,forest:0},'temperate',7).outflow,bare.outflow,'repeatability');
 assert.ok(Math.abs(bare.state.totalInput-490)<1e-8);
 assert.ok(grown.storage>bare.storage,'more water retained in stores in this scenario');
});
test('winter accumulation and thaw behave as explicit snow storage and melt, not live forecasts',()=>{
 const {makeWatershed,stepWatershed}=getHydrology();
 const winter=makeWatershed('winter');
 const cold=stepWatershed(winter,{rain:30,temp:-8,forest:60,slope:4});
 assert.ok(cold.precipSnow>0,'snowfall added');
 assert.equal(cold.melt,0,'no warm-temperature melt');
 const warm=stepWatershed(winter,{rain:0,temp:30,forest:60,slope:4});
 assert.ok(warm.melt>0,'warmth melts stored snow');
 assert.ok(warm.snow<cold.snow+1e-8);
 assert.ok(Math.abs(cold.residual)<1e-8&&Math.abs(warm.residual)<1e-8);
});
test('the experiment controls and scenario comparison are real parameter-driven operations',()=>{
 for(const name of ['storm','snowmelt','drought','forest'])assert.match(html,new RegExp('data-preset="'+name+'"'));
 for(const name of ['storm','snowmelt','forest'])assert.match(html,new RegExp('data-mission="'+name+'"'));
 for(const method of ['stepWatershed','simulateScenario','drawLandscape','drawHydrograph','choosePreset','compare']){
  assert.ok(js.includes('function '+method+'('),method);
 }
 assert.match(js,/const changed=\['rain','temp','forest','slope'\]/);
 assert.match(js,/simulateScenario\(next,trialA\.initial,7,elevations\)/);
 assert.match(js,/simulateScenario\(params\(\),initialCondition,7,elevations\)/);
 assert.match(js,/if\(!changed\)/);
 assert.match(js,/stop\(\);advance\(\)/);
});


test('terrain sculpting actually changes zone elevation, air temperature and snow phase',()=>{
 const {makeWatershed,stepWatershed,simulateScenario,ELEVATIONS}=getHydrology();
 const low=makeWatershed('temperate');
 const heights=[2700,2100,1500,650,250];
 const high=makeWatershed('temperate',heights);
 assert.equal(high.cells[0].elevation,2700);
 assert.equal(low.cells[0].elevation,1750);
 const inputs={rain:30,temp:8,forest:65,slope:5};
 const a=stepWatershed(low,inputs),b=stepWatershed(high,inputs);
 assert.ok(b.precipSnow>a.precipSnow,'raised ridges must create more snowfall for this fixed valley temperature');
 assert.ok(Math.abs(a.residual)<1e-9&&Math.abs(b.residual)<1e-9,'water budget remains closed');
 const original=simulateScenario(inputs,'temperate',7,ELEVATIONS);
 const changed=simulateScenario(inputs,'temperate',7,heights);
 assert.notEqual(changed.outflow,original.outflow,'elevation must alter modeled river response, not only the illustration');
 assert.equal(simulateScenario(inputs,'temperate',7,heights).outflow,changed.outflow,'sculpted terrain must be reproducible');
});
test('terrain interaction supports touch, accessible buttons, bounded relief and proper trial alignment',()=>{
 for(const id of ['sculptMode','lowerZone','raiseZone','restoreMountains','selectedElevation']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 for(const fragment of ['function elevationBounds(i)','function sculptElevation(i,m)',
  'function restoreMountains()','function zoneFromPointer(e)',
  "canvas.addEventListener('pointerdown'","canvas.addEventListener('pointermove'",
  "canvas.setPointerCapture(e.pointerId)","canvas.releasePointerCapture(e.pointerId)",
  'state.cells[i].elevation=next','terrainDrag','elevations:[...elevations]',
  "canvas.dataset.sculpt=String(sculpting)","cancelAnimationFrame(frame)"]){
  assert.ok(js.includes(fragment),fragment);
 }
 assert.match(html,/#landscape\[data-sculpt=true\]\{touch-action:none/);
 assert.match(js,/elevations\.some\(\(h,i\)=>h!==trialA\.elevations\[i\]\)/);
 assert.match(js,/const b=simulateScenario\(next,trialA\.initial,7,elevations\)/);
 assert.match(js,/function makeWatershed\(initial='temperate',mountains=ELEVATIONS\)/);
 assert.match(js,/const cells=mountains\.map/);
 assert.match(html,/Reset water stores/);
 assert.match(html,/Restore ridges/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.geolocation|localStorage/);
});
