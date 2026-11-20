import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seededPoint,pixelRatio,frameBudgetMs,orbitPoint} from '../public/aiden-lab/universe.mjs';
import {LEARNING_WORLDS} from '../public/aiden-lab/learning-worlds.mjs';

const root=fileURLToPath(new URL('../public/aiden-lab/',import.meta.url));
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

test('living universe is a navigable learning-world map, not decorative inert buttons',()=>{
 const html=read('index.html');
 const app=read('app.mjs');
 const ids=[...html.matchAll(/class="universe-node[^"]*"[^>]*data-world-id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,7);
 assert.equal(new Set(ids).size,7);
 for(const id of ids)assert.ok(LEARNING_WORLDS.some(x=>x.id===id),id);
 assert.ok(ids.includes('watershed-lab'));
 assert.match(app,/querySelectorAll\('\.universe-node'\)/);
 assert.match(app,/selectWorld\(button\.dataset\.worldId/);
 assert.match(app,/scrollIntoView/);
 for(const id of ['universeCanvas','worldSpotlight','learningWorldGrid','showMoreTopics'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const id of ['spotlightIcon','spotlightKind','worldSpotlightTitle','spotlightDescription','spotlightStatus','spotlightEvidence','spotlightLink'])assert.match(html,new RegExp('id="'+id+'"'));
});

test('mobile visual design has real interaction affordances and accessible motion handling',()=>{
 const html=read('index.html');
 const css=read('styles.css');
 const js=read('universe.mjs');
 assert.match(html,/Explore the worlds/);
 assert.match(html,/Play Infinite Classroom/);
 assert.match(html,/No account required/);
 assert.match(css,/universe-node\[aria-pressed="true"\]/);
 assert.match(css,/learning-world-tile\[aria-pressed="true"\]/);
 assert.match(css,/@media\(max-width:510px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(js,/IntersectionObserver/);
 assert.match(js,/visibilitychange/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/cancelAnimationFrame/);
 assert.equal(frameBudgetMs,33);
 assert.equal(pixelRatio(99),1.75);
 assert.equal(pixelRatio(0),1);
 assert.deepEqual(seededPoint(2),seededPoint(2));
 assert.notDeepEqual(seededPoint(2),seededPoint(3));
 assert.ok(Math.abs(orbitPoint(0,20,10).x-20)<1e-9);
 assert.ok(Math.abs(orbitPoint(Math.PI/2,20,10).y-10)<1e-9);
 assert.ok(Math.abs(orbitPoint(Math.PI,20,10).x+20)<1e-9);
 assert.ok(Math.abs(orbitPoint(Math.PI*1.5,20,10).y+10)<1e-9);
});

test('visual layer is not fake telemetry, networked learning, or a hosted runtime',()=>{
 const js=read('universe.mjs');
 const page=read('index.html');
 const logic=read('app.mjs');
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\blocalStorage\b|\bgeolocation\b|unsafe-inline/i);
 assert.doesNotMatch(page,/firebase|base44|cdn\.|script src="https:|<iframe/i);
 assert.doesNotMatch(logic,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML\s*=/);
 assert.match(logic,/world\.url\.startsWith\('https:\/\/'\)/);
 assert.match(logic,/WORLD_STATES\[world\.state\]/);
});


test('front door offers three animated original exhibit entrances to verified owned learning worlds',()=>{
 const html=read('index.html'),css=read('styles.css'),js=read('universe.mjs');
 assert.match(html,/id="museumEntrancesHeading"/);
 assert.match(html,/class="museum-portals"/);
 const doors=[...html.matchAll(/class="museum-portal museum-portal--([a-z]+)" href="([^"]+)"/g)]
  .map(x=>({name:x[1],href:x[2]}));
 assert.deepEqual(doors,[
  {name:'physics',href:'./physics/'},
  {name:'earth',href:'./world/'},
  {name:'watershed',href:'./watershed/'}
 ]);
 for(const name of ['physics','earth','watershed']){
  assert.match(html,new RegExp('museum-portal-visual--'+name));
  assert.match(css,new RegExp('museum-portal-visual--'+name));
 }
 assert.match(html,/data-world-id="watershed-lab"/);
 assert.match(css,/\.universe-node--watershed/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/\.physics-orbit,\.physics-spark,\.earth-planet,\.water-rain,\.water-river::after\{animation:none!important\}/);
 assert.match(js,/pointerType==='touch'/);
 assert.match(js,/host\?\.addEventListener\('pointermove'/);
 assert.match(js,/host\?\.removeEventListener\('pointermove'/);
 assert.match(js,/reducedMotion.matches/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.geolocation/);
});
