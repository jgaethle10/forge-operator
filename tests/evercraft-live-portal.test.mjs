import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const page=await readFile(new URL('../public/live/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/live/workroom.mjs',import.meta.url),'utf8');
const source=await readFile(new URL('../public/live/work-source.mjs',import.meta.url),'utf8');

test('root LIVE entrypoint shows verified work, never the synthetic EarthWorks loop',()=>{
 assert.match(page,/<title>Evercraft LIVE \| Actual Workroom<\/title>/);
 assert.match(page,/PUBLIC ENGINEERING RECEIPTS/);
 assert.match(page,/NOT YET CHECKED/);
 assert.doesNotMatch(page,/<iframe|Quarry digital twin|SIMULATED EQUIPMENT/);
});
test('workroom truth-boundary controls and references',()=>{
 for(const id of ['id="sourceState"','id="focusWhen"','id="receipt"','id="refresh"','id="filmExit"'])assert.ok(page.includes(id));
 assert.match(script,/showHeld\(/);
 assert.match(script,/request\('\/pulls\?/);
 assert.match(script,/request\('\/actions\/runs\?/);
 assert.match(script,/request\('\/commits\?/);
 assert.match(source,/GITHUB · PUBLIC/);
 assert.doesNotMatch(page,/https?:\/\/(?:drive\.google\.com|docs\.google\.com|[^"'\s]*base44\.app)/i);
});
test('original public work and viewer source still exist without deletion',async()=>{
 for(const path of [
 'public/demos/earthworks-autonomy/index.html',
 'public/apps/earthworks-autonomy/index.html',
 'public/apps/eps-estimator/index.html',
 'public/demos/hvac-lead-recovery/index.html',
 'systemia/visual-desk/stories/washington-active-volcanoes.json'
 ]) {const s=await stat(new URL('../'+path,import.meta.url));assert.ok(s.size>1500,path)}
});
