import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stageAuthorizedRelease} from './node002-release-stage.mjs';
function fixture(t,patch={}){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'node002-stage-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ledgerDirectory=path.join(root,'ledger'),stageDirectory=path.join(root,'stage');
 for(const dir of [ledgerDirectory,stageDirectory])fs.mkdirSync(dir,{mode:0o700});
 const receipt={schema:'evercraft.node002.release-ledger.v1',state:'authorized_not_staged',activation_authorized:false,last_sequence:1,commit:'a'.repeat(40),phase:'cemetery-restore',grant_sha256:'b'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),...patch};
 fs.writeFileSync(path.join(ledgerDirectory,'ledger.json'),JSON.stringify(receipt),{mode:0o600});
 return {options:{ledgerDirectory,stageDirectory,expectedSequence:1},lock:path.join(ledgerDirectory,'admission.lock'),target:path.join(stageDirectory,receipt.commit)};
}
test('expired authorization stops before network or source writes',t=>{
 const f=fixture(t,{expires_at:'2020-01-01T00:00:00Z'});
 assert.throws(()=>stageAuthorizedRelease(f.options),/stage_authorization_expired/);
 assert.deepEqual(fs.readdirSync(f.options.stageDirectory),[]);
 assert.equal(fs.existsSync(f.lock),false);
});
test('missing expiry fails closed',t=>{
 const f=fixture(t,{expires_at:undefined});
 assert.throws(()=>stageAuthorizedRelease(f.options),/stage_authorization_expired/);
 assert.deepEqual(fs.readdirSync(f.options.stageDirectory),[]);
});
test('incorrect sequence and activation authority rejected',t=>{
 const f=fixture(t);
 assert.throws(()=>stageAuthorizedRelease({...f.options,expectedSequence:2}),/stage_authorization_invalid/);
 const g=fixture(t,{activation_authorized:true});
 assert.throws(()=>stageAuthorizedRelease(g.options),/stage_authorization_invalid/);
});
test('existing target and lock are preserved',t=>{
 const f=fixture(t);
 fs.mkdirSync(f.target);
 fs.writeFileSync(path.join(f.target,'keep'),'unchanged');
 assert.throws(()=>stageAuthorizedRelease(f.options),/stage_target_exists_reconcile/);
 assert.equal(fs.readFileSync(path.join(f.target,'keep'),'utf8'),'unchanged');
 fs.writeFileSync(f.lock,'held',{mode:0o600});
 assert.throws(()=>stageAuthorizedRelease(f.options),/EEXIST/);
 assert.equal(fs.readFileSync(f.lock,'utf8'),'held');
});
