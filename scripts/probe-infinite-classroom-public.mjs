#!/usr/bin/env node
// Independent online learning-world canary. A committed page is NOT a deployed page.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const input=String(process.argv[2]||process.env.CLASSROOM_PUBLIC_ORIGIN||'').trim();
if(!input.startsWith('https://'))throw Error('verified_https_base_required');
const origin=input.replace(/\/+$/,'');
async function fetchText(path){
 let error;
 for(let attempt=0;attempt<8;attempt++){
  try{
   const response=await fetch(origin+path,{
    redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(12000)
   });
   if(!response.ok)throw Error('HTTP_'+response.status);
   const body=await response.text();
   if(!body)throw Error('empty_body');
   return {response,body};
  }catch(e){error=e;if(attempt<7)await delay(1700)}
 }
 throw Error('unverified_classroom_route_'+path+': '+String(error?.message||error));
}
const play=await fetchText('/apps/infinite-classroom/play/');
assert.match(play.response.headers.get('content-type')||'',/text\/html/);
assert.match(play.body,/INFINITE CLASSROOM/);
assert.match(play.body,/Math Cave/);
assert.match(play.body,/Reading Treehouse/);
assert.match(play.body,/Science Sky Lab/);
assert.match(play.body,/Language Tower/);
assert.match(play.body,/Creative Studio/);
assert.match(play.body,/Calm Meadow/);
assert.match(play.body,/Homework Coach · hints, not answers/);
const match=play.body.match(/<script type="application\/json" id="quest-data">([\s\S]*?)<\/script>/);
assert(match,'structured_quests_missing');
const quests=JSON.parse(match[1]);
assert.equal(quests.length,18);
assert.equal(new Set(quests.map(q=>q.room)).size,6);
assert.doesNotMatch(play.body,/\bfetch\s*\(|https?:\/\/.*base44/i);
const welcome=await fetchText('/apps/infinite-classroom/');
assert.match(welcome.body,/href="\.\/play\/"/);
const short=await fetchText('/infinite-classroom/');
assert.match(short.body,/Enter the classroom/);
const proof={
 schema:'evercraft.infinite-classroom.public-learning-worlds-canary.v1',
 state:'VERIFIED_OWNED_SOURCE_PUBLIC_FALLBACK',
 public_route:origin+'/apps/infinite-classroom/play/',
 mission_count:quests.length,
 room_count:6,
 adult_auth_required:false,
 payment_required:false,
 privacy_note:'HTTP and source probes cannot substitute for independent manual interaction, teacher-quality review or a private owned-runtime cutover.'
};
console.log(JSON.stringify(proof,null,2));
