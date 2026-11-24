import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  SCHEMA,createSeedPlan,normalizeCandidate,calculateDiff,makeProposal,decideProposal
} from '../systemia/events/reignite-layout-engine.mjs';
import {createQuickSuggestion,IDEAS,PLACES} from '../public/reignite/layout/quick-idea.mjs';

test('historic envelope backed by museum reference, not a fabricated venue plan',()=>{
 const plan=createSeedPlan();
 assert.equal(plan.schema,SCHEMA);
 assert.equal(plan.envelope.length_ft,1072);
 assert.equal(plan.envelope.width_ft,296);
 assert.equal(plan.envelope.precision,'published_historic_dimensions_only');
 assert.equal(plan.basis,'conceptual_not_as_built');
 assert(plan.survey_missing.some(s=>s.includes('roof repairs')));
 assert(plan.survey_missing.some(s=>s.includes('parking')));
 assert(plan.zones.every(z=>z.stage==='idea'));
 assert(plan.zones.every(z=>z.capacity===null&&z.source_ref===''));
 const staticSeed=JSON.parse(readFileSync(new URL('../public/reignite/layout/seed.json',import.meta.url),'utf8'));
 assert.deepEqual(staticSeed,plan,'Static/offline and private-server plans must start identical');
});

test('proposals are detailed diffs, never direct mutations or permissions',()=>{
 const base=createSeedPlan();
 const modified=structuredClone(base);
 modified.zones[0].x=.28;
 modified.zones[0].notes='Change candidate placement subject to an actual museum site survey.';
 const p=makeProposal(base,modified,{actor_ref:'invited artist',reason:'Move proposed acoustic dome closer to the conceptual center.',base_revision:0});
 assert.equal(p.status,'pending');
 assert.equal(p.changes[0].kind,'edited');
 assert(p.changes[0].fields.includes('x'));
 assert.equal(base.zones[0].x,.22,'Base must stay unchanged');
 const approved=decideProposal(base,p,{decision:'approve_for_planning',reviewer_ref:'Evercraft owner',review_note:'Concept layout review, NOT venue approval'});
 assert.equal(approved.plan.revision,1);
 assert.equal(approved.plan.zones[0].x,.28);
 assert.equal(approved.receipt.event_approved,false);
 assert.equal(approved.receipt.venue_authorized,false);
 assert.equal(approved.receipt.source_only_planning,true);
 assert.equal(approved.proposal.status,'merged_for_planning');
});

test('invalid geometry, claims of authority and protected source edits fail closed',()=>{
 const base=createSeedPlan();
 for(const mutate of [
  p=>p.zones[0].x=.99,
  p=>p.zones[0].w=-.01,
  p=>p.zones[0].stage='approved',
  p=>p.zones[0].source_ref='fake',
  p=>p.envelope.length_ft=2000,
  p=>p.survey_missing=[],
  p=>p.zones.push({...p.zones[0]}),
  p=>p.event_approved=true,
 ]){
  const candidate=structuredClone(base);mutate(candidate);
  // An evidence-only note change is allowed; all other mutations must fail.
  if(candidate.zones[0].source_ref==='fake'&&
     candidate.zones[0].x===base.zones[0].x) {
      assert.equal(normalizeCandidate(base,candidate).zones[0].source_ref,'fake');
      continue;
  }
  assert.throws(()=>normalizeCandidate(base,candidate));
 }
});

test('stale review cannot overwrite someone else; rejection preserves revision',()=>{
 const base=createSeedPlan(),candidate=structuredClone(base);
 candidate.zones[1].x+=.03;
 const p=makeProposal(base,candidate,{actor_ref:'zone reviewer',reason:'Shift gallery concept for a second review.',base_revision:0});
 assert.throws(()=>makeProposal({...base,revision:1},candidate,{actor_ref:'reviewer',reason:'Anything over twelve chars.',base_revision:0}),/revision_conflict/);
 const newer={...base,revision:1};
 assert.throws(()=>decideProposal(newer,p,{decision:'approve_for_planning',reviewer_ref:'Evercraft owner',review_note:'Review is stale'}),/revision_conflict/);
 const rejected=decideProposal(newer,p,{decision:'reject',reviewer_ref:'Evercraft owner',review_note:'Needs current venue drawings'});
 assert.equal(rejected.plan.revision,1);
 assert.equal(rejected.proposal.status,'rejected');
 assert.equal(rejected.receipt.event_approved,false);
 assert.throws(()=>decideProposal(base,rejected.proposal,{decision:'reject',reviewer_ref:'Evercraft owner',review_note:'Repeated decision'}),/proposal_not_pending/);
});


test('one-minute contributor idea needs no geometry or engineering knowledge',()=>{
 const base=createSeedPlan();
 const suggestion=createQuickSuggestion(base,{
   kind:'art',name:'Community photography wall',
   place:'unsure',description:'A gallery of multigenerational Hangar B family photographs.'
 },'zone-abcdef1234567890');
 assert.equal(suggestion.zone.name,'Community photography wall');
 assert.equal(suggestion.zone.category,'visual_art');
 assert.equal(suggestion.zone.stage,'needs_site_survey');
 assert.equal(suggestion.zone.capacity,null);
 assert.equal(suggestion.zone.source_ref,'');
 assert.equal(suggestion.zone.map,'campus');
 assert.match(suggestion.zone.notes,/marker is only a placement suggestion/);
 assert.equal(base.zones.length+1,suggestion.candidate.zones.length);
 assert.equal(suggestion.candidate.event_approved,undefined);
 assert.deepEqual(normalizeCandidate(base,suggestion.candidate).zones,suggestion.candidate.zones);
 assert(suggestion.reason.length>=12);
 assert.throws(()=>createQuickSuggestion(base,{kind:'art',name:'Short',place:'interior',description:'too short'},'zone-abcdef1234567890'),/short_description_required/);
 assert.throws(()=>createQuickSuggestion(base,{kind:'fake',name:'A real name',place:'interior',description:'This would be an idea'},'zone-abcdef1234567890'),/choose_kind_and_place/);
 assert.equal(Object.keys(IDEAS).length,7);
 assert.equal(Object.keys(PLACES).length,3);
});

test('web UI is editable but truthful about the missing current survey and unlaunched review service',()=>{
 const page=readFileSync(new URL('../public/reignite/layout/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/reignite/layout/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/reignite/layout/app.css',import.meta.url),'utf8');
 const main=readFileSync(new URL('../public/reignite/index.html',import.meta.url),'utf8');
 assert.match(page,/NOT AN APPROVED SITE MAP/);
 assert.match(page,/not a real survey/);
 assert.match(page,/Submit for owner review/);
 assert.match(page,/Private editor \/ owner key/);
 assert.match(page,/What would you love to bring\?/);
 assert.match(page,/id="quickIdeaForm"/);
 assert.match(page,/id="quickSend"/);
 assert.match(page,/Show advanced layout tools/);
 assert.match(js,/createQuickSuggestion/);
 assert.match(js,/quickExport/);
 assert.match(css,/body:not\(\.advanced-open\)/);
 assert.match(js,/\/api\/proposals/);
 assert.match(js,/\/api\/review\//);
 assert.match(js,/Local concept mode/);
 assert.match(main,/\.\/layout\//);
 assert.doesNotMatch(page,/<script(?![^>]*src=)/i);
 assert.doesNotMatch(js,/localStorage|document\.cookie|gtag\(/i);
 assert.match(css,/\.zone-selected/);
});

test('owner-run loopback HTTP: invited edits -> owner review -> planning revision only',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'reignite-review-'));
 const file=new URL('../systemia/events/reignite-layout-server.mjs',import.meta.url);
 const port=25000+Math.floor(Math.random()*20000);
 const env={...process.env,REIGNITE_LAYOUT_STATE:dir,REIGNITE_LAYOUT_PORT:String(port)};
 let child;
 try{
  const init=execFileSync(process.execPath,[fileURL(file),'init'],{env,encoding:'utf8'});
  const owner=init.match(/Owner key \(store privately; shown once\): (\S+)/)?.[1];
  assert(owner,'owner key present only in local CLI output');
  const invite=execFileSync(process.execPath,[fileURL(file),'invite','Museum reviewer'],{env,encoding:'utf8'});
  const editor=invite.match(/Editor key \(share securely; shown once\): (\S+)/)?.[1];
  const inviteId=invite.match(/Invite ID: (\S+)/)?.[1];
  assert(editor&&inviteId,'editor invite token');
  child=spawn(process.execPath,[fileURL(file),'serve'],{env,stdio:'ignore'});
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)throw Error('server exited during start');
    try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}
    await sleep(45);
  }
  assert(ready,'review service must bind to loopback');
  const call=async(key,url,method='GET',payload,origin=base)=>{
    const res=await fetch(base+url,{method,headers:{
     Host:'127.0.0.1:'+port,
     'x-reignite-key':key,...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{})
    },...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:res.status,data:await res.json()};
  };
  const moduleResponse=await fetch(base+'/quick-idea.mjs');
  assert.equal(moduleResponse.status,200,'guided suggestion module must be served for authenticated browser');
  assert.match(await moduleResponse.text(),/export function createQuickSuggestion/);
  assert.equal((await call('invalid-key','/api/plan')).status,401);
  assert.equal((await call(editor,'/api/reviews')).status,403);
  const first=await call(editor,'/api/plan');
  assert.equal(first.status,200);assert.equal(first.data.role,'editor');assert.equal(first.data.plan.revision,0);
  const candidate=structuredClone(first.data.plan);candidate.zones[0].x=.31;
  const submitted=await call(editor,'/api/proposals','POST',{base_revision:0,candidate,reason:'Adjust the concept for a more practical acoustic area.'});
  assert.equal(submitted.status,201);assert.equal(submitted.data.status,'pending');
  assert.equal(submitted.data.event_approved,false);
  assert.equal((await call(editor,'/api/proposals','POST',{base_revision:0,candidate,reason:'Another submission'},'https://evil.example')).status,403);
  assert.equal((await call(editor,'/api/plan')).data.plan.revision,0,'Editor submission must not change base');
  const inbox=await call(owner,'/api/reviews');
  assert.equal(inbox.status,200);
  const item=inbox.data.proposals.find(p=>p.id===submitted.data.proposal_id);
  assert(item&&item.candidate?.zones[0].x===.31,'owner must inspect actual proposed geometry');
  assert.equal((await call(editor,'/api/review/'+item.id,'POST',{decision:'approve_for_planning',review_note:'Cannot do this'})).status,403);
  const merged=await call(owner,'/api/review/'+item.id,'POST',{decision:'approve_for_planning',review_note:'Accepted for provisional planning only'});
  assert.equal(merged.status,200);assert.equal(merged.data.new_revision,1);
  assert.equal(merged.data.receipt.venue_authorized,false);
  assert.equal((await call(owner,'/api/plan')).data.plan.zones[0].x,.31);
  assert.equal((await call(owner,'/api/review/'+item.id,'POST',{decision:'approve_for_planning',review_note:'Repeat request'})).status,422);
  execFileSync(process.execPath,[fileURL(file),'revoke',inviteId],{env,encoding:'utf8'});
  assert.equal((await call(editor,'/api/plan')).status,401,'revocations must take effect without server restart');
 }finally{
  if(child){child.kill('SIGTERM');await sleep(120);if(child.exitCode===null)child.kill('SIGKILL')}
  rmSync(dir,{recursive:true,force:true});
 }
});
function fileURL(url){return new URL(url).pathname}

test('explicit remote browser origin cannot be insecure or supplied with a path',()=>{
 const server=new URL('../systemia/events/reignite-layout-server.mjs',import.meta.url);
 const probe=origin=>spawnSync(process.execPath,[fileURL(server),'init'],{
  env:{...process.env,REIGNITE_LAYOUT_PUBLIC_ORIGIN:origin},
  encoding:'utf8'
 });
 for(const origin of ['http://event.example','https://event.example/unsafe','https://user:pass@event.example','https://event.example/?token=bad']){
  const output=probe(origin);
  assert.notEqual(output.status,0);
  assert.match(output.stderr,/public_origin_must_be_exact_https_origin/);
 }
});
