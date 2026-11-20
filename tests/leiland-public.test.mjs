import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectLeilandPulse} from '../public/leiland/pulse-bridge.mjs';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public','leiland');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Leiland public script parses as valid JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check',path.join(root,'brain.js')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
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
 assert.ok(html.includes('id="collider-state"'));
 assert.ok(html.includes('type="module" src="./brain.js"'));
 assert.ok(!/<script[^>]*src="https?:/i.test(html),'No third-party runtime scripts');
 assert.ok(!/<form\b/i.test(html),'No unauthenticated public control surface');
});

test('the renderer does not send model commands or display unsafe event markup',()=>{
 const script=read('brain.js');
 assert.ok(script.includes('textContent'),'Render untrusted event labels as plain text');
 assert.ok(script.includes('receiptLink'),'Require allowlisted public evidence links');
 assert.ok(script.includes("fetch('./feed.json"),'Use same-origin public projection');
 assert.ok(script.includes('github.com/jgaethle10/forge-operator'),'Use only public canonical code history');
 assert.ok(script.includes("fetch('../kaidance/pulse.json"),'Use existing KAIDANCE approved public pulse only');
 assert.ok(script.includes('pulseFlashUntil'),'Real observed cycle changes drive heartbeat flash');
 assert.ok(!/fetch\([^)]*['"]\/v1\/team-review/.test(script));
 assert.ok(!/innerHTML/.test(script),'No HTML injection path');
});

test('responsive and reduced-motion preferences are present',()=>{
 const style=read('style.css');
 assert.ok(style.includes('@media(max-width:700px)'));
 assert.ok(style.includes('prefers-reduced-motion:reduce'));
 assert.ok(style.includes('body.broadcast'));
});

test('Leiland only announces a fresh, source-attested existing KAIDANCE public pulse',()=>{
 const now=Date.parse('2026-11-19T23:00:00.000Z');
 const raw={
  schema:'evercraft.kaidance.public-pulse.v1',
  state:'healthy',cycle_number:8,last_completed_cycle:'2026-11-19T22:58:00.000Z',
  heartbeat_target_seconds:300,admitted_count:4,held_count:2,
  coverage_receipt_valid:true,field_attestation_verified:true,
  observed_at:'2026-11-19T22:59:00.000Z',published_at:'2026-11-19T22:59:20.000Z',
  private_injection:'topsecret',capacity_endpoint:'DO_NOT_EXPOSE'
 };
 const observed=projectLeilandPulse(raw,now);
 assert.equal(observed.state,'source_attested');
 assert.equal(observed.cycle_number,8);
 assert.equal(observed.admitted_count,4);
 assert.equal(JSON.stringify(observed).includes('topsecret'),false);
 assert.equal(JSON.stringify(observed).includes('capacity_endpoint'),false);
 assert.deepEqual(Object.keys(observed).sort(),[
  'state','cycle_number','admitted_count','held_count','observed_at','last_completed_cycle','field_attestation_verified'
 ].sort());
 assert.equal(projectLeilandPulse({...raw,field_attestation_verified:false},now).state,'unverified');
 assert.equal(projectLeilandPulse({...raw,coverage_receipt_valid:false},now).state,'unverified');
 assert.equal(projectLeilandPulse({...raw,state:'degraded'},now).state,'unverified');
 assert.equal(projectLeilandPulse(raw,now+15*60000).state,'stale');
 assert.equal(projectLeilandPulse({...raw,schema:'evercraft.private.runtime'},now).state,'not_connected');
 assert.equal(projectLeilandPulse({...raw,cycle_number:42,last_completed_cycle:null},now).state,'not_connected');
 assert.equal(projectLeilandPulse(null,now).state,'not_connected');
});
