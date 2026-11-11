import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const play = fs.readFileSync(new URL('../public/apps/infinite-classroom/play/index.html',import.meta.url),'utf8');
const entry = fs.readFileSync(new URL('../public/apps/infinite-classroom/index.html',import.meta.url),'utf8');
const short = fs.readFileSync(new URL('../public/infinite-classroom/index.html',import.meta.url),'utf8');
const match=play.match(/<script type="application\/json" id="quest-data">([\s\S]*?)<\/script>/);
if(!match)throw Error('quest_json_not_found');
const quests=JSON.parse(match[1]);

test('Six familiar worlds and every depth band have an original quest',()=>{
 const rooms=['math','reading','science','language','creative','calm'];
 const bands=['Foundation','Builder','Frontier'];
 assert.equal(quests.length,18);
 assert.equal(new Set(quests.map(q=>q.id)).size,18);
 for(const room of rooms){
  const items=quests.filter(q=>q.room===room);
  assert.equal(items.length,3);
  assert.deepEqual(items.map(q=>q.band),bands);
  assert.match(play,new RegExp('data-room="'+room+'"'));
  for(const q of items){
   assert.equal(q.choices.length,3);
   assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<3);
   assert(q.story.length>=35&&q.question.length>=15&&q.hint.length>=15);
   assert(q.why.length>=25);
  }
 }
});

test('An accessible, mobile welcome offers direct entry with no login',()=>{
 assert.match(play,/<meta name="viewport"/);
 assert.match(play,/aria-live="polite"/);
 assert.match(play,/aria-valuemax="18"/);
 assert.match(play,/@media\(max-width:540px\)/);
 assert.match(entry,/href="\.\/play\/"/);
 assert.match(short,/url=\.\.\/apps\/infinite-classroom\/play\//);
 assert.match(short,/Enter the classroom/);
 assert.match(play,/Math Cave/);
 assert.match(play,/Calm Meadow/);
});

test('Homework Coach provides only scaffolded help, never generates current homework answers',()=>{
 assert.match(play,/Offline study steps · generic hints/);
 assert.match(play,/You own the final answer/);
 assert.match(play,/Write your next step yourself/);
 assert.doesNotMatch(play,/Core\.InvokeLLM|https?:\/\/.*(api|base44)/i);
 // Practice answer explanations are only displayed after selecting the correct authored choice.
 assert.match(play,/if\(choice===activeQuest\.answer\)/);
 assert.match(play,/feedback\('Not quite\. Keep exploring!',activeQuest\.hint,false\)/);
});

test('No public traffic or learner data submission; only device-local star keys',()=>{
 assert.doesNotMatch(play,/\bfetch\s*\(|\bXMLHttpRequest\b|sendBeacon\s*\(|\bWebSocket\s*\(|navigator\.geolocation|window\.location\.href\s*=/);
 assert.doesNotMatch(play,/<form|<iframe|<script\s+src=/);
 assert.match(play,/localStorage\.setItem/);
 assert.match(play,/localStorage\.getItem/);
 assert.match(play,/Reset stars/);
 assert.match(play,/not saved or transmitted/);
});
