import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectFreshBrokerState as inspect}
  from '../systemia/yard/shadow-broker-fresh-state-witness.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-fresh-root-'));
  fs.chmodSync(root,0o700);
  const journal=path.join(root,'shadow-canary-test1234');
  fs.mkdirSync(journal,{mode:0o700});
  return {root,journal,state:path.join(journal,'broker-state')};
}
function witness(v,stage){
  return inspect({nodeRoot:v.root,journalDir:v.journal,stage});
}

test('fresh broker root is absent before submission, empty during and after',()=>{
  const v=fixture();
  try{
    const before=witness(v,'before');
    assert.equal(before.verified,true);
    assert.equal(before.state_absent_before_job,true);
    assert.equal(before.physical_broker_activation_authorized,false);
    fs.mkdirSync(v.state,{mode:0o700});
    for(const phase of ['during','after']){
      const result=witness(v,phase);
      assert.equal(result.verified,true,JSON.stringify(result));
      assert.equal(result.state_directory_empty,true);
      assert.equal(result.file_contents_read,false);
      assert.equal(result.historical_authority_import_proven_absent,false);
      assert.equal(result.independent_public_route_absence_proven,false);
    }
  }finally{fs.rmSync(v.root,{recursive:true,force:true})}
});
test('unexpected state before submission or any file during broker is HOLD',()=>{
  const v=fixture();
  try{
    fs.mkdirSync(v.state,{mode:0o700});
    assert.equal(witness(v,'before').verified,false);
    fs.writeFileSync(path.join(v.state,'control-grants.json'),'{}',
      {mode:0o600});
    const during=witness(v,'during');
    assert.equal(during.verified,false);
    assert.ok(during.hold_reasons.includes('broker_state_not_empty'));
    assert.equal(witness(v,'after').verified,false);
  }finally{fs.rmSync(v.root,{recursive:true,force:true})}
});
test('symlink, world-readable or historical journal identity is HOLD',()=>{
  const v=fixture();
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-broker-outside-'));
  try{
    fs.chmodSync(outside,0o700);
    fs.symlinkSync(outside,v.state);
    assert.equal(witness(v,'during').verified,false);
    fs.unlinkSync(v.state);
    fs.mkdirSync(v.state,{mode:0o700});
    fs.chmodSync(v.journal,0o755);
    assert.equal(witness(v,'during').verified,false);
    fs.chmodSync(v.journal,0o700);
    const fake=path.join(v.root,'remote-broker-resident');
    fs.mkdirSync(fake,{mode:0o700});
    assert.equal(inspect({
      nodeRoot:v.root,journalDir:fake,stage:'before',
    }).verified,false);
  }finally{
    fs.rmSync(v.root,{recursive:true,force:true});
    fs.rmSync(outside,{recursive:true,force:true});
  }
});
test('missing/malformed inputs fail closed and do not imply historical grants were inspected',()=>{
  for(const args of [{}, {stage:'during'}, {nodeRoot:'/does-not-exist',
    journalDir:'/does-not-exist',stage:'during'}]){
    const result=inspect(args);
    assert.equal(result.verified,false);
    assert.equal(result.historical_grants_read,false);
    assert.equal(result.only_fresh_canary_root_examined,true);
    assert.equal(result.physical_broker_activation_authorized,false);
  }
});
