import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/kaidance/index.html');
const app=read('../public/kaidance/app.mjs');
const theater=read('../public/kaidance/visual.mjs');
const styles=read('../public/kaidance/experience.css');
test('the first screen shows an actual source-linked activity window, not a buried feed',()=>{
 const hero=html.indexOf('WATCH THE'),scene=html.indexOf('id="visualField"');
 const featured=html.indexOf('id="heroEventTitle"'),later=html.indexOf('class="record"');
 const liveBtn=html.indexOf('id="portraitBtn"'),main=html.indexOf('<main id="main">');
 assert.ok(hero>0&&scene>hero&&featured>scene&&later>featured);
 assert.ok(liveBtn>0&&liveBtn<main,'9:16 entry must be visible in the first header');
 assert.match(html,/id="heroEventLink" hidden/);
 assert.match(html,/NOW IN THE PUBLIC BUILD LOG/);
 assert.match(app,/\$\('heroEventTitle'\)\.textContent=e\.title/);
 assert.match(app,/\$\('heroEventLink'\)\.href=e\.url/);
 assert.match(app,/normalizePublicActivity/);
});
test('film mode is one tap, self-contained and linkable without altering source state',()=>{
 assert.match(html,/id="portraitBtn"/);
 assert.match(app,/function setBroadcastView\(active\)/);
 assert.match(app,/new URLSearchParams\(window\.location\.search\)\.get\('view'\)==='live'/);
 assert.match(styles,/body\.portrait .*\.portrait-proof/);
 assert.match(styles,/100dvh/);
 assert.match(styles,/env\(safe-area-inset-top/);
 assert.match(app,/function refreshPulse/);
});
test('cinematic motion is explicitly decorative, while heartbeat requires a fresh verified increment',()=>{
 assert.match(html,/ANIMATED NETWORK ART · NOT AGENT TELEMETRY/);
 assert.match(html,/HEARTBEAT NOT CONNECTED/);
 assert.match(html,/NO SOURCE TIMESTAMP/);
 assert.match(theater,/Ambient art only/);
 assert.doesNotMatch(theater,/fetch\(|XMLHttpRequest|localStorage|WebSocket|EventSource/);
 assert.match(app,/assessed\.cycle_number>state\.cycleSeen&&assessed\.verified\)triggerBeat/);
 assert.match(app,/sourceFresh/);
 assert.doesNotMatch(app,/innerHTML\s*=/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
});
test('owned Leiland host and Caddy static route explicitly serve newly-required artwork files',()=>{
 const leiland=read('../systemia/leiland/owned-observatory-host.mjs');
 const caddy=read('../infra/evercraft-edge/kaidance/Caddyfile.route.example');
 for(const file of ['experience.css','visual.mjs']){
  assert.match(html,new RegExp(file.replace('.','\\.')));
  assert.ok(leiland.includes("'/kaidance/"+file+"'"),file);
  assert.ok(caddy.includes('/kaidance/'+file),file);
 }
});


test('the Collider is a dimensional accelerator rather than a flat brand orbit',()=>{
 const engine=read('../public/kaidance/collider-engine.mjs');
 const css=read('../public/kaidance/collider-v3.css');
 assert.match(html,/id="colliderField"/);
 assert.match(html,/src="\.\/collider-engine\.mjs"/);
 assert.match(html,/href="\.\/collider-v3\.css"/);
 assert.match(engine,/AMBIENT ART/);
 assert.match(engine,/function torus\(/);
 assert.match(engine,/function magneticRing\(/);
 assert.match(engine,/function particleBeams\(/);
 assert.match(engine,/function interactionChamber\(/);
 assert.match(engine,/function plasmaStorm\(/);
 assert.match(engine,/plasmaStorm\(t\);interactionChamber\(t,flash\)/);
 assert.match(engine,/function structuralAccents\(/);
 assert.match(engine,/MutationObserver/);
 assert.match(engine,/verifiedMarker\.classList\.contains\('beat'\)/);
 assert.match(engine,/prefers-reduced-motion/);
 assert.match(engine,/IntersectionObserver/);
 assert.match(css,/#colliderField/);
 assert.doesNotMatch(engine,/fetch\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|\.setInterval\(/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
});


test('V04 centers a flowing, explorable field rather than a lone glowing ring',()=>{
 const field=read('../public/kaidance/current-field.mjs');
 const css=read('../public/kaidance/confluence.css');
 assert.match(html,/id="currentField"/);
 assert.match(html,/id="fieldExplore"/);
 assert.match(html,/id="fieldPause"/);
 assert.match(html,/id="fieldMode"/);
 assert.match(html,/id="fieldDrawer"/);
 assert.match(html,/src="\.\/current-field\.mjs"/);
 assert.match(html,/href="\.\/confluence\.css"/);
 for(const word of ['KAIDANCE','HUDSON','SYSTEMIA','DISCOVERY','RAVEN NEXUS','WORK SABAN','EVIDENCE'])
  assert.ok(field.includes(word),word+' confluence missing');
 assert.match(field,/function currents\(/);
 assert.match(field,/function voyager\(/);
 assert.match(field,/function selection\(/);
 assert.match(field,/function mode\(/);
 assert.match(field,/function collisions\(/);
 assert.match(field,/verifiedMarker|marker\.classList\.contains\('beat'\)/);
 assert.match(field,/marker\.classList\.contains\('beat'\)/);
 assert.match(field,/kaidance:public-record/);
 assert.match(field,/prefers-reduced-motion/);
 assert.doesNotMatch(field,/fetch\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|\.setInterval\(/);
 assert.match(css,/height:calc\(100dvh - 76px\)/);
 assert.match(css,/#currentField/);
 assert.match(css,/body\.reactor #colliderField/);
 assert.match(css,/body\.portrait \.field-story/);
 assert.match(app,/new CustomEvent\('kaidance:public-record'/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
});


test('V05 story follows the traveler and reserves true heartbeat celebration for verified data',()=>{
 const field=read('../public/kaidance/current-field.mjs');
 const chapters=read('../public/kaidance/field-chapters.mjs');
 const css=read('../public/kaidance/confluence.css');
 for(const id of ['fieldRouteFrom','fieldRouteTo','fieldRouteProgress','fieldRecordTopic']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing from screen');
 }
 assert.match(field,/from '\.\/field-chapters\.mjs'/);
 assert.match(field,/function syncStory\(/);
 assert.match(field,/chapter\.ordinal!==lastNarratedOrdinal/);
 assert.match(field,/storyTitle\.textContent=chapter\.title/);
 assert.match(field,/function arrivalBloom\(chapter\)/);
 assert.match(field,/arrivalBloom\(chapter\);collisions\(\)/);
 assert.match(field,/Not a live mission|ILLUSTRATIVE/);
 assert.match(field,/recordFocus=found\[1\]/);
 assert.doesNotMatch(field,/if\(found\)selection\(/);
 assert.match(chapters,/SCENIC_LEG_SECONDS=10\.5/);
 assert.match(chapters,/kind:'ILLUSTRATED JOURNEY'/);
 assert.match(css,/\.field-route-track/);
 assert.match(css,/\.field-record-topic\[hidden\]/);
 assert.doesNotMatch(field,/fetch\(|WebSocket|EventSource|localStorage|sessionStorage/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
});


test('V08 puts only compact route instruments over scenery and narrative below the field',()=>{
 const css=read('../public/kaidance/confluence.css');
 const compact=html.indexOf('class="field-story"');
 const below=html.indexOf('class="journey-details"');
 const telemetry=html.indexOf('class="telemetry"');
 const stageEnd=html.indexOf('</article>',compact);
 assert.ok(compact>0 && stageEnd>compact && below>stageEnd && telemetry>below);
 const field=html.slice(compact,html.indexOf('class="field-drawer"',compact));
 assert.ok(!field.includes('id="fieldStoryMeta"'),'Long narration must not overlay the network');
 assert.ok(!field.includes('id="fieldRecordTopic"'),'Public topic belongs outside the visual path');
 assert.ok(field.includes('id="fieldRouteProgress"'));
 assert.ok(field.includes('id="fieldStoryKind"'));
 assert.ok(field.includes('id="fieldStoryTitle"'));
 assert.ok(html.slice(below,telemetry).includes('id="fieldStoryMeta"'));
 assert.ok(html.slice(below,telemetry).includes('id="fieldRecordTopic"'));
 assert.match(css,/KAIDANCE V08 \/ Clear the scenery/);
 assert.match(css,/\.field-story\s*\{[\s\S]*?grid-template-columns/);
 assert.match(css,/\.field-story\s*\{[\s\S]*?pointer-events:none/);
 assert.match(css,/body\.portrait \.journey-details\{display:none!important\}/);
 assert.match(css,/body\.portrait \.field-story/);
});
