import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
 emptyEvidenceDesk,allowedEvidenceSource,addOwnerEvidence,ownerReadiness
} from '../systemia/events/reignite-evidence.mjs';

const reference='private-ledger:museum/hangar-b-asbuilt-001';
const payload=(revision=0,extra={})=>({
 base_revision:revision,gate_id:'venue_authority',
 source_ref:reference,finding:'submitted',
 note:'Museum permission reference provided for independent owner review.',
 ...extra
});

test('the owner desk always begins with 25 pending gates and no implied approvals',()=>{
 const d=emptyEvidenceDesk(),view=ownerReadiness(d);
 assert.equal(d.revision,0);
 assert.equal(view.summary.requirements,25);
 assert.equal(view.summary.missing,25);
 assert.equal(view.summary.submitted_unverified,0);
 assert.equal(view.summary.independently_approved,0);
 assert.equal(view.next[0].requirement,'venue_authority');
 assert.equal(view.next[1].requirement,'jurisdiction_and_event_hours');
 for(const key of ['event_approved','venue_authorized','ticket_sales_authorized',
                   'charitable_collection_authorized','external_contact_authorized'])
   assert.equal(view[key],false,key);
});

test('owner source reference makes a review packet, never a permit, and history stays immutable',()=>{
 const original=emptyEvidenceDesk();
 const first=addOwnerEvidence(original,payload(),{
  recordedAt:'2026-11-24T22:00:00.000Z'
 });
 assert.equal(original.items.length,0);
 assert.equal(first.desk.revision,1);
 assert.equal(first.desk.items[0].independent_review,'not_verified');
 assert.equal(first.desk.items[0].permission_to_proceed,false);
 assert.equal(first.receipt.permission_to_proceed,false);
 assert.equal(first.receipt.source_status,'submitted_unverified');
 const v=ownerReadiness(first.desk);
 assert.equal(v.summary.missing,24);
 assert.equal(v.summary.submitted_unverified,1);
 assert.equal(v.gates.find(g=>g.gate_id==='venue_authority').status,'submitted_unverified');
 assert.equal(v.gates.find(g=>g.gate_id==='venue_authority').last_report.source_ref,reference);
 assert.equal(v.summary.independently_approved,0);
 assert.equal(v.event_approved,false);
 assert.equal(v.venue_authorized,false);
});

test('unsafe or denied reports remain HOLD even if a later optimistic source is submitted',()=>{
 const a=addOwnerEvidence(emptyEvidenceDesk(),payload(0,{
   finding:'unsafe',note:'Structural concern reported, obtain independent qualified review.'
 })).desk;
 let v=ownerReadiness(a);
 assert.equal(v.summary.reported_holds,1);
 assert.equal(v.next[0].requirement,'venue_authority');
 assert.equal(v.next[0].priority,'stop_and_review');
 const b=addOwnerEvidence(a,payload(1,{
   finding:'submitted',source_ref:'private-ledger:museum/follow-up-002',
   note:'Subsequent information received, not independent safety clearance.'
 })).desk;
 v=ownerReadiness(b);
 assert.equal(v.summary.reported_holds,1,'one optimistic note cannot erase an unsafe finding');
 assert.equal(v.gates.find(g=>g.gate_id==='venue_authority').hold_pending_independent_review,true);
 assert.equal(v.gates.find(g=>g.gate_id==='venue_authority').last_report.finding,undefined);
 assert.equal(v.summary.independently_approved,0);
 assert.equal(v.ticket_sales_authorized,false);
});

test('optional pilot fly-in has its own private review packet without changing core festival count',()=>{
 const initial=ownerReadiness(emptyEvidenceDesk());
 assert.equal(initial.summary.requirements,25);
 assert.equal(initial.gates.length,30);
 const fly=initial.optional_programs.find(p=>p.id==='aviation_fly_in');
 assert(fly);
 assert.equal(fly.status,'concept_only_not_scheduled');
 assert.equal(fly.requirements,5);
 assert.equal(fly.missing,5);
 assert.equal(fly.airport_permission_granted,false);
 assert.equal(fly.pilots_invited,false);
 assert.equal(fly.aircraft_slots_reserved,false);
 assert.equal(fly.airshow_authorized,false);
 assert.match(fly.next_action,/current museum and airport authorities/);
 const recorded=addOwnerEvidence(emptyEvidenceDesk(),{
   base_revision:0,gate_id:'fly_in_sponsor_and_museum_authority',
   source_ref:'https://potb.specialdistrict.org/tillamook-air-museum-announces-partnership-with-vintage-aviation-museum',
   finding:'submitted',
   note:'Port announced a term sheet in August 2026, but event permission and final transfer remain unverified.'
 });
 const after=ownerReadiness(recorded.desk);
 assert.equal(after.summary.requirements,25);
 assert.equal(after.summary.missing,25,'optional fly-in sources must not satisfy general venue permission');
 assert.equal(after.optional_programs[0].source_reports_pending_review,1);
 assert.equal(after.optional_programs[0].missing,4);
 assert.equal(after.optional_programs[0].airport_permission_granted,false);
 const hazard=addOwnerEvidence(recorded.desk,{
   base_revision:1,gate_id:'fly_in_ground_and_attendee_separation',
   source_ref:'private-ledger:airport/synthetic-safety-concern001',
   finding:'unsafe',note:'Synthetic hazard raised for independent airport and fire review before further planning.'
 }).desk;
 const optimistic=addOwnerEvidence(hazard,{
   base_revision:2,gate_id:'fly_in_ground_and_attendee_separation',
   source_ref:'private-ledger:airport/synthetic-follow-up001',
   finding:'submitted',note:'Subsequent information exists but does not clear the previously reported safety concern.'
 }).desk;
 const ready=ownerReadiness(optimistic);
 assert.equal(ready.optional_programs[0].reported_holds,1);
 assert.equal(ready.optional_programs[0].checks.find(x=>x.gate_id==='fly_in_ground_and_attendee_separation').hold_pending_independent_review,true);
 assert.equal(ready.event_approved,false);
});
test('private references, exact revisions and careful notes are required',()=>{
 const d=emptyEvidenceDesk();
 assert(allowedEvidenceSource(reference));
 assert(allowedEvidenceSource('https://www.tillamookair.com/hangar-b/'));
 for(const ref of [
  'https://example.com/doc?token=secret','https://example.com/doc#password',
  'http://example.com','https://user:password@example.com/doc','private-ledger:a',
  '/home/someone/private.pdf','https://localhost:8809/secret'
 ])assert(!allowedEvidenceSource(ref),ref);
 for(const broken of [
  payload(5),payload(0,{gate_id:'unlisted_gate'}),payload(0,{source_ref:'file:///etc/passwd'}),
  payload(0,{note:'fine'}),payload(0,{finding:'independently_approved'}),
  payload(0,{source_ref:'https://site.example/path?secret=abc'})
 ])assert.throws(()=>addOwnerEvidence(d,broken));
 assert.throws(()=>ownerReadiness({...d,revision:1}),/revision_invalid/);
 assert.throws(()=>addOwnerEvidence(d,payload(),{recordedAt:'bad'}),/recorded_time_invalid/);
});


test('simplified owner-only browser view remains hidden without owner authorization',()=>{
 const html=readFileSync(new URL('../public/reignite/layout/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/reignite/layout/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/reignite/layout/app.css',import.meta.url),'utf8');
 assert.match(html,/id="ownerReadinessPanel"[^>]*hidden/);
 assert.match(html,/id="ownerEvidenceForm"/);
 assert.match(html,/id="ownerFlyInSection"/);
 assert.match(js,/ownerFlyInStatus/);
 assert.match(js,/optional_programs/);
 assert.match(css,/\.owner-flyin-list/);
 assert.match(html,/Record a source reference or reported concern/);
 assert.match(html,/ZERO independently approved|Nothing recorded here grants permission/);
 assert.match(js,/\$\('ownerReadinessPanel'\)\.hidden=state\.role!=='owner'/);
 assert.match(js,/api\/owner\/readiness/);
 assert.match(js,/api\/owner\/evidence/);
 assert.match(js,/state\.evidenceRevision/);
 assert.match(js,/showOwnerReadiness\(result\.readiness\)/);
 assert.match(css,/\.owner-actions/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

test('private localhost HTTP enforces owner-only source intake, bounded revisions and server storage',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'reignite-evidence-test-'));
 const file=new URL('../systemia/events/reignite-layout-server.mjs',import.meta.url);
 const port=35500+Math.floor(Math.random()*23000);
 const env={...process.env,REIGNITE_LAYOUT_STATE:dir,REIGNITE_LAYOUT_PORT:String(port)};
 let child=null;
 try{
  const ownerOut=execFileSync(process.execPath,[file.pathname,'init'],{env,encoding:'utf8'});
  const owner=ownerOut.match(/Owner key \(store privately; shown once\): (\S+)/)?.[1];
  assert(owner);
  const editorOut=execFileSync(process.execPath,[file.pathname,'invite','Community artist'],{env,encoding:'utf8'});
  const editor=editorOut.match(/Editor key \(share securely; shown once\): (\S+)/)?.[1];
  assert(editor);
  child=spawn(process.execPath,[file.pathname,'serve'],{env,stdio:'ignore'});
  const origin='http://127.0.0.1:'+port;
  let alive=false;
  for(let i=0;i<90;i++){
   if(child.exitCode!==null)throw Error('private server died during start');
   try{const response=await fetch(origin+'/health');if(response.ok){alive=true;break}}catch{}
   await sleep(40);
  }
  assert(alive,'private owner service must bind to loopback');
  const call=async(key,url,method='GET',data,requestOrigin=origin)=>{
   const res=await fetch(origin+url,{
    method,headers:{'x-reignite-key':key,...(method==='POST'?{
      Origin:requestOrigin,'Content-Type':'application/json'
    }:{})},...(method==='POST'?{body:JSON.stringify(data||{})}:{})
   });
   return {status:res.status,data:await res.json()};
  };
  assert.equal((await call('', '/api/owner/readiness')).status,401);
  assert.equal((await call(editor,'/api/owner/readiness')).status,403);
  assert.equal((await call(editor,'/api/owner/evidence','POST',payload())).status,403);
  const start=await call(owner,'/api/owner/readiness');
  assert.equal(start.status,200);
  assert.equal(start.data.summary.missing,25);
  assert.equal(start.data.event_approved,false);
  assert.equal((await call(owner,'/api/owner/evidence','POST',payload(), 'https://attacker.example')).status,403);
  const recorded=await call(owner,'/api/owner/evidence','POST',payload());
  assert.equal(recorded.status,201);
  assert.equal(recorded.data.receipt.revision,1);
  assert.equal(recorded.data.receipt.permission_to_proceed,false);
  assert.equal(recorded.data.readiness.summary.submitted_unverified,1);
  assert.equal((await call(owner,'/api/owner/evidence','POST',payload())).status,409,
    'stale source submissions must never overwrite the private ledger');
  const unsafe=await call(owner,'/api/owner/evidence','POST',
   payload(1,{finding:'unsafe',note:'Structural issue reported requiring qualified verification.'}));
  assert.equal(unsafe.status,201);
  assert.equal(unsafe.data.readiness.summary.reported_holds,1);
  assert.equal(unsafe.data.readiness.next[0].priority,'stop_and_review');
  const optimistic=await call(owner,'/api/owner/evidence','POST',
   payload(2,{finding:'submitted',note:'Another source is available; the hold still requires a separate qualified review.'}));
  assert.equal(optimistic.status,201);
  assert.equal(optimistic.data.readiness.summary.reported_holds,1);
  assert.equal(optimistic.data.readiness.venue_authorized,false);
  assert.equal((await call(editor,'/api/owner/readiness')).status,403);
  const filePath=join(dir,'readiness-evidence.json');
  assert.equal(statSync(filePath).mode&0o077,0,'private evidence must never be world-readable');
  const stored=JSON.parse(readFileSync(filePath,'utf8'));
  assert.equal(stored.revision,3);
  assert.equal(stored.items.length,3);
  assert(!JSON.stringify(stored).includes(owner),'owner key must never be written into evidence');
 }finally{
  if(child){child.kill('SIGTERM');await sleep(110);if(child.exitCode===null)child.kill('SIGKILL')}
  rmSync(dir,{force:true,recursive:true});
 }
});
