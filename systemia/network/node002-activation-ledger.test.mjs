import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {activationGrantBytes} from './node002-activation-authorization.mjs';
import {admitActivationIntent} from './node002-activation-ledger.mjs';
function fixture(t){
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'activation-ledger-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const file=path.join(directory,'activation-ledger.json'),lock=path.join(directory,'activation.lock');
 const initial={schema:'evercraft.node002.activation-ledger.v1',last_sequence:0,state:'idle'};
 fs.writeFileSync(file,JSON.stringify(initial),{mode:0o600});
 fs.writeFileSync(path.join(directory,'owner-public.pem'),publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 const grant={schema:'evercraft.node002.activation-grant.v1',repository:'jgaethle10/forge-operator',node_id:'evercraft-node002-nextgen',operation:'activate',commit:'a'.repeat(40),phase:'cemetery-restore',sequence:1,rollback_commit:'b'.repeat(40),rollback_phase:'hash-only',stage_grant_sha256:'c'.repeat(64),issued_at:'2026-11-26T18:00:00Z',expires_at:'2026-11-26T18:30:00Z'};
 const staged={schema:'evercraft.node002.release-stage-receipt.v1',state:'staged_not_validated',activation_authorized:false,commit:grant.commit,phase:grant.phase,sequence:1,grant_sha256:grant.stage_grant_sha256};
 const current={healthy:true,node_id:grant.node_id,commit:grant.rollback_commit,phase:grant.rollback_phase};
 const request={directory,grant,signature:sign(null,activationGrantBytes(grant),privateKey).toString('base64'),staged,current,nowMs:Date.parse('2026-11-26T18:10:00Z')};
 return {file,lock,request,initial};
}
test('persists verified intent and rollback identity without execution authority',t=>{
 const f=fixture(t),r=admitActivationIntent(f.request);
 assert.equal(r.execution_authorized,false);
 assert.equal(r.rollback_commit,f.request.current.commit);
 assert.equal(r.state,'verified_intent_pending_reconciliation');
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),r);
 assert.equal(fs.statSync(f.file).mode&0o777,0o600);
 assert.equal(fs.existsSync(f.lock),false);
});
test('pending intent blocks subsequent admission until reconciliation',t=>{
 const f=fixture(t);admitActivationIntent(f.request);
 assert.throws(()=>admitActivationIntent(f.request),/activation_ledger_requires_reconciliation/);
 assert.equal(fs.existsSync(f.lock),false);
});
test('invalid signature preserves prior state and permits retry',t=>{
 const f=fixture(t);
 assert.throws(()=>admitActivationIntent({...f.request,signature:Buffer.alloc(64).toString('base64')}),/activation_signature_denied/);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.initial);
 assert.equal(fs.existsSync(f.lock),false);
 assert.equal(admitActivationIntent(f.request).last_sequence,1);
});
test('existing lock and missing ledger fail closed',t=>{
 const f=fixture(t);fs.writeFileSync(f.lock,'held',{mode:0o600});
 assert.throws(()=>admitActivationIntent(f.request),/EEXIST/);
 assert.equal(fs.readFileSync(f.lock,'utf8'),'held');
 fs.unlinkSync(f.lock);fs.unlinkSync(f.file);
 assert.throws(()=>admitActivationIntent(f.request),/ENOENT/);
 assert.equal(fs.existsSync(f.file),false);
});
test('insecure ledger permissions rejected',t=>{
 const f=fixture(t);fs.chmodSync(f.file,0o644);
 assert.throws(()=>admitActivationIntent(f.request),/activation_file_invalid/);
 assert.equal(fs.existsSync(f.lock),false);
});
