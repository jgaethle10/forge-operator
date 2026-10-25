import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { RemoteOperatorGateway, executeRemoteOperatorMcpRpc } from './mcp-gateway.mjs';
import { createRemoteOperatorPassportVerifier, remoteOperatorPermitBinding } from './passport-approval-verifier.mjs';

const OWNER = 'owner:remote-operator-proof';
const NODE = 'evercraft-node002-nextgen';
const CONTROL = 'control_'+'a'.repeat(48);
const CLIENT = 'client_'+'b'.repeat(48);

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-operator-passport-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const passport = new EvercraftPassport({stateDir:path.join(root,'passport')});
  const grant=passport.issueGrant({
    idempotency_key:randomUUID(),
    authority_state:'manual_authorized',
    authority_receipt_ref:'ci-synthetic-not-a-real-owner-approval',
    subject_ref:OWNER,
    issuer_ref:'synthetic-ci-authority',
    product:'evercraft.remote-operator',
    scopes:['remote_operator.remote_exec','remote_operator.remote_write_file'],
    starts_at:new Date(Date.now()-1000).toISOString(),
    ends_at:new Date(Date.now()+600000).toISOString(),
  }).grant;
  const forwarded=[];
  const gateway = new RemoteOperatorGateway({
    capacityEndpoint:'http://127.0.0.1:43210/nodes/'+NODE,
    controlToken:CONTROL,
    clientToken:CLIENT,
    approvalVerifier:createRemoteOperatorPassportVerifier({passport,ownerSubjectRef:OWNER}),
    fetchImpl:async (url, options) => {
      forwarded.push({url,body:JSON.parse(options.body||'null')});
      return new Response(JSON.stringify({ok:true,remote_executed:true}),{status:200});
    },
  });
  const invoke = async (name,args) => executeRemoteOperatorMcpRpc({
    rpc:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},
    authorization:'Bearer '+CLIENT,
    gateway,
  });
  return {passport,grant,gateway,forwarded,invoke};
}
function bind(name,args) {
  return remoteOperatorPermitBinding({
    action:name,root_key:args.root_key??'home',node_id:NODE,
    approval_ref:args.approval_ref,
    payload_sha256:createHash('sha256').update(JSON.stringify(args)).digest('hex'),
  });
}
function permitFor(passport,grant,name,args, overrides={}) {
  const binding=bind(name,args);
  return passport.mintActionPermit({
    idempotency_key:randomUUID(),
    permit_id:binding.permit_id,
    grant_id:grant.grant_id,
    actor_ref:OWNER,
    scope:binding.scope,
    resource_ref:binding.resource_ref,
    request_fingerprint:binding.request_fingerprint,
    ttl_seconds:90,
    ...overrides,
  }).permit;
}
function argsFor(name,root='home'){
  const approval_ref='permit_'+randomUUID();
  return name==='remote_exec'
    ? {root_key:root,program:'git',args:['--version'],approval_ref}
    : {root_key:root,path:'notes.txt',content:'safe contents',approval_ref};
}

test('real owner Passport permits authorize exact remote exec and write once each',async t=>{
  const {passport,grant,forwarded,invoke,gateway}=setup(t);
  assert.equal(gateway.nodeId,NODE);
  for(const name of ['remote_exec','remote_write_file']){
    const args=argsFor(name);
    permitFor(passport,grant,name,args);
    const first=await invoke(name,args);
    assert.equal(first.result.structuredContent.ok,true);
    assert.equal(passport.getActionPermitState(args.approval_ref).consumed,true);
    const before=forwarded.length;
    const replay=await invoke(name,args);
    assert.equal(replay.error.message,'remote_operator_passport_permit_denied');
    assert.equal(forwarded.length,before);
  }
  assert.equal(forwarded.length,2);
});

test('payload edits, root edits and wrong action deny before remote call',async t=>{
  const {passport,grant,forwarded,invoke}=setup(t);
  const original=argsFor('remote_exec');
  permitFor(passport,grant,'remote_exec',original);
  const altered=[{...original,args:['status']},{...original,root_key:'projects'}];
  for(const arg of altered){
    const response=await invoke('remote_exec',arg);
    assert.ok(response.error);
    assert.equal(forwarded.length,0);
  }
  const wrongAction=await invoke('remote_write_file',{root_key:'home',path:'file',content:'hi',approval_ref:original.approval_ref});
  assert.ok(wrongAction.error);
  assert.equal(forwarded.length,0);
  assert.equal(passport.getActionPermitState(original.approval_ref).active,true);
});

test('permit for another node cannot authorize configured gateway node',async t=>{
  const {passport,grant,invoke,forwarded}=setup(t);
  const args=argsFor('remote_exec');
  const different={...bind('remote_exec',args),resource_ref:'node:different/root:home'};
  passport.mintActionPermit({
    idempotency_key:randomUUID(),permit_id:args.approval_ref,
    grant_id:grant.grant_id,actor_ref:OWNER,scope:different.scope,
    resource_ref:different.resource_ref,request_fingerprint:different.request_fingerprint,
    ttl_seconds:90,
  });
  const denied=await invoke('remote_exec',args);
  assert.equal(denied.error.message,'remote_operator_passport_permit_denied');
  assert.equal(forwarded.length,0);
});

test('unauthenticated MCP caller cannot burn a real permit',async t=>{
  const {passport,grant,gateway,forwarded}=setup(t);
  const args=argsFor('remote_exec');
  permitFor(passport,grant,'remote_exec',args);
  const denied=await executeRemoteOperatorMcpRpc({
    rpc:{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'remote_exec',arguments:args}},
    authorization:'Bearer wrong-token',gateway,
  });
  assert.equal(denied.error.code,-32001);
  assert.equal(passport.getActionPermitState(args.approval_ref).active,true);
  assert.equal(forwarded.length,0);
});

test('no implied grant, unknown capacity target, expired or cancelled permits never mutate',async t=>{
  const {passport,grant,invoke,forwarded}=setup(t);
  const absent=argsFor('remote_exec');
  const result=await invoke('remote_exec',absent);
  assert.ok(result.error);
  assert.equal(forwarded.length,0);
  const cancelled=argsFor('remote_exec');
  permitFor(passport,grant,'remote_exec',cancelled);
  passport.cancelActionPermit({permit_id:cancelled.approval_ref,actor_ref:OWNER,idempotency_key:randomUUID()});
  const cancelledResult=await invoke('remote_exec',cancelled);
  assert.equal(cancelledResult.error.message,'remote_operator_passport_permit_denied');
  const noNode=new RemoteOperatorGateway({
    capacityEndpoint:'http://127.0.0.1:43210/unknown',
    controlToken:CONTROL,clientToken:CLIENT,
    approvalVerifier:createRemoteOperatorPassportVerifier({passport,ownerSubjectRef:OWNER}),
    fetchImpl:async()=>{throw Error('must never execute')},
  });
  const withPermit=argsFor('remote_exec');
  permitFor(passport,grant,'remote_exec',withPermit);
  const denied=await executeRemoteOperatorMcpRpc({
    rpc:{jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'remote_exec',arguments:withPermit}},
    gateway:noNode,authorization:'Bearer '+CLIENT,
  });
  assert.equal(denied.error.message,'remote_operator_passport_binding_invalid');
  assert.equal(passport.getActionPermitState(withPermit.approval_ref).active,true);
  assert.equal(forwarded.length,0);
});

test('two concurrent attempts consume exactly once and never double-send',async t=>{
  const {passport,grant,invoke,forwarded}=setup(t);
  const args=argsFor('remote_write_file');
  permitFor(passport,grant,'remote_write_file',args);
  const responses=await Promise.all([invoke('remote_write_file',args),invoke('remote_write_file',args)]);
  assert.equal(responses.filter(x=>x.result?.structuredContent?.ok).length,1);
  assert.equal(responses.filter(x=>x.error).length,1);
  assert.equal(forwarded.length,1);
});
