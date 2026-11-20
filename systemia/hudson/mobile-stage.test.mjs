import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'public/hudson/index.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

test('HUDSON redesigned mobile stage keeps source and motion boundaries legible',()=>{
 assert.match(html,/Nothing<br><em>gets lost\.<\/em>/);
 assert.match(html,/THE EVERCRAFT KNOWLEDGE SPINE/);
 assert.match(html,/id="graph-caption"/);
 assert.match(html,/id="next-signal"/);
 assert.match(html,/id="ambient-field" aria-hidden="true"/);
 assert.match(html,/id="focus"/);
 assert.match(html,/data-kind="waiting"/);
 assert.match(html,/ANIMATED PATHS ARE NOT VERIFIED EVENTS/);
 assert.match(html,/SOURCE HISTORY · REPLAY/);
 assert.match(html,/NEW VERIFIED PUBLIC SOURCE/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/var mobileNodes=/);
 assert.match(js,/graph\.setAttribute\("viewBox",mobile\?"0 0 480 585"/);
 assert.match(js,/newSignalUntil=0;playHistory\(true\)/);
 assert.match(js,/if\(!paused\)playHistory\(\)/);
 assert.match(js,/isEvent/);
 assert.match(js,/source_verified===true/);
 assert.match(js,/window\.addEventListener\("resize",adaptGraph/);
 assert.match(html,/\.signal-card\{position:relative/);
 assert.match(html,/\.visual\{height:668px/);
});
test('mobile topology fits its own designed viewport with distinct click targets',()=>{
 const match=js.match(/var mobileNodes=(\[\[[\s\S]*?\]\]);/);
 assert.ok(match,'explicit mobile topology coordinates');
 const coords=JSON.parse(match[1]);
 assert.equal(coords.length,7);
 const unique=new Set();
 for(const [x,y] of coords){
  assert.ok(x>=60 && x<=420,'node center must remain inside lateral safe area');
  assert.ok(y>=100 && y<=475,'node center must remain inside vertical safe area');
  unique.add(x+':'+y);
 }
 assert.equal(unique.size,7,'no overlapping nodes');
 assert.deepEqual(coords[6],[240,286],'HUDSON must be central');
});
test('public source UI has no invented publication facts or third-party runtime',()=>{
 assert.match(js,/credentials:"omit"/);
 assert.match(js,/cache:"no-store"/);
 assert.match(js,/fresh\?"GIT SOURCE CURRENT"/);
 assert.match(js,/status\("waiting","SOURCE UNAVAILABLE"\)/);
 assert.doesNotMatch(html,/https?:\/\/(?:cdn|base44|tinyfish|digitalocean)\./i);
 assert.doesNotMatch(js,/Math\.random\(\).*event/);
});

test('decorative aurora can be paused and never reads private sources',()=>{
 assert.match(js,/requestAnimationFrame\(loop\)/);
 assert.match(js,/if\(!paused\)frame=requestAnimationFrame\(loop\)/);
 assert.match(js,/if\(document.hidden\)/);
 assert.match(js,/canvas\.getContext\("2d"/);
 assert.match(js,/All movement here is illustration, never source-derived data/);
 assert.doesNotMatch(js,/canvas\.toDataURL|webgl|AudioContext/);
});
