import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,GOAL_TRACKS,GOAL_THRESHOLD,SOCIAL_COOLDOWN_TICKS,makeHouse,validateHouse,advanceHouse,placeFurniture,removeFurniture,gift,party,clock} from '../public/living-worlds/house-core.mjs';

test('new house has bounded furniture and four unique residents',()=>{
 const s=makeHouse();
 assert.equal(s.schema,SCHEMA);
 assert.equal(s.actors.length,4);
 assert.equal(new Set(s.actors.map(a=>a.id)).size,4);
 assert.ok(validateHouse(s));
 assert.equal(clock(s),'08:00');
});
test('same seed and same ticks produce identical resident decisions, locations, memories and events',()=>{
 const a=makeHouse(818),b=makeHouse(818);
 for(let i=0;i<120;i++){advanceHouse(a);advanceHouse(b);}
 assert.deepEqual(a,b);
 assert.equal(a.day,2);
 assert.ok(a.events.length>0);
 assert.ok(a.actors.some(r=>r.memories.length>0));
 assert.ok(a.actors.some(r=>r.coins>15));
 assert.ok(validateHouse(a));
});
test('design commands change available furniture, reject duplicates and out-of-bounds edits',()=>{
 const s=makeHouse();
 assert.equal(placeFurniture(s,'plant',8,5),true);
 assert.equal(placeFurniture(s,'bed',8,5),false);
 assert.equal(placeFurniture(s,'potato',2,2),false);
 assert.equal(placeFurniture(s,'bed',9,2),false);
 assert.equal(removeFurniture(s,8,5),true);
 assert.equal(removeFurniture(s,8,5),false);
 assert.ok(validateHouse(s));
});
test('resident decisions adapt when all existing furniture disappears',()=>{
 const s=makeHouse();
 for(const f of [...s.furniture]) assert.equal(removeFurniture(s,f.x,f.y),true);
 for(let i=0;i<15;i++)advanceHouse(s);
 assert.ok(s.actors.every(a=>a.target===null));
 assert.ok(s.actors.every(a=>a.action==='Looking for something to do'));
 assert.ok(validateHouse(s));
});
test('spectator gifts and parties have visible effects without real-world side effects',()=>{
 const s=makeHouse(),a=s.actors[0];
 const before=a.coins,oldSocial=a.social;
 assert.equal(gift(s,'unknown'),false);
 assert.equal(gift(s,a.id),true);
 assert.equal(a.coins,before+5);
 party(s);
 assert.ok(a.social>oldSocial);
 assert.ok(s.events.some(e=>e.type==='intervention'));
 assert.ok(validateHouse(s));
});
test('tampered snapshots fail closed',()=>{
 const s=makeHouse();
 assert.equal(validateHouse({...s,schema:'made-up'}),false);
 assert.equal(validateHouse({...s,actors:[]}),false);
 assert.equal(validateHouse({...s,furniture:[...s.furniture,{id:'bad',kind:'bed',x:900,y:0}]}),false);
 assert.equal(validateHouse({...s,furniture:[...s.furniture,{id:'bad',kind:'bed',x:1,y:1}]}),false);
 assert.equal(validateHouse({...s,actors:s.actors.map((a,i)=>i===0?{...a,hunger:Infinity}:a)}),false);
});

test('four distinct resident dream arcs accumulate milestones and survive long deterministic runs',()=>{
  const a=makeHouse(818),b=makeHouse(818);
  const signatures=a.actors.map(r=>r.goal.id);
  assert.equal(new Set(signatures).size,4);
  assert.ok(a.actors.every(r=>r.goal.phase===0&&r.goal.completed===0));
  let observedMilestone=false;
  for(let tick=0;tick<600;tick++){
    advanceHouse(a);advanceHouse(b);
    if(a.events[0]?.type==='milestone')observedMilestone=true;
  }
  assert.deepEqual(a,b);
  assert.ok(validateHouse(a));
  assert.ok(a.actors.some(r=>r.goal.completed>0));
  assert.ok(a.actors.every(r=>r.goal.highlights.length<=6));
  assert.ok(a.actors.every(r=>r.goal.progress<GOAL_THRESHOLD));
  assert.ok(a.actors.every(r=>r.goal.phase<GOAL_TRACKS[r.id].phases.length));
  assert.equal(observedMilestone,true,'At least one milestone must occur during the long timeline');
  assert.ok(a.actors.every(r=>r.goal.highlights.some(h=>h.includes(r.name+' achieved:'))));
});
test('old House v1 saves migrate only on a simulation tick and retain resident identity',()=>{
  const original=makeHouse(219);
  for(const actor of original.actors)delete actor.goal;
  assert.equal(validateHouse(original),true);
  const saved=JSON.parse(JSON.stringify(original));
  advanceHouse(saved);
  assert.ok(validateHouse(saved));
  assert.ok(saved.actors.every(r=>r.goal.id===GOAL_TRACKS[r.id].id));
  assert.deepEqual(saved.actors.map(r=>r.id),original.actors.map(r=>r.id));
  assert.equal(original.actors.every(r=>r.goal===undefined),true);
});
test('invalid or forged goal progress and oversized milestone history fail closed',()=>{
  const house=makeHouse();
  const tamper=x=>({...house,actors:house.actors.map((a,i)=>i===0?{...a,goal:x}:a)});
  assert.equal(validateHouse(tamper({...house.actors[0].goal,id:'made-up'})),false);
  assert.equal(validateHouse(tamper({...house.actors[0].goal,progress:999})),false);
  assert.equal(validateHouse(tamper({...house.actors[0].goal,phase:-1})),false);
  assert.equal(validateHouse(tamper({...house.actors[0].goal,completed:Infinity})),false);
  assert.equal(validateHouse(tamper({...house.actors[0].goal,highlights:Array(7).fill('fake')})),false);
});

test('nearby residents start an actual mutual social scene that changes both relationships',()=>{
 const s=makeHouse(700),a=s.actors[0],b=s.actors[1];
 a.x=4;a.y=2;b.x=4;b.y=3;a.target=b.target='f1';
 for(const other of s.actors.slice(2)){other.x=8;other.y=5;other.lastSocialTick=1;}
 const before=[a.bonds[b.id],b.bonds[a.id],a.social,b.social];
 advanceHouse(s);
 const social=s.events.find(e=>e.type==='social_scene'||e.type==='support');
 assert.ok(social,'close neighbors should generate a social or support encounter');
 assert.match(social.description,/Mara and Ivo/);
 assert.equal(a.lastSocialTick,1);assert.equal(b.lastSocialTick,1);
 assert.ok(a.bonds[b.id]>before[0]&&b.bonds[a.id]>before[1]);
 assert.ok(a.social>before[2]-2&&b.social>before[3]-2);
 assert.ok(a.memories.includes(social.description));
 assert.ok(b.memories.includes(social.description));
 assert.ok(validateHouse(s));
});
test('social interactions have deterministic cooldown, capped memories, and replay-stable bond changes',()=>{
 const s=makeHouse(700),a=s.actors[0],b=s.actors[1];
 a.x=b.x=4;a.y=b.y=2;a.target=b.target='f1';
 for(const other of s.actors.slice(2)){other.x=8;other.y=5;other.lastSocialTick=1;}
 advanceHouse(s);
 const first=s.events.find(e=>e.type==='social_scene'||e.type==='support');
 assert.ok(first);
 const firstBond=a.bonds[b.id];
 for(let n=1;n<SOCIAL_COOLDOWN_TICKS;n++){
   a.x=b.x=4;a.y=b.y=2;
   advanceHouse(s);
 }
 assert.equal(a.bonds[b.id],firstBond,'cooldown should prevent repeated immediate scenes');
 a.x=b.x=4;a.y=b.y=2;advanceHouse(s);
 assert.ok(a.bonds[b.id]>firstBond,'pair can reconnect after cooldown');
 assert.ok(s.actors.every(r=>r.memories.length<=10));
 assert.ok(validateHouse(s));
});
test('legacy resident state migrates social fields only on a real tick, and future cooldowns fail validation',()=>{
 const s=makeHouse();
 for(const a of s.actors)delete a.lastSocialTick;
 assert.equal(validateHouse(s),true);
 advanceHouse(s);
 assert.ok(s.actors.every(a=>Number.isInteger(a.lastSocialTick)));
 assert.ok(validateHouse(s));
 const wrong=structuredClone(s);
 wrong.actors[0].lastSocialTick=s.tick+500;
 assert.equal(validateHouse(wrong),false);
});

test('a resident in need receives reciprocal support and remembers the encounter',()=>{
 const s=makeHouse(71),a=s.actors[0],b=s.actors[1];
 a.x=4;a.y=2;b.x=4;b.y=3;a.target=b.target='f1';
 a.energy=23;b.energy=30;
 for(const other of s.actors.slice(2))other.lastSocialTick=1;
 advanceHouse(s);
 const moment=s.events.find(e=>e.type==='support');
 assert.ok(moment,'low-energy neighbors should offer one another support');
 assert.match(moment.description,/Mara and Ivo checked in/);
 assert.equal(a.bonds.ivo,55);assert.equal(b.bonds.mara,55);
 assert.ok(a.memories.includes(moment.description)&&b.memories.includes(moment.description));
 assert.equal(s.events.filter(e=>e.type==='support').length,1);
 assert.ok(validateHouse(s));
});
test('socially relevant goal progress advances through a real scene, without inventing a model action',()=>{
 const s=makeHouse(),mara=s.actors[0],jun=s.actors[2];
 mara.x=4;mara.y=2;jun.x=4;jun.y=3;
 mara.target=jun.target='f1';
 for(const actor of [s.actors[1],s.actors[3]])actor.lastSocialTick=1;
 const before=[mara.goal.progress,jun.goal.progress];
 advanceHouse(s);
 assert.ok(mara.goal.progress>before[0]);
 assert.ok(jun.goal.progress>before[1]);
 assert.ok(s.events.some(e=>e.type==='social_scene'));
 assert.equal(s.events.some(e=>e.type==='model_choice'),false);
 assert.ok(validateHouse(s));
});
