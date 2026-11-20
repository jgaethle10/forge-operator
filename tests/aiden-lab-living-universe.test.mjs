import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seededPoint,pixelRatio,frameBudgetMs} from '../public/aiden-lab/universe.mjs';
import {LEARNING_WORLDS} from '../public/aiden-lab/learning-worlds.mjs';

const root=fileURLToPath(new URL('../public/aiden-lab/',import.meta.url));
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

test('living universe is a navigable learning-world map, not decorative inert buttons',()=>{
 const html=read('index.html');
 const app=read('app.mjs');
 const ids=[...html.matchAll(/class="universe-node[^"]*"[^>]*data-world-id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,6);
 assert.equal(new Set(ids).size,6);
 for(const id of ids)assert.ok(LEARNING_WORLDS.some(x=>x.id===id),id);
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
