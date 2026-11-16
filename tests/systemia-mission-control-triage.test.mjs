import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSelectedMissions} from '../public/live/mission-triage.mjs';
import {readFile} from 'node:fs/promises';

const now=Date.parse('2026-11-15T23:50:00Z');
const make=(id,status,minutes=1)=>({
 id:'systemia/'+id,title:'Systemia sample '+id,lane:'execution',status,
 observed_at:new Date(now-minutes*60000).toISOString()
});

test('empty operator selection cannot be treated as whole-system health',()=>{
 const x=summarizeSelectedMissions([],{now});
 assert.equal(x.counts.selected,0);assert.equal(x.counts.attention,0);
 assert.match(x.scope,/SELECTED/);
});
test('local running observation expires after fifteen minutes',()=>{
 const x=summarizeSelectedMissions([make('current','running',14),make('old','running',16)],{now});
 assert.deepEqual(x.counts,{selected:2,attention:1,recent_running:1,recorded_complete:0,stale:1});
 assert.match(x.attention[0].reason,/15 minutes/);
});
test('held, failed, and stale goals rise to review, without paid claims',()=>{
 const x=summarizeSelectedMissions([
  make('done','completed',9000),make('held','held'),make('failed','failed'),
  make('old-ready','admitted',24*60+1)
 ],{now});
 assert.equal(x.counts.recorded_complete,1);assert.equal(x.counts.attention,3);
 assert.equal(x.attention[0].status,'failed');
 assert.equal(x.attention[1].status,'held');
 assert.equal(x.attention[2].status,'admitted');
 assert.doesNotMatch(JSON.stringify(x),/paid|payment\s+verified/i);
});
test('attention queue limits output and rejects invalid selection',()=>{
 const x=summarizeSelectedMissions(Array.from({length:9},(_,i)=>make('held'+i,'held')),{now});
 assert.equal(x.attention.length,6);assert.equal(x.hidden_attention_count,3);
 assert.throws(()=>summarizeSelectedMissions([null],{now}),/invalid/);
 assert.throws(()=>summarizeSelectedMissions(new Array(81).fill(make('a','held')),{now}),/invalid/);
});
test('page renders only text-based local review indicators without write APIs',async()=>{
 const root=new URL('../public/live/',import.meta.url);
 const [html,client,css]=await Promise.all([
  readFile(new URL('mission-control.html',root),'utf8'),
  readFile(new URL('mission-control.mjs',root),'utf8'),
  readFile(new URL('mission-control.css',root),'utf8'),
 ]);
 assert.match(html,/id="missionTriage"/);
 assert.match(html,/EXPLICITLY SELECTED/i);
 assert.match(client,/summarizeSelectedMissions/);
 assert.match(client,/textContent/);
 assert.match(client,/RUNNING CLAIM STALE/);
 assert.doesNotMatch(client,/fetch\([^\n]*method:\s*['"]POST|localStorage|sessionStorage/);
 assert.match(css,/\.triage-board/);
});
