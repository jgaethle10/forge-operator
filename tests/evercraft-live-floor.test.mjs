import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {Script} from 'node:vm';
import {normalizeFloorRuns,STATIONS,stationFor} from '../public/live/floor-source.mjs';

const base=new URL('../public/live/',import.meta.url);
const html=await readFile(new URL('floor.html',base),'utf8');
const css=await readFile(new URL('floor.css',base),'utf8');
const client=await readFile(new URL('floor.mjs',base),'utf8');
const prior=await readFile(new URL('index.html',base),'utf8');
const now=Date.parse('2026-10-24T17:00:00Z');
const repo='https://github.com/jgaethle10/forge-operator/actions/runs/';
const run=(id,name,status,conclusion,mins=3)=>({
 id,name,status,conclusion,html_url:repo+id,
 created_at:new Date(now-mins*60_000).toISOString(),
 updated_at:new Date(now-mins*60_000).toISOString(),
 head_branch:'main',event:'schedule',run_number:id
});

test('floor is a real public-source broadcast surface, not a simulated private agent feed',async()=>{
 assert.match(html,/Evercraft LIVE \| Observable Operations Floor/);
 assert.match(html,/WORK RECEIPTS/);
 assert.match(html,/connect-src https:\/\/api\.github\.com/);
 assert.match(html,/src="\.\/floor\.mjs"/);
 assert.match(prior,/href="\.\/floor\.html"/);
 assert.match(client,/fetch\(API\+'\/actions\/runs\?per_page=100'/);
 assert.match(client,/source.*delayed|SOURCE DELAYED/i);
 assert.match(client,/paint\(state\.lastGood,true\)/);
 assert.doesNotMatch(html,/<iframe|base44\.app|drive\.google\.com/i);
 assert.doesNotMatch(client,/innerHTML|eval\(/);
 for(const f of ['floor.html','floor.css','floor.mjs','floor-source.mjs']){
  assert.ok((await stat(new URL(f,base))).size>700,f);
 }
 assert.doesNotThrow(()=>new Script(client.replace(/^import[^\n]*\n/g,'')));
 assert.ok(css.includes('@media(max-width:640px)'));
 assert.ok(css.includes('#stage.portrait'));
});
test('station categorization and per-source event state remain honest',()=>{
 assert.equal(STATIONS.length,6);
 assert.equal(stationFor('EverMaps solar-over-canal GIS refresh'),'research');
 assert.equal(stationFor('Saban Compute Exchange'),'agents');
 assert.equal(stationFor('Fallen audio render pipeline'),'creative');
 assert.equal(stationFor('CHUM sell-now buyer checkout'),'commerce');
 assert.equal(stationFor('Chromebook public edge network canary'),'infrastructure');
 const feed=normalizeFloorRuns([
  run(111,'KAIDANCE frontier field cycle','in_progress',null,2),
  run(112,'Saban Compute Exchange','queued',null,1),
  run(113,'CHUM buyer door verification','completed','failure',4),
  run(114,'Evercraft Proof Factory','completed','success',5)
 ],now);
 assert.equal(feed.stats.observed,4);
 assert.equal(feed.stats.running,1);
 assert.equal(feed.stats.queued,1);
 assert.equal(feed.stats.failed,1);
 assert.equal(feed.stations.find(x=>x.key==='research').state,'RUNNING');
 assert.equal(feed.stations.find(x=>x.key==='agents').state,'QUEUED');
 assert.equal(feed.stations.find(x=>x.key==='commerce').state,'FAILED');
 assert.equal(feed.stations.find(x=>x.key==='quality').state,'PASSED');
 assert.equal(feed.stations.find(x=>x.key==='creative').state,'NO RECENT RUN');
 assert.ok(feed.events.every(x=>x.url.startsWith(repo)));
});
test('unverified activity cannot be displayed as current running work',()=>{
 const result=normalizeFloorRuns([
  run(211,'Saban Compute Exchange','in_progress',null,50),
  run(212,'CHUM buyer door check','queued',null,55),
  run(213,'Evercraft Proof Factory','completed','success',90),
  run(214,'Exposure of customer credentials','in_progress',null,1),
  {...run(215,'Evercraft Proof Factory','in_progress',null,1),head_branch:'private-secrets'},
  {...run(216,'Evercraft Proof Factory','completed','success',1),html_url:'https://attacker.invalid/actions/runs/216'},
  run(217,'Evercraft Proof Factory','in_progress',null,60*48)
 ],now);
 assert.equal(result.stats.running,0);
 assert.equal(result.stats.queued,0);
 assert.equal(result.events.find(x=>x.id===211)?.state,'UNVERIFIED');
 assert.equal(result.events.find(x=>x.id===212)?.state,'UNVERIFIED');
 assert.equal(result.events.some(x=>[214,215,216,217].includes(x.id)),false);
 assert.equal(result.stations.find(x=>x.key==='agents').state,'UNVERIFIED');
});
test('no receipt is not counted as active work',()=>{
 const result=normalizeFloorRuns([],now);
 assert.equal(result.events.length,0);
 assert.equal(result.stats.running,0);
 assert.equal(result.stats.observed,0);
 assert.ok(result.stations.every(x=>x.state==='NO RECENT RUN'));
});
