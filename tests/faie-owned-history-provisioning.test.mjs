import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reconcileFaieOwnedHistory} from '../scripts/provision-faie-owned-history.mjs';

function withFixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'faie-owned-history-'));
  const envPath=path.join(root,'fabric.env');
  const stateDir=path.join(root,'owned','faie');
  fs.writeFileSync(envPath,'EXISTING_SECRET=do-not-touch\nOTHER=value\n',{mode:0o600});
  const args={envPath,stateDir,uid:process.getuid(),gid:process.getgid()};
  try{return fn(args);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('requires dry run to avoid writes; installs dedicated private durable history once',()=>{
  withFixture(args=>{
    const before=fs.readFileSync(args.envPath,'utf8');
    const preview=reconcileFaieOwnedHistory(args);
    assert.equal(preview.state,'provision_required');
    assert.equal(fs.existsSync(args.stateDir),false);
    assert.equal(fs.readFileSync(args.envPath,'utf8'),before);
    const first=reconcileFaieOwnedHistory({...args,apply:true});
    assert.equal(first.environment_updated,true);
    assert.equal(first.directory_created,true);
    const content=fs.readFileSync(args.envPath,'utf8');
    assert.ok(content.includes('EXISTING_SECRET=do-not-touch\n'));
    assert.ok(content.includes('FAIE_EDGE_STATE_DIR='+args.stateDir+'\n'));
    assert.equal(fs.statSync(args.stateDir).mode&0o777,0o700);
    assert.equal(fs.statSync(args.envPath).mode&0o777,0o600);
    const second=reconcileFaieOwnedHistory({...args,apply:true});
    assert.equal(second.environment_updated,false);
    assert.equal(second.state,'existing_owned_location_preserved');
    assert.equal(fs.readFileSync(args.envPath,'utf8'),content);
  });
});
test('honors a preconfigured owner-controlled state path without replacing or deleting its data',()=>{
  withFixture(args=>{
    const other=path.join(path.dirname(args.envPath),'previous-owned-history');
    fs.mkdirSync(other,{mode:0o700});
    fs.writeFileSync(path.join(other,'precious-history.sqlite'),'do-not-move');
    fs.appendFileSync(args.envPath,'FAIE_EDGE_STATE_DIR='+other+'\n');
    const r=reconcileFaieOwnedHistory({...args,apply:true});
    assert.equal(r.environment_updated,false);
    assert.equal(r.directory_created,false);
    assert.equal(fs.existsSync(args.stateDir),false);
    assert.equal(fs.readFileSync(path.join(other,'precious-history.sqlite'),'utf8'),'do-not-move');
  });
});
test('refuses a duplicate environment key, symlinked state, or wrong owner instead of downgrading archival safety',()=>{
  withFixture(args=>{
    fs.appendFileSync(args.envPath,'FAIE_EDGE_STATE_DIR=/one\nFAIE_EDGE_STATE_DIR=/two\n');
    assert.throws(()=>reconcileFaieOwnedHistory({...args,apply:true}),/duplicate/);
    assert.equal(fs.existsSync(args.stateDir),false);
  });
  withFixture(args=>{
    fs.mkdirSync(path.dirname(args.stateDir));
    fs.symlinkSync(path.dirname(args.envPath),args.stateDir);
    assert.throws(()=>reconcileFaieOwnedHistory({...args,apply:true}),/unsafe/);
    assert.ok(!fs.readFileSync(args.envPath,'utf8').includes('FAIE_EDGE_STATE_DIR'));
  });
  withFixture(args=>{
    fs.mkdirSync(path.dirname(args.stateDir));
    fs.mkdirSync(args.stateDir,{mode:0o000});
    assert.throws(()=>reconcileFaieOwnedHistory({...args,apply:true}),/access_unverified/);
  });
});
test('will not invent an environment or write through a symlinked config file',()=>{
  withFixture(args=>{
    fs.rmSync(args.envPath);
    assert.throws(()=>reconcileFaieOwnedHistory({...args,apply:true}),/existing_fabric_env_required/);
  });
  withFixture(args=>{
    const original=fs.readFileSync(args.envPath,'utf8');
    const real=path.join(path.dirname(args.envPath),'real.env');
    fs.renameSync(args.envPath,real);
    fs.symlinkSync(real,args.envPath);
    assert.throws(()=>reconcileFaieOwnedHistory({...args,apply:true}),/existing_fabric_env_required/);
    assert.equal(fs.readFileSync(real,'utf8'),original);
  });
});

test('resident updater and fresh installer require FAIE private archive without weakening release gates',()=>{
  const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  const installer=fs.readFileSync('scripts/install-fabric-owned-edge.sh','utf8');
  const releaseGate=fs.readFileSync('.github/workflows/faie-agnormal-launch-gate.yml','utf8');
  assert.match(updater,/ensure_faie_owned_history_state/);
  assert.match(updater,/FAIE_HISTORY_ENV_CHANGED/);
  assert.match(updater,/fabric\.env\.before-faie-history/);
  assert.match(updater,/rollback "faie_owned_history_state_hold"/);
  assert.match(updater,/restore_edge_attestation_env/);
  assert.match(installer,/provision-faie-owned-history\.mjs/);
  assert.match(installer,/--confirm-owned-host/);
  assert.match(releaseGate,/faie-land-history-live-acceptance\.mjs/);
  assert.match(releaseGate,/OWNED_SOURCE_LINKED_LAND_HISTORY_VERIFIED/);
});
