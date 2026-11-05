import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyPublicEvidence,parseOperatorSnapshot,SNAPSHOT_SCHEMA} from '../public/live/mission-source.mjs';

const base=new URL('../public/live/',import.meta.url);
const [html,css,client]=await Promise.all([
  readFile(new URL('mission-control.html',base),'utf8'),
  readFile(new URL('mission-control.css',base),'utf8'),
  readFile(new URL('mission-control.mjs',base),'utf8'),
]);
const t=Date.parse('2026-11-05T06:00:00.000Z');
const url='https://github.com/jgaethle10/forge-operator/';
const fixture={
  schema:SNAPSHOT_SCHEMA,exported_at:'2026-11-05T05:59:00.000Z',
  missions:[{
    id:'payments/checkout-001',title:'Confirm buyer checkout path',
    lane:'revenue',status:'held',observed_at:'2026-11-05T05:50:00.000Z',
    owner:'Systemia',note:'A review is not an authorization',
    public_receipt_url:url+'pull/1524'
  }]
};
test('classifies public reviews and CI without treating them as actual payments or node telemetry',()=>{
  const items=[
    {kind:'PULL REQUEST',title:'Evercraft Payments merchant checkout bridge',url:url+'pull/1524',state:'DRAFT REVIEW'},
    {kind:'PULL REQUEST',title:'Node002 Fabric admission checks',url:url+'pull/1590',state:'OPEN REVIEW'},
    {kind:'VERIFICATION',title:'CI unit tests',url:url+'actions/runs/12345',state:'PASSED'}
  ];
  const lanes=classifyPublicEvidence(items);
  assert.equal(lanes.revenue.length,1);
  assert.equal(lanes.infrastructure.length,1);
  assert.equal(lanes.execution.length,1);
  assert.equal(lanes.approvals.length,2);
  assert.equal(classifyPublicEvidence([{kind:'PULL REQUEST',title:'Checkout',url:'https://evil.example/bad',state:'OPEN REVIEW'}]).revenue.length,0);
});
test('local import validates schema, lane, state, timestamps and duplicate identities',()=>{
  const r=parseOperatorSnapshot(fixture,t);
  assert.equal(r.missions.length,1);
  assert.equal(r.authority,'OPERATOR-REPORTED / UNVERIFIED');
  assert.equal(r.missions[0].provenance,'OPERATOR IMPORT · UNVERIFIED');
  for(const mod of [
    {schema:'faked.schema'},
    {missions:[{...fixture.missions[0],lane:'superuser'}]},
    {missions:[{...fixture.missions[0],status:'authorized'}]},
    {missions:[fixture.missions[0],fixture.missions[0]]},
    {exported_at:'2026-11-06T02:00:00Z'},
    {missions:[{...fixture.missions[0],observed_at:'2026-11-06T02:00:00Z'}]},
  ])assert.throws(()=>parseOperatorSnapshot({...fixture,...mod},t));
});
test('operator text cannot become HTML or off-repo receipt links',()=>{
  const m={...fixture.missions[0],title:'<img src=x onerror=alert(1)> Mission',note:'<script>evil()</script>',
    public_receipt_url:'https://example.net/private-receipt'};
  const parsed=parseOperatorSnapshot({...fixture,missions:[m]},t).missions[0];
  assert.doesNotMatch(parsed.title,/[<>]/);
  assert.doesNotMatch(parsed.note,/[<>]/);
  assert.equal(parsed.public_receipt_url,'');
});
test('mission console is local-only for private snapshots, read-only, and mobile usable',()=>{
  assert.match(html,/Evercraft Payments|EVERCRAFT PAYMENTS/);
  assert.match(html,/CHECKOUT UNKNOWN/);
  assert.match(html,/HEALTH UNKNOWN/);
  assert.match(html,/type="module" src="\.\/mission-control\.mjs"/);
  assert.match(html,/connect-src https:\/\/api\.github\.com/);
  assert.match(html,/No private mission data transmitted/);
  assert.match(client,/file\.text\(\)/);
  assert.match(client,/parseOperatorSnapshot/);
  assert.match(client,/fetch\(API\+path/);
  assert.match(client,/sourceStatus\('PUBLIC SOURCE UNAVAILABLE'/);
  assert.match(client,/textContent/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|sendBeacon|XMLHttpRequest|postMessage/);
  assert.doesNotMatch(html,/<iframe|<script>(?![\s\S]*<\/script>)|base44/i);
  assert.match(css,/@media\(max-width:640px\)/);
});
