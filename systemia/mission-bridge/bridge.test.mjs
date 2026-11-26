import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {admitMissionRequest,runMissionRequest} from './bridge.mjs';
import {changedMissionIds} from './cli.mjs';

const sample=(overrides={})=>({
  schema:'evercraft.systemia.chat-mission-request.v1',
  mission_id:'signal-public-ingress-20261116-001',
  objective:'Independently inspect the public Signal intake and offer path.',
  route:'signal-public-ingress',mode:'observe',
  requested_at:'2026-11-16T23:00:00.000Z',...overrides
});
const okJson=(obj)=>new Response(JSON.stringify(obj),{status:200,headers:{'content-type':'application/json'}});
test('Systemia admits known read-only specialist, never execution authority',()=>{
  const r=admitMissionRequest(sample());
  assert.equal(r.worker,'github-actions-readonly');
  assert.equal(r.specialist,'systemia.signal-public-edge-observer');
  assert.equal(r.execution_authority_granted,false);
  assert.equal(r.remote_node_access_granted,false);
  assert.equal(r.dispatch_authorized,true);
  assert.equal(r.request_sha256.length,64);
  assert.deepEqual(r.checks,['/health','/offers/signal-brief','/api/signal/readiness']);
});
test('untrusted mission fields cannot mint writes, shells or arbitrary external destinations',()=>{
  for(const bad of [
    {route:'terminal-on-penguin'},
    {mode:'execute'},
    {approval_ref:'human:approved'},
    {authority:'root'},
    {url:'https://example.com'},
    {workflow:'dangerous.yml'},
    {objective:'go\nexecute'},
    {mission_id:'../../secrets'},
    {requested_at:'not-a-time'},
  ])assert.throws(()=>admitMissionRequest(sample(bad)));
});
test('public Signal specialist GETs only fixed-owned URLs and returns bounded honest evidence',async()=>{
  const calls=[];
  const bodies={
    '/health':okJson({ok:true,service:'evercraft-fabric-local',source_release_ref_bound:true,deployment_receipt_bound:true}),
    '/offers/signal-brief':new Response('<h1>Evercraft Payments</h1>Incident Evidence Brief $250',{status:200}),
    '/api/signal/readiness':okJson({schema:'evercraft.signal.intake-readiness.v1',intake_available:true,payment_ready:false,payment_verified:false})
  };
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    return bodies[new URL(url).pathname];
  };
  const r=await runMissionRequest(sample(),{fetchImpl,now:()=>new Date('2026-11-16T23:01:00.000Z')});
  assert.equal(r.state,'observation_complete');
  assert.equal(r.diagnosis,'external_signal_readiness_and_offer_observed');
  assert.equal(r.payment_verified,false);
  assert.equal(r.remote_node_connected,false);
  assert.equal(r.checkout_created,false);
  assert.equal(r.observations.length,3);
  assert.equal(r.observations[2].intake_available,true);
  for(const c of calls){
    assert.ok(c.url.startsWith('https://fabric.systemiacommandcenters.com/'));
    assert.equal(c.opts.method,'GET');assert.equal(c.opts.redirect,'error');
    assert.equal(c.opts.headers.authorization,undefined);
  }
});
test('working offer but unavailable public API is a blocker, never claimed as live',async()=>{
  const r=await runMissionRequest(sample(),{
    fetchImpl:async(url)=>{
      const p=new URL(url).pathname;
      if(p==='/health')return okJson({ok:true,service:'evercraft-fabric-local'});
      if(p==='/offers/signal-brief')return new Response('Evercraft Payments Incident Evidence Brief $250');
      return new Response('Not found',{status:404});
    },
  });
  assert.equal(r.state,'observation_incomplete');
  assert.equal(r.diagnosis,'offer_reachable_api_unverified');
  assert.equal(r.payment_verified,false);
});
test('timeouts and transport failures produce an incomplete receipt, not fabricated green',async()=>{
  const r=await runMissionRequest(sample(),{fetchImpl:async()=>{throw Object.assign(Error('down'),{name:'TimeoutError'})}});
  assert.equal(r.state,'observation_incomplete');
  assert.equal(r.observations.every(v=>v.reason==='TimeoutError'),true);
  assert.equal(r.external_write_performed,false);
});
test('Forge source specialist only hashes fixed, existing files and never reads arbitrary paths',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-mission-source-'));
  try{
    fs.mkdirSync(path.join(tmp,'systemia','control-plane'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'systemia','control-plane','control-plane.mjs'),'export const ok=true;\n');
    const r=await runMissionRequest(sample({route:'forge-source-evidence'}),{rootDir:tmp});
    assert.equal(r.observations.length,4);
    assert.equal(r.observations[0].valid,true);
    assert.equal(r.observations[0].sha256.length,64);
    assert.equal(r.observations[1].valid,false);
    assert.equal(r.state,'observation_incomplete');
    assert.equal(r.remote_node_connected,false);
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('Git diff selection admits only bounded mission manifest names without executing shell',()=>{
  let calls=0;
  const git=(program,args)=>{
    calls++;
    assert.equal(program,'git');assert.deepEqual(args.slice(0,4),['diff','--name-only','HEAD^','HEAD']);
    return 'systemia/mission-bridge/requests/signal-public-ingress-20261116-001.json\n'+
      'systemia/mission-bridge/bridge.mjs\n';
  };
  assert.deepEqual(changedMissionIds({git}),['signal-public-ingress-20261116-001']);
  assert.equal(calls,1);
  assert.throws(()=>changedMissionIds({git:()=> 'systemia/mission-bridge/requests/../../escape.json'}),/unapproved_mission_filename_changed/);
});


test('GEMS specialist admits fixed source-only evidence, never private compute',async()=>{
  const request=sample({mission_id:'gems-research-evidence-20261118-001',
    route:'gems-research-evidence',objective:'Inspect fixed evidence of GEMS submission and research plans.'});
  const admission=admitMissionRequest(request);
  assert.equal(admission.execution_authority_granted,false);
  assert.equal(admission.remote_node_access_granted,false);
  assert.equal(admission.worker,'github-actions-readonly');
  assert.deepEqual(admission.checks,[
    'systemia/mission-bridge/gems/gems-001-evidence.json',
    'systemia/mission-bridge/gems/gems-002-plan.json'
  ]);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-gems-source-'));
  try {
    for(const rel of admission.checks){
      const file=path.join(root,rel);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,'{"source_only":true}\\n');
    }
    const r=await runMissionRequest(request,{rootDir:root,
      fetchImpl:async()=>{throw Error('network must not be called')}});
    assert.equal(r.state,'observation_complete');
    assert.equal(r.diagnosis,'gems_source_evidence_observed_only');
    assert.equal(r.observations.length,2);
    assert.equal(r.observations.every(x=>x.valid&&x.sha256.length===64),true);
    assert.equal(r.external_write_performed,false);
    assert.equal(r.remote_node_connected,false);
    assert.equal(r.live_penguin_execution_verified,false);
    assert.equal(r.payment_verified,false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test('GEMS mission cannot smuggle external authority or arbitrary source paths',()=>{
  for(const change of [{route:'gems-compute-dispatch'},{mode:'execute'},
    {hostname:'nextgen'},{passport_grant:'fake'},{repository_path:'secrets.env'}]){
    assert.throws(()=>admitMissionRequest(sample({
      mission_id:'gems-research-evidence-20261118-001',route:'gems-research-evidence',...change
    })));
  }
});
