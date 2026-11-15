import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Evercraft contact page is email-only and no outside form action runs',()=>{
 const html=read('public/contact/index.html');
 assert.match(html,/mailto:jessegaethle10@gmail\.com\?subject=Evercraft%20business%20inquiry/);
 for(const subject of ['EPS%20quote%20request','Evercraft%20commercial%20technology%20inquiry','Evercraft%20partner%20or%20project%20inquiry']) assert.ok(html.includes(subject));
 assert.match(html,/Phone calls and text messages are temporarily unavailable/);
 assert.doesNotMatch(html,/HAVENLY|havenlycleaning/i);
 assert.match(html,/press Send to submit your inquiry/i);
 assert.doesNotMatch(html,/(?:href=["'](?:tel:|sms:))|509[-. ()]*759[-. ]*0440|509[-. ()]*910[-. ]*3256/i);
 assert.doesNotMatch(html,/<form|<script[^>]+src=/i);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Script(scripts[0][1]));
 assert.doesNotMatch(scripts[0][1],/\bfetch\(|sendBeacon|XMLHttpRequest/);
});
test('Evercraft public customer routes can reach independent email-first hub',()=>{
 const trial=read('public/try/index.html');
 const mesh=read('public/mesh/index.html');
 assert.match(trial,/href="\.\.\/contact\/"/);
 assert.match(trial,/Email Evercraft/);
 assert.match(trial,/mailto:jessegaethle10@gmail\.com/);
 assert.match(mesh,/href="\.\.\/contact\/"/);
 assert.match(mesh,/mailto:jessegaethle10@gmail\.com/);
});
