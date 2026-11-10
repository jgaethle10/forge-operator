import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planTask} from '../public/work-saban/plan/engine.mjs';

const root=new URL('../public/work-saban/',import.meta.url);
const html=fs.readFileSync(new URL('plan/index.html',root),'utf8');
const js=fs.readFileSync(new URL('plan/plan.js',root),'utf8');
const engine=fs.readFileSync(new URL('plan/engine.mjs',root),'utf8');
const landing=fs.readFileSync(new URL('index.html',root),'utf8');

function ids(task){return planTask(task).team.map(role=>role.id);}
test('real input forms a scope/specialist/audit/delivery proposal, not an execution',()=>{
  const p=planTask('Analyze the sales CSV and write a summary with presentation slides');
  assert.deepEqual(p.team.map(x=>x.id),['director','analyst','writer','designer','auditor','coordinator']);
  assert.deepEqual(p.waves,[['director'],['analyst','writer','designer'],['auditor'],['coordinator']]);
  assert.equal(p.state,'proposed_not_running');
  assert.equal(p.execution_started,false);
  assert.equal(p.customer_data_transmitted,false);
  assert.ok(p.team.every(x=>x.state==='proposed_not_running'));
  assert.deepEqual(p.team.filter(x=>x.id==='auditor')[0].depends_on,['analyst','writer','designer']);
});
test('specialists are selected from customer task, never a hardcoded show',()=>{
  assert.deepEqual(ids('Write a reply email about an invoice'),['director','writer','auditor','coordinator']);
  assert.deepEqual(ids('Research a competitor in this market'),['director','researcher','auditor','coordinator']);
  assert.deepEqual(ids('Create an onboarding process and schedule'),['director','operations','auditor','coordinator']);
  assert.deepEqual(ids('Do something useful for my company'),['director','researcher','auditor','coordinator']);
});
test('input is bounded and normalization does not add authority',()=>{
  for(const x of ['', 'short', 'a'.repeat(4001), 'Need to\u0000do something'])
    assert.throws(()=>planTask(x));
  assert.throws(()=>planTask(null));
  const p=planTask('  Analyze monthly sales spreadsheet  ');
  assert.equal(p.task,'Analyze monthly sales spreadsheet');
  assert.ok(p.permission_gates.length>=4);
  assert.equal(p.execution_started,false);
});
test('public site provides one task input and never transmits the task',()=>{
  assert.match(landing,/href="\.\/plan\/"[^>]*>Try planning your task/);
  assert.match(landing,/Join the private pilot/);
  assert.match(html, /id="task" maxlength="4000"/);
  assert.match(html, /id="plan" type="button">Plan my team/);
  assert.match(html, /id="proposal" hidden aria-live="polite"/);
  assert.match(html, /TEAM PROPOSED · NOT RUNNING/);
  assert.match(html, /No AI agents are running/);
  assert.match(html, /No account, upload, AI service or connected worker is used/);
  assert.match(html, /No payment at inquiry/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /font-size:16px;line-height:1.55/);
  assert.match(js, /planTask\(\$\('task'\)\.value\)/);
  assert.match(js, /\.textContent=txt/);
  assert.match(js, /scrollIntoView/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(js, /\$\('plan-text'\)\.select\(\)/);
  assert.doesNotMatch(js+engine, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|navigator\.serviceWorker/i);
  assert.doesNotMatch(html, /<form\b|<input\b|buy\.stripe\.com|<iframe\b/i);
  assert.doesNotMatch(html, /[?&]body=[^"]*(?:task|\$\{|encodedTask)/i);
});
