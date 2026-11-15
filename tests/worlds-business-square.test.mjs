import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUSINESS_SQUARE_ENTRY,BUSINESS_SPOTS,BUSINESS_TOPICS,describeBusinessTopic,
  inBusinessSquare,nearbyBusinessSpot,addBusinessSquareGeometry} from '../public/worlds/business-square.mjs';
import {initialWorld,validateWorld,canWalk} from '../public/worlds/world-core.mjs';

test('Business Square stays inside the canonical Mossmere local scene, without replacing its schema',()=>{
 const initial=initialWorld();
 assert.equal(validateWorld(initial),initial);
 assert.equal(initial.agents.length,3);
 assert.equal(inBusinessSquare(BUSINESS_SQUARE_ENTRY.x,BUSINESS_SQUARE_ENTRY.z),true);
 assert.equal(canWalk(BUSINESS_SQUARE_ENTRY.x,BUSINESS_SQUARE_ENTRY.z),true);
 assert.equal(inBusinessSquare(0,8),false);
});
test('authored local stations have unique IDs, known topics and walkable public coordinates',()=>{
 const ids=new Set(BUSINESS_SPOTS.map(s=>s.id));
 assert.equal(ids.size,3);
 for(const s of BUSINESS_SPOTS){
  assert.equal(inBusinessSquare(s.x,s.z),true);
  assert.equal(canWalk(s.x,s.z),true);
  assert.equal(typeof BUSINESS_TOPICS[s.topic].message,'string');
 }
});
test('proximity is bounded, deterministic and does not return a fabricated person',()=>{
 const nearest=nearbyBusinessSpot(-10.2,9.5);
 assert.equal(nearest.id,'business-directory');
 assert.equal(nearbyBusinessSpot(-7,9.2)?.id,'business-concierge');
 assert.equal(nearbyBusinessSpot(0,8),null);
 assert.equal(nearbyBusinessSpot(NaN,9),null);
 assert.equal(nearbyBusinessSpot(-10,10,0),null);
 assert.equal(nearbyBusinessSpot(-10,10,Infinity),null);
});
test('topic descriptions explicitly disclaim real humans, agents, messaging and meetings',()=>{
 assert.match(describeBusinessTopic('overview').message,/No real people/i);
 assert.match(describeBusinessTopic('network').message,/no real profiles/i);
 assert.match(describeBusinessTopic('concierge').message,/no live agent/i);
 assert.match(describeBusinessTopic('meetings').message,/does not open calls/i);
 assert.match(describeBusinessTopic('permissions').message,/separate, revocable permission/i);
 assert.equal(describeBusinessTopic('not-a-topic'),BUSINESS_TOPICS.overview);
});
test('geometry uses existing static primitives and keeps centers within walkable world bounds',()=>{
 const calls=[];
 const trace=kind=>(...args)=>{calls.push({kind,args});};
 addBusinessSquareGeometry({box:trace('box'),ball:trace('ball'),tube:trace('tube')});
 assert.ok(calls.length>=25);
 for(const {args} of calls){
  assert.equal(Number.isFinite(args[0]),true);
  assert.equal(Number.isFinite(args[2]),true);
  assert.ok(Math.abs(args[0])<=17);
  assert.ok(Math.abs(args[2])<=17);
 }
 assert.throws(()=>addBusinessSquareGeometry(),/callbacks_required/);
});
test('single-engine integration is explicit and the contact UI remains a walkthrough',()=>{
 const app=fs.readFileSync(new URL('../public/worlds/app.mjs',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/worlds/index.html',import.meta.url),'utf8');
 assert.match(app,/addBusinessSquareGeometry\(\{box,ball,tube\}\)/);
 assert.match(app,/inBusinessSquare\(camera\.x,camera\.z\)/);
 assert.match(app,/BUSINESS_SPOTS/);
 assert.match(app,/function openBusinessPanel/);
 assert.match(html,/id="businessPanel"/);
 assert.match(html,/id="startBusiness"/);
 assert.match(html,/id="businessEnter"/);
 assert.match(html,/id="businessReturn"/);
 assert.match(html,/No real people, live agents, messages, meetings or payments/);
 assert.doesNotMatch(html,/id="businessChat"/);
});
