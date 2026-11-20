import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public','leiland');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Leiland public script parses as valid JavaScript',()=>{
 assert.doesNotThrow(()=>new vm.Script(read('brain.js'),{filename:'brain.js'}));
});

test('default public feed is disconnected and never invents inference',()=>{
 const feed=JSON.parse(read('feed.json'));
 assert.equal(feed.schema,'evercraft.leiland.public-feed.v1');
 assert.equal(feed.published_at,null);
 assert.equal(feed.status,'not_connected');
 assert.deepEqual(feed.events,[]);
 assert.equal(feed.signals.inference.state,'unverified');
 assert.equal(feed.signals.missions.state,'unverified');
});

test('the first screen labels abstract motion and private boundaries',()=>{
 const html=read('index.html');
 for(const text of ['CONCEPTUAL ANIMATION','NOT MODEL ACTIVATIONS','Public activity feed not connected','Unverified','Broadcast mode','Raven Nexus','Passport','Systemia','Saban','Compute']){
  assert.ok(html.includes(text),'Missing public clarity: '+text);
 }
 assert.ok(html.includes('aria-label='));
 assert.ok(html.includes('aria-pressed='));
 assert.ok(!/<script[^>]*src="https?:/i.test(html),'No third-party runtime scripts');
 assert.ok(!/<form\b/i.test(html),'No unauthenticated public control surface');
});

test('the renderer does not send model commands or display unsafe event markup',()=>{
 const script=read('brain.js');
 assert.ok(script.includes('textContent'),'Render untrusted event labels as plain text');
 assert.ok(script.includes('receiptLink'),'Require allowlisted public evidence links');
 assert.ok(script.includes("fetch('./feed.json"),'Use same-origin public projection');
 assert.ok(script.includes('github.com/jgaethle10/forge-operator'),'Use only public canonical code history');
 assert.ok(!/fetch\([^)]*['"]\/v1\/team-review/.test(script));
 assert.ok(!/innerHTML/.test(script),'No HTML injection path');
});

test('responsive and reduced-motion preferences are present',()=>{
 const style=read('style.css');
 assert.ok(style.includes('@media(max-width:700px)'));
 assert.ok(style.includes('prefers-reduced-motion:reduce'));
 assert.ok(style.includes('body.broadcast'));
});
