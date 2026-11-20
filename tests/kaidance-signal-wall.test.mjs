import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/kaidance/index.html');
const app=read('../public/kaidance/app.mjs');
const mark=read('../public/kaidance/mark.svg');
const signal=read('../public/kaidance/signal-river.mjs');
const css=read('../public/kaidance/signal-wall.css');

test('product identity is independent, usable as a favicon and repeated consistently',()=>{
 assert.match(mark,/<title id="title">Kaidance<\/title>/);
 assert.match(mark,/viewBox="0 0 128 128"/);
 assert.match(mark,/accelerator rails/);
 assert.doesNotMatch(mark,/<script|foreignObject|<image|(?:href|src)=[\"']https?:\/\//i);
 assert.notEqual(mark,read('../public/headquarters/mark.svg'));
 assert.match(html,/class="brand-symbol" src="\.\/mark\.svg"/);
 assert.match(html,/class="stage-brand" src="\.\/mark\.svg"/);
 assert.match(html,/href="\.\/mark\.svg" type="image\/svg\+xml"/);
});
test('the lower page becomes connected source-linked evidence, not fake mission telemetry',()=>{
 for(const fragment of ['id="signalRiver"','id="signalSpotlight"','id="signalIndex"','id="eventList"','id="eventLink"','id="sourceFoot"'])
  assert.ok(html.includes(fragment),fragment);
 assert.match(html,/THE PUBLIC SIGNAL RIVER/);
 assert.match(html,/flowing light is illustrative/);
 assert.match(signal,/Moving light is not a live job, mission, sensor, sale, or Collider heartbeat/);
 assert.match(signal,/document\.querySelectorAll\('#eventList \.event'\)/);
 assert.match(signal,/IntersectionObserver/);
 assert.match(signal,/ResizeObserver/);
 assert.match(signal,/prefers-reduced-motion/);
 assert.match(app,/a\.href=e\.url/);
 assert.match(app,/a\.dataset\.state=safeState/);
 assert.match(app,/publicStatus=e\.state/);
 assert.match(app,/textContent=e\.title/);
 assert.match(css,/\.event::before/);
 assert.match(css,/\.event::after/);
 assert.match(css,/\.signal-bridge/);
 assert.match(css,/\.event--running/);
 assert.match(css,/\.event--passed/);
 assert.match(css,/\.event--held/);
 assert.doesNotMatch(app,/innerHTML\s*=/);
 assert.doesNotMatch(signal,/fetch\(|WebSocket|XMLHttpRequest|EventSource|localStorage|sessionStorage|setInterval\(/);
});
test('layout and public routing stay mobile-safe with no private heartbeat snapshot committed',()=>{
 const caddy=read('../infra/evercraft-edge/kaidance/Caddyfile.route.example');
 const host=read('../systemia/leiland/owned-observatory-host.mjs');
 for(const file of ['signal-wall.css','signal-river.mjs']){
  assert.ok(caddy.includes('/kaidance/'+file),file);
  assert.ok(host.includes("'/kaidance/"+file+"'"),file);
 }
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/body\.portrait \.signal-bridge/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
 assert.equal(fs.existsSync(new URL('../public/kaidance/approval.json',import.meta.url)),false);
});
